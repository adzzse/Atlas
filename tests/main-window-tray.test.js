import { expect, test, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'

// Exercise native event ordering without touching the user's running Electron app.
const setup = ({ enabled = true, emptyIcon = false, failTray = false } = {}) => {
  const trays = []
  const window = new EventEmitter()
  let visible = true
  let minimized = false
  let quitting = false
  let currentEnabled = enabled
  const deferred = []
  // Keep native dispatch separate so a rapid restore can invalidate pending hide.
  const flush = () => { while (deferred.length) deferred.shift()() }
  Object.assign(window, {
    isDestroyed: () => false,
    isVisible: () => visible,
    isMinimized: () => minimized,
    hide: vi.fn(() => { visible = false; window.emit('hide') }),
    show: vi.fn(() => { visible = true; window.emit('show') }),
    restore: vi.fn(() => { minimized = false; window.emit('restore') }),
    focus: vi.fn(),
    destroy: vi.fn(),
    webContents: Object.assign(new EventEmitter(), { send: vi.fn() }),
  })
  const showWindow = vi.fn(() => { window.restore(); window.show(); window.focus() })
  const quit = vi.fn(() => { quitting = true })
  const electron = {
    nativeImage: { createFromPath: vi.fn(() => ({ isEmpty: () => emptyIcon })) },
    Menu: { buildFromTemplate: (items) => items },
    Tray: class extends EventEmitter {
      constructor() {
        super()
        if (failTray) throw new Error('tray unavailable')
        this.destroyed = false
        this.setToolTip = vi.fn()
        this.setContextMenu = vi.fn((items) => { this.menu = items })
        this.destroy = vi.fn(() => { this.destroyed = true })
        this.isDestroyed = () => this.destroyed
        trays.push(this)
      }
    },
  }
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/mainWindowTray.js'), 'utf8'), {
    module, require: () => electron, console: { warn: vi.fn() },
    setImmediate: (callback) => deferred.push(callback),
  })
  const controller = module.exports.createMainWindowTray({
    window, getEnabled: () => currentEnabled, isQuitting: () => quitting,
    showWindow, quit, iconPath: '/packaged/appicon.png',
  })
  return {
    window, trays, controller, showWindow, quit,
    minimize: ({ flushDeferred = true } = {}) => {
      minimized = true
      window.emit('minimize')
      if (flushDeferred) flush()
    },
    flush,
    setEnabled: (value) => { currentEnabled = value; controller.sync() },
  }
}

test('tray defaults off and native minimize keeps the window alive', () => {
  const state = setup({ enabled: false })
  state.minimize()
  expect(state.trays).toHaveLength(0)
  expect(state.window.hide).not.toHaveBeenCalled()
  expect(state.window.destroy).not.toHaveBeenCalled()
  expect(state.window.webContents.send).toHaveBeenLastCalledWith('window-visibility-changed', false)
})

test('enabled tray hides on minimize and restores the same window on click or Open Atlas', () => {
  const state = setup()
  state.minimize()
  expect(state.window.hide).toHaveBeenCalledOnce()
  expect(state.window.destroy).not.toHaveBeenCalled()
  expect(state.quit).not.toHaveBeenCalled()
  state.trays[0].emit('click')
  expect(state.window.restore).toHaveBeenCalledOnce()
  expect(state.window.show).toHaveBeenCalledOnce()
  expect(state.window.focus).toHaveBeenCalledOnce()
  state.trays[0].menu.find((item) => item.label === 'Open Atlas').click()
  expect(state.showWindow).toHaveBeenCalledTimes(2)
  expect(state.window.webContents.send).toHaveBeenLastCalledWith('window-visibility-changed', true)
})

test('tray hide waits for native minimize dispatch to avoid input-dead restore', () => {
  const state = setup()
  state.minimize({ flushDeferred: false })
  expect(state.window.hide).not.toHaveBeenCalled()
  expect(state.window.webContents.send).toHaveBeenLastCalledWith('window-visibility-changed', false)
  state.flush()
  expect(state.window.hide).toHaveBeenCalledOnce()
  state.trays[0].emit('click')
  expect(state.window.focus).toHaveBeenCalledOnce()
  expect(state.window.webContents.send).toHaveBeenLastCalledWith('window-visibility-changed', true)
})

test('a tray restore before deferred hide runs does not hide the window again', () => {
  const state = setup()
  state.minimize({ flushDeferred: false })
  state.trays[0].emit('click')
  state.flush()
  expect(state.window.hide).not.toHaveBeenCalled()
  expect(state.window.webContents.send).toHaveBeenLastCalledWith('window-visibility-changed', true)
})

test.each(['disable', 'quit', 'dispose', 'close'])('pending tray hide is skipped after %s', (action) => {
  const state = setup()
  state.minimize({ flushDeferred: false })
  if (action === 'disable') state.setEnabled(false)
  if (action === 'quit') state.quit()
  if (action === 'dispose') state.controller.dispose()
  if (action === 'close') state.window.emit('closed')
  state.flush()
  expect(state.window.hide).not.toHaveBeenCalled()
})

test('live enable/disable creates one icon and restores before removing a hidden window entry point', () => {
  const state = setup({ enabled: false })
  state.setEnabled(true)
  state.controller.sync()
  expect(state.trays).toHaveLength(1)
  state.minimize()
  state.setEnabled(false)
  expect(state.showWindow).toHaveBeenCalledOnce()
  expect(state.trays[0].destroy).toHaveBeenCalledOnce()
  state.minimize()
  expect(state.window.hide).toHaveBeenCalledOnce()
})

test.each([{ emptyIcon: true }, { failTray: true }])('unavailable tray retains native minimize: %j', (options) => {
  const state = setup(options)
  state.minimize()
  expect(state.window.hide).not.toHaveBeenCalled()
  expect(state.quit).not.toHaveBeenCalled()
})

test('Exit requests real quit, and quitting is never redirected to hiding', () => {
  const state = setup()
  state.trays[0].menu.find((item) => item.label === 'Exit').click()
  expect(state.quit).toHaveBeenCalledOnce()
  state.minimize()
  expect(state.window.hide).not.toHaveBeenCalled()
  state.controller.dispose()
  expect(state.trays[0].destroy).toHaveBeenCalledOnce()
})

test('reload publishes native visibility and disposal removes owned listeners', () => {
  const state = setup()
  state.minimize()
  state.window.webContents.emit('did-finish-load')
  expect(state.window.webContents.send).toHaveBeenLastCalledWith('window-visibility-changed', false)
  state.controller.dispose()
  state.controller.dispose()
  expect(state.trays[0].destroy).toHaveBeenCalledOnce()
  expect(state.window.listenerCount('minimize')).toBe(0)
  expect(state.window.webContents.listenerCount('did-finish-load')).toBe(0)
})

test('closing the main window removes its tray without changing the existing close policy', () => {
  const state = setup()
  state.window.emit('closed')
  expect(state.trays[0].destroy).toHaveBeenCalledOnce()
  expect(state.window.hide).not.toHaveBeenCalled()
})

test('closed-window tray cleanup does not access the destroyed native webContents getter', () => {
  const state = setup()
  state.window.isDestroyed = () => true
  Object.defineProperty(state.window, 'webContents', {
    get: () => { throw new TypeError('Object has been destroyed') },
  })
  expect(() => state.window.emit('closed')).not.toThrow()
  expect(state.trays[0].destroy).toHaveBeenCalledOnce()
  expect(state.window.listenerCount('minimize')).toBe(0)
})

test('preload remembers visibility before subscription and unsubscribes only its listener', () => {
  const ipcRenderer = Object.assign(new EventEmitter(), { invoke: vi.fn() })
  let api
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/preload.js'), 'utf8'), {
    require: () => ({ ipcRenderer, contextBridge: {
      exposeInMainWorld: (name, value) => { if (name === 'electronAPI') api = value },
    } }),
    process: { platform: 'win32' }, console,
  })
  ipcRenderer.emit('window-visibility-changed', {}, false)
  const first = vi.fn()
  const second = vi.fn()
  const unsubscribe = api.onWindowVisibilityChanged(first)
  api.onWindowVisibilityChanged(second)
  expect(first).toHaveBeenLastCalledWith(false)
  unsubscribe()
  ipcRenderer.emit('window-visibility-changed', {}, true)
  expect(first).toHaveBeenCalledOnce()
  expect(second).toHaveBeenLastCalledWith(true)
})

test('saving the tray setting updates the live controller after persisting config', async () => {
  const filename = path.join(__dirname, '../electron/ipc/settings.js')
  const require_ = createRequire(filename)
  const handlers = new Map()
  const write = vi.fn()
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, console, require: (name) => name === 'electron'
      ? { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }, BrowserWindow: { getAllWindows: () => [] } }
      : name === 'fs' ? { writeFileSync: write } : require_(name),
  })
  const ctx = {
    appConfig: { Interface: { minimizeToTray: false } }, configPath: '/test/config.ini',
    syncMainWindowTray: vi.fn(() => expect(write).toHaveBeenCalled()),
  }
  module.exports(ctx)
  const save = handlers.get('save-settings')
  expect(await save({}, { Interface: { minimizeToTray: true } })).toEqual({ success: true })
  expect(ctx.appConfig.Interface.minimizeToTray).toBe(true)
  expect(ctx.syncMainWindowTray).toHaveBeenCalledOnce()
  await save({}, { Interface: { language: 'English' } })
  expect(ctx.syncMainWindowTray).toHaveBeenCalledOnce()
  await save({}, { Interface: { minimizeToTray: false } })
  expect(ctx.syncMainWindowTray).toHaveBeenCalledTimes(2)
})
