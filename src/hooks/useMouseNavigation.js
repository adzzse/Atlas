import { useEffect, useRef } from 'react'

// Atlas views need a session history because changing React state does not navigate Chromium.
export function useMouseNavigation(key, view, onRestore) {
  const historyRef = useRef({ entries: [], index: -1 })

  useEffect(() => {
    const history = historyRef.current
    if (history.entries[history.index]?.key === key) {
      // Metadata refreshes and typing update the current destination, not the history depth.
      history.entries[history.index].view = view
    } else {
      history.index += 1
      history.entries.splice(history.index, history.entries.length, { key, view })
    }

    // Native commands arrive once per press; do not also handle DOM mouse events.
    const navigate = (direction) => {
      if (direction !== 'back' && direction !== 'forward') return
      // Existing Atlas dialogs/lightboxes use a full-screen fixed backdrop, often without ARIA roles.
      if (document.querySelector('[role="dialog"], [aria-modal="true"], .fixed.inset-0')) return
      const index = history.index + (direction === 'back' ? -1 : 1)
      if (!history.entries[index]) return
      history.index = index
      onRestore(history.entries[index].view)
    }
    return window.electronAPI.onNavigateHistory(navigate)
  }, [key, view, onRestore])
}
