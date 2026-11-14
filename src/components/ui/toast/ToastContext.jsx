import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ToastViewport from './ToastViewport.jsx'

// Lightweight app-wide toast system. Toasts are dismissible, stack bottom-right
// above the footer, support an optional action button and an optional progress
// bar, and can be UPDATED IN PLACE by id (so a single toast can transition
// through states — e.g. app-update checking -> downloading -> downloaded —
// rather than spawning a new toast per state).

const ToastContext = createContext(null)
const NotificationContext = createContext(null)

const MAX_VISIBLE = 3
const MAX_HISTORY = 100
const HISTORY_KEY = 'atlas-notifications'
let seq = 0
const nextId = () => `toast_${Date.now()}_${seq++}`

// Restored notices keep their details, but cannot replay callbacks or stale progress from a previous run.
function readHistory() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((n) => n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.message === 'string')
      .slice(-MAX_HISTORY).map((n) => ({
        id: n.id, title: n.title, message: n.message,
        variant: typeof n.variant === 'string' ? n.variant : 'info',
        createdAt: Number.isFinite(n.createdAt) && Number.isFinite(new Date(n.createdAt).getTime()) ? n.createdAt : Date.now(),
        read: n.read === true, visible: false,
      }))
  } catch { return [] }
}

// A shared history keeps expiry independent from reading without changing existing toast callers.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState(readHistory)
  const timers = useRef(new Map())
  const dismissCallbacks = useRef(new Map())

  useEffect(() => {
    try {
      // Store only display data: callbacks and actions belong to the current app session.
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(toasts.map(({ id, variant, title, message, createdAt, read }) => (
        { id, variant, title, message, createdAt, read }
      ))))
    } catch (error) { console.warn('Could not save notification history:', error) }
  }, [toasts])

  useEffect(() => {
    const activeTimers = timers.current
    return () => { activeTimers.forEach(clearTimeout); activeTimers.clear() }
  }, [])

  // Replacing a notice's timer must not let its old expiry hide the new content.
  const clearTimer = useCallback((id) => {
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  // Hiding a popup preserves unread history; callbacks run outside React's state updater.
  const dismiss = useCallback((id) => {
    clearTimer(id)
    const onDismiss = dismissCallbacks.current.get(id)
    dismissCallbacks.current.delete(id)
    setToasts((list) => list.map((t) => t.id === id && t.visible ? { ...t, visible: false } : t))
    if (typeof onDismiss === 'function') {
      try { onDismiss() } catch { /* ignore */ }
    }
  }, [clearTimer])

  // Auto-expiry hides the popup without marking its contents as read.
  const scheduleAutoDismiss = useCallback((id, ms) => {
    clearTimer(id)
    if (ms && ms > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id), ms))
      if (timers.current.size > MAX_HISTORY) clearTimer(timers.current.keys().next().value)
    }
  }, [clearTimer, dismiss])

  // Create or update a toast. Pass an existing `id` to update in place.
  // Options: { id, variant, title, message, action:{label,onClick,busy},
  //            progress (0-100|null), dismissible, duration (ms, 0 = sticky) }
  const notify = useCallback((opts = {}) => {
    const id = opts.id || nextId()
    if (typeof opts.onDismiss === 'function') dismissCallbacks.current.set(id, opts.onDismiss)
    // Bound retained closures here: a parent effect can still see old state after a child creates a notice.
    if (dismissCallbacks.current.size > MAX_HISTORY) dismissCallbacks.current.delete(dismissCallbacks.current.keys().next().value)
    setToasts((list) => {
      const existingIdx = list.findIndex((t) => t.id === id)
      const base = existingIdx >= 0 ? list[existingIdx] : {
        id,
        variant: 'info',
        title: '',
        message: '',
        action: null,
        progress: null,
        dismissible: true,
        createdAt: Date.now(),
        read: false,
      }
      const next = { ...base, ...opts, id, visible: true }
      // Callback/progress refreshes must not turn an already-read notice unread again.
      if (next.title !== base.title || next.message !== base.message || next.variant !== base.variant) next.read = false
      let out
      if (existingIdx >= 0) {
        out = list.slice()
        out[existingIdx] = next
      } else {
        out = [...list, next]
      }
      return out.slice(-MAX_HISTORY)
    })
    // Auto-dismiss only when an explicit positive duration is provided; sticky
    // (duration 0/undefined) toasts persist until acted on or dismissed.
    if (opts.duration && opts.duration > 0) scheduleAutoDismiss(id, opts.duration)
    else clearTimer(id)
    return id
  }, [scheduleAutoDismiss, clearTimer])

  // Convenience variant helpers.
  const info = useCallback((title, o = {}) => notify({ variant: 'info', title, ...o }), [notify])
  const success = useCallback((title, o = {}) => notify({ variant: 'success', title, duration: 4000, ...o }), [notify])
  const warning = useCallback((title, o = {}) => notify({ variant: 'warning', title, ...o }), [notify])
  const error = useCallback((title, o = {}) => notify({ variant: 'error', title, ...o }), [notify])

  // Reading is explicit, so browsing or closing the panel cannot silently clear the badge.
  const markRead = useCallback((id) => {
    setToasts((list) => list.map((t) => t.id === id ? { ...t, read: true } : t))
  }, [])

  // Keep the details available after clearing the unread count.
  const markAllRead = useCallback(() => {
    setToasts((list) => list.map((t) => t.read ? t : { ...t, read: true }))
  }, [])

  const value = useMemo(() => ({ notify, dismiss, info, success, warning, error }),
    [notify, dismiss, info, success, warning, error])
  // Separate contexts keep useToast stable: update effects depend on it and would otherwise loop.
  const notifications = useMemo(() => ({
    notifications: toasts,
    unreadCount: toasts.filter((t) => !t.read).length,
    markRead, markAllRead,
  }), [toasts, markRead, markAllRead])

  // Cap visible toasts; keep the newest MAX_VISIBLE (older ones drop off the
  // top of the stack). They aren't destroyed from state churn — we just render
  // the tail so the UI can't be buried.
  const visible = toasts.filter((t) => t.visible).slice(-MAX_VISIBLE)

  return (
    <ToastContext.Provider value={value}>
      <NotificationContext.Provider value={notifications}>
        {children}
        <ToastViewport toasts={visible} onDismiss={dismiss} />
      </NotificationContext.Provider>
    </ToastContext.Provider>
  )
}

// Existing producers only need the stable command API, not history subscriptions.
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

// Only the notification center subscribes to changing history and unread counts.
export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within a ToastProvider')
  return ctx
}
