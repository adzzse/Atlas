// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { watchWindowMedia } from '../src/utils/windowMedia.js'

let visibility
let unsubscribe
let cleanup
beforeEach(() => {
  document.body.innerHTML = ''
  unsubscribe = vi.fn()
  window.electronAPI = {
    onWindowVisibilityChanged: (callback) => { visibility = callback; callback(true); return unsubscribe },
  }
})
afterEach(() => { cleanup?.(); cleanup = null })

// Model actual media state because jsdom has no playback engine.
const videoFor = (playing) => {
  const video = document.createElement('video')
  Object.defineProperty(video, 'paused', { get: () => !playing })
  video.pause = vi.fn(() => { playing = false })
  video.play = vi.fn(async () => { playing = true })
  document.body.append(video)
  return video
}

test('hiding pauses active videos and animations, restoring resumes only those videos', () => {
  const active = videoFor(true)
  const paused = videoFor(false)
  cleanup = watchWindowMedia()
  visibility(false)
  visibility(false)
  expect(active.pause).toHaveBeenCalledOnce()
  expect(paused.pause).not.toHaveBeenCalled()
  expect(document.documentElement.hasAttribute('data-atlas-window-hidden')).toBe(true)
  visibility(true)
  visibility(true)
  expect(active.play).toHaveBeenCalledOnce()
  expect(paused.play).not.toHaveBeenCalled()
  expect(document.documentElement.hasAttribute('data-atlas-window-hidden')).toBe(false)
})

test('autoplay that starts after hiding is paused until the window is shown', () => {
  cleanup = watchWindowMedia()
  visibility(false)
  const late = videoFor(true)
  late.dispatchEvent(new Event('play'))
  expect(late.pause).toHaveBeenCalledOnce()
  visibility(true)
  expect(late.play).toHaveBeenCalledOnce()
})

test('removed videos are not restarted on restore', () => {
  const video = videoFor(true)
  cleanup = watchWindowMedia()
  visibility(false)
  video.remove()
  visibility(true)
  expect(video.play).not.toHaveBeenCalled()
})

test('an initially hidden native window pauses media immediately', () => {
  const video = videoFor(true)
  window.electronAPI.onWindowVisibilityChanged = (callback) => { visibility = callback; callback(false); return unsubscribe }
  cleanup = watchWindowMedia()
  expect(video.pause).toHaveBeenCalledOnce()
})

test('cleanup removes the visibility and play listeners and restores CSS state', () => {
  cleanup = watchWindowMedia()
  visibility(false)
  cleanup()
  cleanup = null
  const video = videoFor(true)
  video.dispatchEvent(new Event('play'))
  expect(unsubscribe).toHaveBeenCalledOnce()
  expect(video.pause).not.toHaveBeenCalled()
  expect(document.documentElement.hasAttribute('data-atlas-window-hidden')).toBe(false)
})
