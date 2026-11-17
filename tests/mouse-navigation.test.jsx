// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook } from '@testing-library/react'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { useState } from 'react'
import { useMouseNavigation } from '../src/hooks/useMouseNavigation.js'
import PreviewLightbox from '../src/components/detail/page/PreviewLightbox.jsx'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  delete window.electronAPI
})

// Run the real preload so native commands exercise the same subscription as Atlas.
const setup = () => {
  const ipcRenderer = new EventEmitter()
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/preload.js'), 'utf8'), {
    require: () => ({ ipcRenderer, contextBridge: { exposeInMainWorld: (name, api) => {
      if (name === 'electronAPI') window.electronAPI = api
    } } }),
    process: { platform: 'win32' }, console,
  })
  const hook = renderHook(() => {
    const [view, setView] = useState({ key: 'library', filters: { text: '' } })
    useMouseNavigation(view.key, view, setView)
    return { view, setView }
  })
  return {
    ...hook,
    ipcRenderer,
    open: (view) => act(() => hook.result.current.setView(view)),
    command: (direction) => act(() => ipcRenderer.emit('navigate-history', {}, direction)),
  }
}

describe('mouse navigation history', () => {
  it('goes back and forward through views and retains their filters', () => {
    const { result, open, command } = setup()
    open({ key: 'library', filters: { text: 'find me' } })
    open({ key: 'game:1', title: 'First' })
    open({ key: 'game:2', title: 'Second' })
    command('back')
    expect(result.current.view.title).toBe('First')
    command('back')
    expect(result.current.view.filters.text).toBe('find me')
    command('forward')
    expect(result.current.view.title).toBe('First')
    command('forward')
    expect(result.current.view.title).toBe('Second')
  })

  it('ignores history boundaries and clears the forward branch after a new destination', () => {
    const { result, open, command } = setup()
    command('back')
    expect(result.current.view.key).toBe('library')
    open({ key: 'wishlist' })
    open({ key: 'downloads' })
    command('back')
    open({ key: 'collections' })
    command('forward')
    expect(result.current.view.key).toBe('collections')
    command('back')
    expect(result.current.view.key).toBe('wishlist')
  })

  it('updates the current game without adding history for background refreshes', () => {
    const { result, open, command } = setup()
    open({ key: 'game:1', title: 'Before' })
    open({ key: 'game:1', title: 'After' })
    command('back')
    expect(result.current.view.key).toBe('library')
    command('forward')
    expect(result.current.view.title).toBe('After')
    command('volume-up')
    expect(result.current.view.title).toBe('After')
  })

  it.each(['role="dialog"', 'class="fixed inset-0"'])('keeps an open modal or lightbox in place: %s', (attribute) => {
    const { result, open, command } = setup()
    open({ key: 'game:1' })
    document.body.innerHTML = `<div ${attribute}></div>`
    command('back')
    expect(result.current.view.key).toBe('game:1')
    document.body.innerHTML = ''
    command('back')
    expect(result.current.view.key).toBe('library')
  })

  it('removes only its own subscription on rerender and unmount', () => {
    const { open, unmount, ipcRenderer } = setup()
    const other = vi.fn()
    window.electronAPI.onNavigateHistory(other)
    open({ key: 'downloads' })
    expect(ipcRenderer.listenerCount('navigate-history')).toBe(2)
    unmount()
    ipcRenderer.emit('navigate-history', {}, 'back')
    expect(other).toHaveBeenCalledExactlyOnceWith('back')
    expect(ipcRenderer.listenerCount('navigate-history')).toBe(1)
  })

  it('keeps the actual media lightbox open instead of leaving the detail page', () => {
    const { result, open, command } = setup()
    open({ key: 'game:1' })
    const lightbox = render(<PreviewLightbox previews={['https://example.com/preview.png']} lightboxIndex={0} onClose={vi.fn()} />)
    command('back')
    expect(result.current.view.key).toBe('game:1')
    lightbox.unmount()
    command('back')
    expect(result.current.view.key).toBe('library')
  })
})

// Test the actual window callback, including its command filter, without booting Atlas.
it('forwards only native Back/Forward commands to the main renderer', () => {
  const source = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8')
  const registration = source.match(/mainWindow\.on\('app-command',[\s\S]*?\n  \}\)/)
  expect(registration).not.toBeNull()
  const mainWindow = Object.assign(new EventEmitter(), { webContents: { send: vi.fn() } })
  vm.runInNewContext(registration[0], { mainWindow })
  for (const command of ['browser-backward', 'browser-forward', 'volume-up']) {
    mainWindow.emit('app-command', {}, command)
  }
  expect(mainWindow.webContents.send.mock.calls).toEqual([
    ['navigate-history', 'back'], ['navigate-history', 'forward'],
  ])
})

// Windows Chromium can deliver MB4/MB5 directly without emitting an app-command.
it.each(['back', 'forward'])('handles the native %s mouse button exactly once on release', (button) => {
  const source = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8')
  const registration = source.match(/mainWindow\.webContents\.on\('before-mouse-event',[\s\S]*?\n  \}\)/)
  expect(registration).not.toBeNull()
  const webContents = Object.assign(new EventEmitter(), { send: vi.fn() })
  vm.runInNewContext(registration[0], { mainWindow: { webContents } })
  for (const type of ['mouseDown', 'mouseUp']) {
    const event = { preventDefault: vi.fn() }
    webContents.emit('before-mouse-event', event, { type, button })
    expect(event.preventDefault).toHaveBeenCalledOnce()
    if (type === 'mouseDown') expect(webContents.send).not.toHaveBeenCalled()
  }
  expect(webContents.send).toHaveBeenCalledExactlyOnceWith('navigate-history', button)
  for (const other of ['left', 'middle', 'right']) {
    const event = { preventDefault: vi.fn() }
    webContents.emit('before-mouse-event', event, { type: 'mouseUp', button: other })
    expect(event.preventDefault).not.toHaveBeenCalled()
  }
  expect(webContents.send).toHaveBeenCalledTimes(1)
})

// A late detail fetch must not undo Back or overwrite a newer selection.
it.each([null, { record_id: 2, title: 'Second' }])('ignores a stale game fetch after leaving its detail: %j', async (destination) => {
  const source = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8')
  const prefix = 'const selectGame = useCallback('
  const start = source.indexOf(prefix) + prefix.length
  const callback = source.slice(start, source.indexOf(', [wishlistIdentityKeys])', start))
  let selectedGame
  let resolveGame
  const selectGame = vm.runInNewContext(`(${callback})`, {
    setShowSearchSidebar: () => {},
    withWishlistStates: (games) => games,
    wishlistIdentityKeys: new Set(),
    getLocalRecordIdForCatalogRow: () => null,
    getWishlistIdentityKey: (game) => String(game.record_id),
    normalizeGameForRenderer: (game) => game,
    setSelectedGame: (next) => { selectedGame = typeof next === 'function' ? next(selectedGame) : next },
    window: { electronAPI: { getGame: () => new Promise((resolve) => { resolveGame = resolve }) } },
    console,
  })
  selectGame({ record_id: 1, title: 'First' })
  selectedGame = destination
  resolveGame({ record_id: 1, title: 'Refreshed First' })
  await Promise.resolve()
  expect(selectedGame).toEqual(destination)
})

// Exercise App's restore path as well as the history hook, without mounting unrelated IPC-heavy views.
it.each([
  { libraryMode: 'local', libraryView: 'grid', activeSavedFilterId: '' },
  { libraryMode: 'local', libraryView: 'grid', activeSavedFilterId: 'builtin-favorites' },
  { libraryMode: 'local', libraryView: 'collections', activeSavedFilterId: '' },
  { libraryMode: 'local', libraryView: 'downloads', activeSavedFilterId: '' },
  { libraryMode: 'wishlist', libraryView: 'grid', activeSavedFilterId: '' },
  { libraryMode: 'catalog', libraryView: 'grid', activeSavedFilterId: '' },
])('restores the destination and filters for $libraryMode/$libraryView/$activeSavedFilterId', (destination) => {
  const source = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8')
  const prefix = 'const restoreNavigation = useCallback('
  const start = source.indexOf(prefix) + prefix.length
  const callback = source.slice(start, source.indexOf(', [browseAvailable, gamesByRecordId', start))
  const setters = Object.fromEntries([
    'setLibraryMode', 'setLibraryView', 'setSidebarMode', 'setActiveSavedFilterId',
    'setShowSearchSidebar', 'handleFilterChange', 'setSelectedGame', 'selectGame',
  ].map((name) => [name, vi.fn()]))
  const game = { record_id: 1, title: 'Latest library record' }
  const restore = vm.runInNewContext(`(${callback})`, {
    ...setters, browseAvailable: true, gamesByRecordId: new Map([[1, game]]),
    normalizeSidePanelMode: (mode) => mode,
    pendingLibraryScrollTopRestoreRef: { current: null }, libraryScrollTopRef: { current: 250 },
  })
  const view = {
    ...destination, sidebarMode: 'savedFilters', showSearchSidebar: true,
    activeFilters: { text: 'retained search', collectionIds: ['2'] },
    selectedGame: { record_id: 1, title: 'Outdated snapshot' },
  }
  restore(view)
  expect(setters.setLibraryMode).toHaveBeenCalledWith(destination.libraryMode)
  expect(setters.setLibraryView).toHaveBeenCalledWith(destination.libraryView)
  expect(setters.setActiveSavedFilterId).toHaveBeenCalledWith(destination.activeSavedFilterId)
  expect(setters.setSidebarMode).toHaveBeenCalledWith('savedFilters')
  expect(setters.handleFilterChange).toHaveBeenCalledWith(view.activeFilters)
  expect(setters.selectGame).toHaveBeenCalledWith(game)
})
