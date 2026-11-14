// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ToastProvider, useToast, useNotifications } from '../src/components/ui/toast/ToastContext.jsx'
import NotificationCenter from '../src/components/ui/toast/NotificationCenter.jsx'

afterEach(() => { cleanup(); window.localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks() })

// Keep the production provider mounted so expiry and read state exercise the same store.
function mountNotifications(children = null) {
  let api
  let state
  // Capturing both contexts also detects notification updates changing the toast API identity.
  function Probe() {
    api = useToast()
    state = useNotifications()
    return null
  }
  const view = render(<ToastProvider><Probe />{children}</ToastProvider>)
  return { ...view, get api() { return api }, get state() { return state } }
}

describe('notification history', () => {
  it('keeps expiry and dismissal callbacks for notices created by startup effects', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    // Startup producers run their effects before the provider's own effects.
    function StartupNotice() {
      const toast = useToast()
      useEffect(() => { toast.success('Startup result', { onDismiss }) }, [toast])
      return null
    }
    const store = mountNotifications(<StartupNotice />)
    expect(screen.getByText('Startup result')).toBeTruthy()
    act(() => vi.advanceTimersByTime(4000))
    expect(screen.queryByText('Startup result')).toBeNull()
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(store.state.notifications).toHaveLength(1)
  })

  it('retains expired and dismissed messages as unread, including those outside the toast stack', () => {
    vi.useFakeTimers()
    const store = mountNotifications()
    const onDismiss = vi.fn()
    act(() => {
      for (let i = 1; i <= 4; i++) store.api.info(`Notice ${i}`, { id: `notice-${i}`, message: `Detail ${i}` })
      store.api.success('Finished', { id: 'done', onDismiss })
      store.api.dismiss('notice-1')
    })
    expect(screen.getAllByRole('status')).toHaveLength(3)
    act(() => vi.advanceTimersByTime(4000))
    expect(store.state.notifications).toHaveLength(5)
    expect(store.state.notifications.find((n) => n.id === 'done').message).toBe('')
    expect(store.state.unreadCount).toBe(5)
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(screen.queryByText('Finished')).toBeNull()
  })

  it('marks one or all read without deleting details or changing the toast API', () => {
    const store = mountNotifications()
    const originalApi = store.api
    act(() => {
      store.api.info('First', { id: 'first', message: 'Keep this detail' })
      store.api.error('Second', { id: 'second' })
    })
    act(() => store.state.markRead('first'))
    expect(store.state.unreadCount).toBe(1)
    expect(store.state.notifications.find((n) => n.id === 'first').read).toBe(true)
    expect(store.state.notifications.find((n) => n.id === 'first').message).toBe('Keep this detail')
    act(() => store.state.markAllRead())
    expect(store.state.unreadCount).toBe(0)
    expect(store.state.notifications).toHaveLength(2)
    expect(store.api).toBe(originalApi)
  })

  it('updates an existing notice and its action without duplicating it or re-counting callback updates', () => {
    const store = mountNotifications()
    const latestAction = vi.fn()
    act(() => store.api.info('Atlas Update', { id: 'update', message: 'Downloading' }))
    act(() => store.state.markRead('update'))
    act(() => store.api.notify({ id: 'update', action: { label: 'Wait', onClick: vi.fn() } }))
    expect(store.state.unreadCount).toBe(0)
    act(() => store.api.notify({ id: 'update', message: 'Ready to install', action: { label: 'Install', onClick: latestAction } }))
    expect(store.state.notifications).toHaveLength(1)
    expect(store.state.unreadCount).toBe(1)
    act(() => store.state.notifications[0].action.onClick())
    expect(latestAction).toHaveBeenCalledOnce()
  })

  it('cleans up expiry timers on unmount and does not dismiss twice', () => {
    vi.useFakeTimers()
    const store = mountNotifications()
    const onDismiss = vi.fn()
    act(() => store.api.success('Done', { id: 'done', onDismiss }))
    act(() => { store.api.dismiss('done'); store.api.dismiss('done') })
    expect(onDismiss).toHaveBeenCalledOnce()
    const onNextDismiss = vi.fn()
    act(() => store.api.success('Next', { onDismiss: onNextDismiss }))
    store.unmount()
    act(() => vi.runOnlyPendingTimers())
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onNextDismiss).not.toHaveBeenCalled()
  })

  it('restores details and read state after restart without resurrecting callbacks, popups or progress', () => {
    const store = mountNotifications()
    const onClick = vi.fn()
    act(() => {
      store.api.info('Saved notice', { id: 'saved', message: 'Full details\nSecond line', progress: 50, action: { label: 'Old action', onClick } })
      store.api.error('Unread error', { id: 'unread', message: 'Error details' })
    })
    act(() => store.state.markRead('saved'))
    store.unmount()
    const restored = mountNotifications()
    expect(restored.state.notifications).toHaveLength(2)
    expect(restored.state.notifications[0]).toMatchObject({ title: 'Saved notice', message: 'Full details\nSecond line', read: true })
    expect(restored.state.notifications[0].action).toBeUndefined()
    expect(restored.state.notifications[0].progress).toBeUndefined()
    expect(restored.state.unreadCount).toBe(1)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => restored.api.notify({ id: 'saved', message: 'Current state', action: { label: 'Current action', onClick } }))
    expect(restored.state.notifications).toHaveLength(2)
    expect(restored.state.unreadCount).toBe(2)
  })

  it('bounds saved history and recovers from malformed or unavailable storage', () => {
    window.localStorage.setItem('atlas-notifications', 'invalid JSON')
    const store = mountNotifications()
    act(() => {
      for (let i = 0; i < 105; i++) store.api.info(`Notice ${i}`)
    })
    expect(store.state.notifications).toHaveLength(100)
    expect(store.state.notifications[0].title).toBe('Notice 5')
    store.unmount()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const unavailable = mountNotifications()
    act(() => unavailable.api.info('Still works'))
    expect(unavailable.state.unreadCount).toBe(1)
    expect(warning).toHaveBeenCalled()
  })
})

describe('notification center', () => {
  it('opens every retained detail newest first and supports individual/all-read controls', () => {
    const store = mountNotifications(<NotificationCenter />)
    act(() => {
      for (let i = 1; i <= 4; i++) store.api.info(`Notice ${i}`, { message: `Full detail ${i}` })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Notifications (4 unread)' }))
    const panel = within(screen.getByRole('region', { name: 'Notifications' }))
    expect(panel.getAllByRole('listitem')).toHaveLength(4)
    expect(panel.getAllByRole('listitem')[0].textContent).toContain('Notice 4')
    expect(panel.getByText('Full detail 1')).toBeTruthy()
    fireEvent.click(panel.getAllByRole('button', { name: 'Mark as read' })[0])
    expect(screen.getByRole('button', { name: 'Notifications (3 unread)' })).toBeTruthy()
    fireEvent.click(panel.getByRole('button', { name: 'Mark all as read' }))
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()
    expect(panel.getAllByText('Read')).toHaveLength(4)
    expect(panel.getByRole('button', { name: 'Mark all as read' }).disabled).toBe(true)
  })

  it('keeps the current action and its busy state available after the popup closes', () => {
    const store = mountNotifications(<NotificationCenter />)
    const onClick = vi.fn()
    act(() => store.api.info('Release', { id: 'release', action: { label: 'Release notes', onClick, busy: true } }))
    act(() => store.api.dismiss('release'))
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    const panel = within(screen.getByRole('region', { name: 'Notifications' }))
    expect(panel.getByRole('button', { name: 'Release notes' }).disabled).toBe(true)
    act(() => store.api.notify({ id: 'release', action: { label: 'Release notes', onClick } }))
    fireEvent.click(panel.getByRole('button', { name: 'Release notes' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('closes on Escape, outside click or its close button without silently marking read', () => {
    const store = mountNotifications(<NotificationCenter />)
    act(() => store.api.info('Unread'))
    const trigger = screen.getByRole('button', { name: 'Notifications (1 unread)' })
    const pageShortcut = vi.fn()
    window.addEventListener('keydown', pageShortcut)
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('region')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(pageShortcut).not.toHaveBeenCalled()
    window.removeEventListener('keydown', pageShortcut)
    fireEvent.click(trigger)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('region')).toBeNull()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Close notifications' }))
    expect(screen.queryByRole('region')).toBeNull()
    expect(store.state.unreadCount).toBe(1)
  })

  it('shows an empty state without a misleading unread badge', () => {
    mountNotifications(<NotificationCenter />)
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByText('No notifications yet.')).toBeTruthy()
  })
})
