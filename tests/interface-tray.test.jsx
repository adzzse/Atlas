// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import Interface from '../src/components/settings/Interface.jsx'

let config
let saveSettings
beforeEach(() => {
  cleanup()
  config = { Interface: { language: 'English' }, WindowBounds: { mainWidth: 1410 } }
  saveSettings = vi.fn(async () => ({ success: true }))
  window.electronAPI = { getConfig: async () => config, saveSettings }
})

test('Minimize to tray is off by default and explains that closing still exits', async () => {
  await act(async () => { render(<Interface />) })
  expect(screen.getByRole('checkbox', { name: 'Minimize to tray' }).checked).toBe(false)
  expect(screen.getByText(/closing Atlas still exits/i)).toBeTruthy()
})

test('the saved tray setting is reflected on mount', async () => {
  config.Interface.minimizeToTray = true
  await act(async () => { render(<Interface />) })
  expect(screen.getByRole('checkbox', { name: 'Minimize to tray' }).checked).toBe(true)
})

test('toggling tray saves without dropping other settings', async () => {
  await act(async () => { render(<Interface />) })
  const toggle = screen.getByRole('checkbox', { name: 'Minimize to tray' })
  await act(async () => { fireEvent.click(toggle) })
  expect(saveSettings).toHaveBeenLastCalledWith({
    Interface: { language: 'English', minimizeToTray: true }, WindowBounds: { mainWidth: 1410 },
  })
  expect(toggle.checked).toBe(true)
})
