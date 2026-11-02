// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import PreviewLightbox from '../src/components/detail/page/PreviewLightbox.jsx'

let visibility
let visible
let unsubscribe
beforeEach(() => {
  visible = true
  unsubscribe = vi.fn()
  window.electronAPI = {
    onWindowVisibilityChanged: (callback) => { visibility = callback; callback(visible); return unsubscribe },
  }
})
afterEach(cleanup)

// Exercise the actual embed boundary; pausing top-document videos cannot stop an iframe.
const openTrailer = async (props = {}) => {
  let result
  await act(async () => { result = render(<PreviewLightbox
    previews={['https://www.youtube.com/embed/abcdef12345']}
    lightboxIndex={0} onClose={() => {}} onPrev={() => {}} onNext={() => {}} {...props}
  />) })
  return result
}

test('hiding removes an embedded trailer so its audio cannot continue', async () => {
  await openTrailer()
  expect(new URL(screen.getByTitle('Trailer 1').src).searchParams.get('autoplay')).toBe('1')
  await act(async () => { visibility(false) })
  expect(screen.queryByTitle('Trailer 1')).toBeNull()
})

test('restoring reloads the selected trailer without restarting playback automatically', async () => {
  await openTrailer()
  await act(async () => { visibility(false) })
  await act(async () => { visibility(true) })
  expect(new URL(screen.getByTitle('Trailer 1').src).searchParams.get('autoplay')).toBe('0')
  expect(screen.getByText('1 / 1')).toBeTruthy()
})

test('a trailer opened while the native window is hidden does not mount its iframe', async () => {
  visible = false
  await openTrailer()
  expect(screen.queryByTitle('Trailer 1')).toBeNull()
  cleanup()
  expect(unsubscribe).toHaveBeenCalledOnce()
})

test('hiding while the lightbox is closed preserves autoplay for a newly opened trailer', async () => {
  const view = await openTrailer({ lightboxIndex: null })
  await act(async () => { visibility(false); visible = false })
  await act(async () => { visibility(true); visible = true })
  await act(async () => { view.rerender(<PreviewLightbox
    previews={['https://www.youtube.com/embed/abcdef12345']} lightboxIndex={0}
  />) })
  expect(new URL(screen.getByTitle('Trailer 1').src).searchParams.get('autoplay')).toBe('1')
})

test('switching away from an interrupted trailer restores autoplay for the next selection', async () => {
  const previews = ['https://www.youtube.com/embed/abcdef12345', 'https://www.youtube.com/embed/ghijkl67890']
  const view = await openTrailer({ previews })
  await act(async () => { visibility(false) })
  await act(async () => { visibility(true) })
  await act(async () => { view.rerender(<PreviewLightbox previews={previews} lightboxIndex={1} />) })
  expect(new URL(screen.getByTitle('Trailer 2').src).searchParams.get('autoplay')).toBe('1')
})

test('closing and reopening the same interrupted trailer starts a fresh playback session', async () => {
  const previews = ['https://www.youtube.com/embed/abcdef12345']
  const view = await openTrailer()
  await act(async () => { visibility(false) })
  await act(async () => { visibility(true) })
  await act(async () => { view.rerender(<PreviewLightbox previews={previews} lightboxIndex={null} />) })
  await act(async () => { view.rerender(<PreviewLightbox previews={previews} lightboxIndex={0} />) })
  expect(new URL(screen.getByTitle('Trailer 1').src).searchParams.get('autoplay')).toBe('1')
})
