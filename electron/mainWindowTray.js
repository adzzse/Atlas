'use strict'

const { Tray, Menu, nativeImage } = require('electron')

// Keep the main window alive so hiding never cancels downloads or play sessions.
function createMainWindowTray({ window, getEnabled, isQuitting, showWindow, quit, iconPath }) {
  let tray = null

  // Reused by disabling, shutdown and failed creation so no orphan icon remains.
  const destroyTray = () => {
    if (tray && !tray.isDestroyed()) tray.destroy()
    tray = null
  }

  // backgroundThrottling=false keeps document.visibilityState visible even when hidden.
  const publishVisibility = () => {
    if (window.isDestroyed() || window.webContents.isDestroyed?.()) return
    window.webContents.send('window-visibility-changed', window.isVisible() && !window.isMinimized())
  }

  // Read config at call time so Settings can enable/disable this without a restart.
  const sync = () => {
    if (isQuitting()) return
    if (!getEnabled()) {
      if (tray && !window.isDestroyed() && !window.isVisible()) showWindow()
      destroyTray()
      return
    }
    if (tray && !tray.isDestroyed()) return
    try {
      const image = nativeImage.createFromPath(iconPath)
      if (image.isEmpty()) throw new Error('Tray icon could not be loaded')
      tray = new Tray(image)
      tray.setToolTip('Atlas')
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Open Atlas', click: showWindow },
        { type: 'separator' },
        { label: 'Exit', click: quit },
      ]))
      tray.on('click', showWindow)
    } catch (err) {
      destroyTray()
      console.warn('Minimize to tray unavailable; keeping native minimize:', err.message)
    }
  }

  // Windows can lose input on restore if hide() re-enters native minimize dispatch.
  const minimize = () => {
    setImmediate(() => {
      if (window.isDestroyed() || isQuitting() || !getEnabled() || !tray || tray.isDestroyed() || !window.isMinimized()) return
      window.hide()
    })
    publishVisibility()
  }

  // Explicit quit/update keeps the existing shutdown path, and can call this twice.
  const dispose = () => {
    destroyTray()
    window.removeListener('minimize', minimize)
    for (const event of ['show', 'hide', 'restore']) window.removeListener(event, publishVisibility)
    window.removeListener('closed', dispose)
    // BrowserWindow's webContents getter throws once the native window is closed.
    if (!window.isDestroyed()) window.webContents.removeListener('did-finish-load', publishVisibility)
  }

  window.on('minimize', minimize)
  for (const event of ['show', 'hide', 'restore']) window.on(event, publishVisibility)
  window.once('closed', dispose)
  window.webContents.on('did-finish-load', publishVisibility)
  sync()
  return { sync, dispose }
}

module.exports = { createMainWindowTray }
