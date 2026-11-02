import { expect, test, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'

// A queued caption request must retain its sender even after another window activates.
const loadHandlers = () => {
  const filename = path.join(__dirname, '../electron/ipc/windows.js')
  const require_ = createRequire(filename)
  const handlers = new Map()
  const focused = { minimize: vi.fn(), maximize: vi.fn(), isMaximized: () => false }
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, process, console,
    require: (name) => name === 'electron' ? {
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      BrowserWindow: { getFocusedWindow: () => focused, fromWebContents: (sender) => sender.window },
    } : name === './games' || name === '../utils/browserDetect' ? {} : require_(name),
  })
  module.exports({})
  return { handlers, focused }
}

test.each(['minimize', 'maximize'])('%s targets the IPC sender after focus moves elsewhere', (action) => {
  const { handlers, focused } = loadHandlers()
  const sender = { isDestroyed: () => false, isMaximized: () => false, [action]: vi.fn() }
  handlers.get(`${action}-window`)({ sender: { window: sender } })
  expect(sender[action]).toHaveBeenCalledOnce()
  expect(focused[action]).not.toHaveBeenCalled()
})

test('maximize restores an already maximized sender, not the focused window', () => {
  const { handlers, focused } = loadHandlers()
  const sender = { isDestroyed: () => false, isMaximized: () => true, unmaximize: vi.fn() }
  handlers.get('maximize-window')({ sender: { window: sender } })
  expect(sender.unmaximize).toHaveBeenCalledOnce()
  expect(focused.maximize).not.toHaveBeenCalled()
})

test.each([null, { isDestroyed: () => true }])('caption requests ignore a missing or destroyed sender: %j', (window) => {
  const { handlers, focused } = loadHandlers()
  handlers.get('minimize-window')({ sender: { window } })
  handlers.get('maximize-window')({ sender: { window } })
  expect(focused.minimize).not.toHaveBeenCalled()
  expect(focused.maximize).not.toHaveBeenCalled()
})

test.each([true, false])('initial window state is read from the sender: maximized=%s', (maximized) => {
  const { handlers } = loadHandlers()
  const window = { isDestroyed: () => false, isMaximized: () => maximized }
  expect(handlers.get('get-window-state')({ sender: { window } })).toBe(maximized ? 'maximized' : 'normal')
})

test('initial state query returns no state after the sender closes', () => {
  const { handlers } = loadHandlers()
  expect(handlers.get('get-window-state')({ sender: { window: null } })).toBeNull()
})

// Exercise the existing bridge rather than duplicating its initial-state/race logic.
const loadPreload = (invoke = vi.fn().mockResolvedValue('maximized')) => {
  const ipcRenderer = Object.assign(new EventEmitter(), { invoke })
  let api
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/preload.js'), 'utf8'), {
    require: () => ({ ipcRenderer, contextBridge: { exposeInMainWorld: (name, value) => { if (name === 'electronAPI') api = value } } }),
    process: { platform: 'win32' }, console,
  })
  return { api, ipcRenderer }
}

test.each(['maximized', 'normal'])('a reloaded renderer receives current native state: %s', async (state) => {
  const invoke = vi.fn().mockResolvedValue(state)
  const { api } = loadPreload(invoke)
  const callback = vi.fn()
  api.onWindowStateChanged(callback)
  await Promise.resolve()
  expect(invoke).toHaveBeenCalledWith('get-window-state')
  expect(callback).toHaveBeenCalledWith(state)
})

test('a delayed initial snapshot cannot overwrite a newer native event', async () => {
  let resolve
  const { api, ipcRenderer } = loadPreload(vi.fn(() => new Promise((done) => { resolve = done })))
  const callback = vi.fn()
  api.onWindowStateChanged(callback)
  ipcRenderer.emit('window-state-changed', {}, 'normal')
  resolve('maximized')
  await Promise.resolve()
  expect(callback).toHaveBeenCalledExactlyOnceWith('normal')
})

test('legacy listener cleanup also cancels a pending initial snapshot', async () => {
  let resolve
  const { api } = loadPreload(vi.fn(() => new Promise((done) => { resolve = done })))
  const callback = vi.fn()
  api.onWindowStateChanged(callback)
  api.removeAllListeners('window-state-changed')
  resolve('maximized')
  await Promise.resolve()
  expect(callback).not.toHaveBeenCalled()
})

test('state subscription cleanup only removes its own listener and pending snapshot', async () => {
  const { api, ipcRenderer } = loadPreload()
  const first = vi.fn(), second = vi.fn()
  const unsubscribe = api.onWindowStateChanged(first)
  api.onWindowStateChanged(second)
  unsubscribe()
  ipcRenderer.emit('window-state-changed', {}, 'normal')
  await Promise.resolve()
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledExactlyOnceWith('normal')
})
