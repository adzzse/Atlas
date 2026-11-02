import { expect, test, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { EventEmitter } from 'node:events'

// Drive the real authenticated route with a newer secondary window first in Electron's list.
const loadServer = () => {
  let requestHandler
  let mainWindow
  const secondary = { isMinimized: () => false, show: vi.fn(), focus: vi.fn() }
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/rpc/extensionServer.js'), 'utf8'), {
    module, console, Buffer, URL,
    require: (name) => name === 'electron' ? { BrowserWindow: { getAllWindows: () => [secondary] } }
      : name === '../db/index' ? {}
      : name === 'http' ? { createServer: (handler) => { requestHandler = handler; return { on() {}, listen() {}, close() {} } } }
      : require(name),
  })
  module.exports.startExtensionServer({
    port: 59999, getConfig: () => ({ Extension: { rpcToken: 'test-pairing-value' } }), getMainWindow: () => mainWindow,
  })
  return {
    secondary,
    setMain: (window) => { mainWindow = window },
    show: () => new Promise((resolve) => {
      const req = Object.assign(new EventEmitter(), { method: 'POST', url: '/api/window/show', headers: { 'x-atlas-token': 'test-pairing-value' } })
      let status
      requestHandler(req, { writeHead: (code) => { status = code }, end: (body) => resolve({ status, body: JSON.parse(body) }) })
      req.emit('end')
    }),
  }
}

test('extension Show Atlas restores the designated main window instead of a newer Settings window', async () => {
  const state = loadServer()
  const main = { isDestroyed: () => false, isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
  state.setMain(main)
  expect(await state.show()).toEqual({ status: 200, body: { success: true } })
  expect(main.restore).toHaveBeenCalledOnce()
  expect(main.show).toHaveBeenCalledOnce()
  expect(main.focus).toHaveBeenCalledOnce()
  expect(state.secondary.show).not.toHaveBeenCalled()
})

test.each([null, { isDestroyed: () => true }])('extension does not claim to open a missing or destroyed main window: %j', async (main) => {
  const state = loadServer()
  state.setMain(main)
  const result = await state.show()
  expect(result.status).toBe(503)
  expect(result.body.success).toBe(false)
  expect(state.secondary.show).not.toHaveBeenCalled()
})

// Settings can restart the server after startup; each entry point needs the live getter.
test.each(['get-extension-status', 'save-extension-settings'])('%s retains the main-window getter when restarting RPC', async (channel) => {
  const src = fs.readFileSync(path.join(__dirname, '../electron/ipc/extension.js'), 'utf8')
  const handlers = new Map(), start = vi.fn()
  const ctx = { mainWindow: null, getConfig: () => ({ Extension: {} }), saveSettings: vi.fn() }
  const register = vm.runInNewContext(`(${src.match(/function registerExtensionHandlers\(ctx\) \{[\s\S]*?\n\}/)[0]})`, {
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    ensureExtensionFiles: () => ({ ok: true }), ensureExtensionToken: async () => 'test-pairing-value',
    isExtensionServerRunning: async () => false, startExtensionServer: start, stopExtensionServer: vi.fn(),
    setTimeout: (callback) => callback(), console,
  })
  register(ctx)
  await handlers.get(channel)({}, {})
  const options = start.mock.calls[0][0]
  const main = { name: 'recreated Library' }
  ctx.mainWindow = main
  expect(options.getMainWindow()).toBe(main)
})
