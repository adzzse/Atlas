import { afterEach, describe, expect, test, vi } from 'vitest'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import vm from 'vm'

const execPath = 'D:/Games/Rhapsody/大侠狂想曲/大侠狂想曲.exe'
const source = fs.readFileSync(path.join(__dirname, '../electron/ipc/games.js'), 'utf8')
const pageSource = fs.readFileSync(path.join(__dirname, '../src/components/detail/GameDetailPage.jsx'), 'utf8')

// Load the real launcher while keeping process events and personal-data writes
// under test control; a Windows CreateProcess elevation failure is asynchronous.
function loadLauncher({ platform = 'win32', spawnError, shellError = '', emulator = null } = {}) {
  const child = new EventEmitter()
  child.unref = vi.fn()
  const spawn = vi.fn(() => {
    queueMicrotask(() => child.emit(spawnError ? 'error' : 'spawn', spawnError))
    return child
  })
  const openPath = vi.fn(async () => shellError)
  const recordGamePlaytime = vi.fn(async () => {})
  const events = []
  const handlers = new Map()
  const module = { exports: {} }
  vm.runInNewContext(source, {
    module, exports: module.exports,
    process: { platform, env: {} }, console: { log: vi.fn(), error: vi.fn() },
    setTimeout, clearTimeout,
    require(request) {
      if (request === 'path') return path
      if (request === 'events') return { once: require('events').once }
      if (request === 'fs') return { existsSync: () => true }
      if (request === 'child_process') return { spawn }
      if (request === 'electron') return {
        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
        BrowserWindow: { getAllWindows: () => [{
          isDestroyed: () => false, webContents: { send: (...args) => events.push(args) },
        }] },
        shell: { openPath },
      }
      if (request === '../db/games') return { recordGameLaunchStarted: vi.fn(async () => {}), recordGamePlaytime }
      if (request === '../db/settings') return { getEmulatorForFile: async () => emulator }
      if (request === '../launchEnv') return {
        sanitizeChildEnv: env => env,
        resolveLinuxLaunch: () => ({ command: execPath, args: [] }),
        resolveEmulatorLaunch: () => ({ command: 'wrapper', args: [execPath] }),
      }
      return {}
    },
  }, { filename: 'electron/ipc/games.js' })
  module.exports.registerGamesHandlers({
    getTrustedVersion: async () => ({ exec_path: execPath, version: 'v1' }),
  })
  return {
    launch: (extension = 'exe') => module.exports.launchGame({
      execPath, gamePath: path.dirname(execPath), extension, recordId: 37, version: 'v1',
    }),
    launchIpc: () => handlers.get('launch-game')({}, { recordId: 37, version: 'v1' }),
    child, spawn, openPath, events, recordGamePlaytime,
  }
}

// Exercise the page's actual callback without mounting its unrelated media,
// catalog and import panels; its dependencies are the same closure bindings.
function loadPlayButton(launchGame) {
  const start = pageSource.indexOf('const launchSelectedGame = async () => {')
  const end = pageSource.indexOf('\n  }', start) + 4
  const setLaunchState = vi.fn()
  const setLaunchError = vi.fn()
  const isRunningRef = { current: false }
  const launch = vm.runInNewContext(`(${pageSource.slice(start, end).replace('const launchSelectedGame = ', '')})`, {
    canLaunch: true, launchState: 'idle', LAUNCH_STATE: { IDLE: 'idle', LAUNCHING: 'launching', RUNNING: 'running' },
    closedDuringLaunchRef: { current: false }, isRunningRef,
    setLaunchState, setLaunchError, console: { error: vi.fn() },
    window: { electronAPI: { launchGame } }, game: { record_id: 37 }, actionVersion: { version: 'v1' },
  })
  return { launch, setLaunchState, setLaunchError, isRunningRef }
}

afterEach(() => vi.useRealTimers())

describe('Windows game launch', () => {
  test('opens the Windows UAC path when an EXE spawn reports EACCES', async () => {
    vi.useFakeTimers()
    const launcher = loadLauncher({ spawnError: Object.assign(new Error('requires elevation'), { code: 'EACCES' }) })
    await launcher.launch()
    expect(launcher.openPath).toHaveBeenCalledExactlyOnceWith(execPath)
    expect(launcher.events.filter(([channel]) => channel === 'game-run-state').at(-1)[1]).toMatchObject({ running: true, tracked: false })
    expect(launcher.recordGamePlaytime).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(20000)
    expect(launcher.events.at(-1)[1]).toMatchObject({ running: false, tracked: false })
  })

  test('reports a cancelled or failed shell launch through IPC', async () => {
    const launcher = loadLauncher({ spawnError: Object.assign(new Error('requires elevation'), { code: 'EACCES' }), shellError: 'Failed to open path' })
    expect(await launcher.launchIpc()).toMatchObject({ success: false, error: expect.stringContaining('Failed to open path') })
    expect(launcher.events.filter(([channel]) => channel === 'game-run-state').at(-1)[1].running).toBe(false)
  })

  test('propagates other asynchronous spawn failures without opening the shell', async () => {
    const launcher = loadLauncher({ spawnError: Object.assign(new Error('executable disappeared'), { code: 'ENOENT' }) })
    await expect(launcher.launch()).rejects.toThrow('executable disappeared')
    expect(launcher.openPath).not.toHaveBeenCalled()
    expect(launcher.recordGamePlaytime).not.toHaveBeenCalled()
  })

  test('keeps normal EXE launches tracked and finalizes playtime only once', async () => {
    vi.useFakeTimers()
    const launcher = loadLauncher()
    await launcher.launch()
    expect(launcher.openPath).not.toHaveBeenCalled()
    expect(launcher.spawn).toHaveBeenCalledWith(execPath, [], expect.objectContaining({ cwd: path.dirname(execPath), shell: false }))
    await vi.advanceTimersByTimeAsync(1000)
    launcher.child.emit('exit', 0)
    launcher.child.emit('close', 0)
    expect(launcher.recordGamePlaytime).toHaveBeenCalledTimes(1)
    expect(launcher.events.filter(([channel]) => channel === 'game-run-state').at(-1)[1]).toMatchObject({ running: false, tracked: true })
  })

  test.each([
    ['Linux', { platform: 'linux' }, 'exe'],
    ['configured wrappers', { emulator: {} }, 'exe'],
    ['batch scripts', {}, 'bat'],
  ])('does not apply Windows EXE fallback to %s', async (_name, options, extension) => {
    const launcher = loadLauncher({ ...options, spawnError: Object.assign(new Error('permission denied'), { code: 'EACCES' }) })
    await expect(launcher.launch(extension)).rejects.toThrow('permission denied')
    expect(launcher.openPath).not.toHaveBeenCalled()
  })
})

describe('Play button launch feedback', () => {
  test('shows an IPC failure and leaves Play available for retry', async () => {
    const button = loadPlayButton(async () => ({ success: false, error: 'Failed to open path' }))
    await button.launch()
    expect(button.setLaunchError).toHaveBeenLastCalledWith('Failed to open path')
    expect(button.setLaunchState).toHaveBeenLastCalledWith('idle')
    expect(button.isRunningRef.current).toBe(false)
    expect(pageSource).toContain('open={Boolean(launchError)}')
    expect(pageSource).toContain('body={launchError}')
  })

  test('shows a rejected IPC error', async () => {
    const button = loadPlayButton(async () => { throw new Error('IPC unavailable') })
    await button.launch()
    expect(button.setLaunchError).toHaveBeenLastCalledWith('IPC unavailable')
    expect(button.setLaunchState).toHaveBeenLastCalledWith('idle')
  })

  test('clears a previous launch error when retrying successfully', async () => {
    const button = loadPlayButton(async () => ({ success: true }))
    await button.launch()
    expect(button.setLaunchError).toHaveBeenCalledWith('')
    expect(button.setLaunchState).toHaveBeenLastCalledWith('running')
  })
})
