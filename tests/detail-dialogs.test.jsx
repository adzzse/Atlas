// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import GameDetailPage from '../src/components/detail/GameDetailPage.jsx'

beforeEach(() => {
  window.electronAPI = {
    getPreviews: vi.fn(async () => []),
    getConfig: vi.fn(async () => ({})),
    onGameUpdated: vi.fn(() => () => {}),
    refreshGameMedia: vi.fn(async () => ({
      success: true, failed: 2, errors: ['CDN timed out'], previewUrls: [],
    })),
  }
})

afterEach(() => { cleanup(); vi.restoreAllMocks(); delete window.electronAPI })

// Render the real action bar and both modals so the merge cannot hide a warning
// behind a refresh dialog or let Escape leave a pending destructive action.
const openDetails = async (props = {}) => {
  await act(async () => { render(<GameDetailPage game={{
    record_id: 1, title: 'Dialog test', versions: [],
  }} {...props} />) })
}

test('partial media failures keep the fork warning in the in-app dialog', async () => {
  const nativeAlert = vi.spyOn(window, 'alert').mockImplementation(() => {})
  const onRefresh = vi.fn()
  await openDetails({ onRefresh })
  fireEvent.click(screen.getByTitle('Refresh Media'))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh', exact: true }))
  expect((await screen.findByText(/Media refresh completed with 2 failed image/)).textContent)
    .toContain('CDN timed out')
  expect(nativeAlert).not.toHaveBeenCalled()
  expect(window.electronAPI.refreshGameMedia).toHaveBeenCalledWith(1, { mode: 'missing' })
  expect(onRefresh).toHaveBeenCalledWith(1)
  expect(screen.queryByRole('heading', { name: 'Refresh Media' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  expect(screen.queryByText(/Media refresh completed/)).toBeNull()
})

test('Escape leaves details open while a remove confirmation owns the page', async () => {
  const onBack = vi.fn()
  await openDetails({ onBack })
  fireEvent.click(screen.getByTitle('Remove Title from Library'))
  expect(screen.getByRole('heading', { name: 'Remove title from library' })).toBeTruthy()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onBack).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onBack).toHaveBeenCalledOnce()
})
