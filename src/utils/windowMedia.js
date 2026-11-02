// Native visibility is required because Electron keeps this renderer's timers unthrottled.
export const watchWindowMedia = () => {
  let hidden = false
  const pausedVideos = new Set()

  // Remember only media that we interrupted; user-paused videos must stay paused.
  const pauseVideo = (video) => {
    if (video.paused || video.ended) return
    pausedVideos.add(video)
    video.pause()
  }

  // Retain the current page and background jobs while suspending its visual work.
  const updateVisibility = (visible) => {
    hidden = !visible
    document.documentElement.toggleAttribute('data-atlas-window-hidden', hidden)
    if (hidden) {
      document.querySelectorAll('video').forEach(pauseVideo)
    } else {
      for (const video of pausedVideos) {
        if (video.isConnected && !video.ended) video.play().catch(() => {})
      }
      pausedVideos.clear()
    }
  }

  // DASH initialization and newly mounted previews can autoplay after the hide event.
  const onPlay = (event) => {
    if (hidden && event.target.tagName === 'VIDEO') pauseVideo(event.target)
  }

  document.addEventListener('play', onPlay, true)
  const unsubscribe = window.electronAPI?.onWindowVisibilityChanged?.(updateVisibility)
  return () => {
    unsubscribe?.()
    updateVisibility(true)
    document.removeEventListener('play', onPlay, true)
  }
}
