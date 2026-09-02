// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import Interface from '../src/components/settings/Interface.jsx'
import { useAppUpdate } from '../src/hooks/useAppUpdate.js'
import { ToastProvider } from '../src/components/ui/toast/ToastContext.jsx'

afterEach(() => { cleanup(); vi.restoreAllMocks(); delete window.electronAPI })

// The bridge is asynchronous in production, including when returning a cached
// state, so UI tests must exercise that order instead of assigning component state.
function bridge(state = { status: 'idle', branch: 'fork', build: { version: '0.9.9-fork.1', branch: 'fork', source: 'local' } }) {
  window.electronAPI = {
    getConfig: vi.fn(async () => ({ Interface: { appUpdateBranch: 'fork' } })),
    getAppUpdateState: vi.fn(async () => state),
    saveSettings: vi.fn(async () => ({ success: true })),
    onUpdateStatus: vi.fn(() => () => {}),
    onUpstreamNightlyAvailable: vi.fn(() => () => {}),
    acknowledgeUpstreamNightly: vi.fn(async () => ({ success: true })),
    openExternalUrl: vi.fn(),
    downloadAndInstallAppUpdate: vi.fn(),
    checkAppUpdate: vi.fn(),
  }
  return window.electronAPI
}

describe('Fork update UI', () => {
  it('shows three channels and the actual local build; rejecting official replacement keeps Fork', async () => {
    const api = bridge()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Interface />)
    await screen.findByText(/Running build: fork \/ 0.9.9-fork.1 \(local\)/)
    const select = screen.getByRole('combobox', { name: 'Branch' })
    expect([...select.options].map((option) => option.value)).toEqual(['fork', 'stable', 'nightly'])
    expect(select.value).toBe('fork')
    fireEvent.change(select, { target: { value: 'nightly' } })
    expect(confirm).toHaveBeenCalledOnce()
    expect(api.saveSettings).not.toHaveBeenCalled()
    expect(select.value).toBe('fork')
  })

  it('persists an explicitly confirmed channel switch', async () => {
    const api = bridge()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Interface />)
    await screen.findByText(/Running build:/)
    fireEvent.change(screen.getByRole('combobox', { name: 'Branch' }), { target: { value: 'stable' } })
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ Interface: { appUpdateBranch: 'stable' } }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Branch' }).value).toBe('stable'))
  })

  it('keeps the real channel and shows a rejected settings save', async () => {
    const api = bridge()
    api.saveSettings.mockResolvedValue({ success: false, error: 'Update is already downloading' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Interface />)
    await screen.findByText(/Running build:/)
    fireEvent.change(screen.getByRole('combobox', { name: 'Branch' }), { target: { value: 'nightly' } })
    expect((await screen.findByRole('alert')).textContent).toBe('Update is already downloading')
    expect(screen.getByRole('combobox', { name: 'Branch' }).value).toBe('fork')
  })

  it('restores a missed upstream notice, acknowledges it, and never changes the updater', async () => {
    const notice = { tag: 'v0.9.9-nightly.494', version: '0.9.9-nightly.494', count: 2, url: 'https://github.com/towerwatchman/Atlas/releases/tag/v0.9.9-nightly.494' }
    const api = bridge({ status: 'idle', branch: 'fork', upstreamNightly: notice })
    const { result } = renderHook(() => useAppUpdate(vi.fn()), { wrapper: ToastProvider })
    await screen.findByText('Upstream Nightly updated')
    expect(api.acknowledgeUpstreamNightly).toHaveBeenCalledWith(notice.tag)
    fireEvent.click(screen.getByRole('button', { name: 'Release notes' }))
    expect(api.openExternalUrl).toHaveBeenCalledWith(notice.url)
    expect(api.saveSettings).not.toHaveBeenCalled()
    expect(api.downloadAndInstallAppUpdate).not.toHaveBeenCalled()
    expect(result.current.appUpdateNotice.visible).toBe(false)
    act(() => result.current.handleUpdateStatus({ status: 'available', version: '0.9.9-fork.2' }))
    expect(result.current.appUpdateNotice.visible).toBe(true)
    act(() => result.current.handleUpdateStatus({ status: 'idle', branch: 'stable' }))
    expect(result.current.appUpdateNotice.visible).toBe(false)
  })
})
