import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNotifications } from './ToastContext.jsx'
import { Toast } from './ToastViewport.jsx'

// Keep history reachable in either navigation layout, outside the draggable header's stacking context.
export default function NotificationCenter() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    // The panel is portalled, so both it and its trigger are inside for outside-click purposes.
    const onOutside = (event) => {
      if (!panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false)
    }
    // Consume Escape before page shortcuts can navigate away behind the open history.
    const onEscape = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onEscape, true)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onEscape, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title="Notifications"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="relative btn-shadow btn-glow w-7 h-7 flex items-center justify-center rounded-buttonTheme text-text hover:bg-tertiary transition-colors -webkit-app-region-no-drag focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <i className="fas fa-bell nav-icon-fx" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[16px] px-1 rounded-full bg-accent text-white text-[10px] leading-4" aria-hidden="true">{unreadCount}</span>
        )}
      </button>
      {open && createPortal(
        <section
          ref={panelRef}
          id={panelId}
          role="region"
          aria-label="Notifications"
          tabIndex={-1}
          className="fixed top-[76px] right-4 z-[70] w-[400px] max-w-[calc(100vw-32px)] max-h-[70vh] flex flex-col bg-secondary border border-border rounded-buttonTheme shadow-2xl text-text"
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <div className="flex-1">
              <h2 className="text-sm font-semibold">Notifications</h2>
              <p className="text-xs text-muted">{unreadCount} unread · Latest 100 notifications</p>
            </div>
            <button type="button" disabled={!unreadCount} onClick={markAllRead} className="text-xs text-accent hover:underline disabled:opacity-50 disabled:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              Mark all as read
            </button>
            <button type="button" aria-label="Close notifications" onClick={() => { setOpen(false); triggerRef.current?.focus() }} className="w-6 h-6 text-muted hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="p-6 text-sm text-muted text-center">No notifications yet.</p>
          ) : (
            <ol className="overflow-y-auto min-h-0 p-3 space-y-3">
              {[...notifications].reverse().map((notice) => (
                <li key={notice.id}>
                  <Toast toast={notice} />
                  <div className="flex items-center justify-between gap-3 px-1 pt-1 text-xs text-muted">
                    <time dateTime={new Date(notice.createdAt).toISOString()}>{new Date(notice.createdAt).toLocaleString()}</time>
                    {notice.read ? <span>Read</span> : (
                      <button type="button" onClick={() => markRead(notice.id)} className="shrink-0 text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Mark as read</button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>, document.body,
      )}
    </>
  )
}
