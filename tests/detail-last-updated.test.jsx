// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import GameDetailPage from '../src/components/detail/GameDetailPage.jsx'

// Server rendering exercises the real Details rows without running Electron-only effects.
const detailsFor = (game) => {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(<GameDetailPage game={{
    record_id: 'wishlist:1', title: 'Date test', versions: [], ...game,
  }} />)
  return [...root.querySelectorAll('section')]
    .find((section) => section.querySelector('h2')?.textContent === 'Details')
}

test.each([
  [{ threadUpdated: '2026-10-31' }, '2026-10-31'],
  [{ record_id: 1, thread_updated: '20261031' }, '2026-10-31'],
  [{ record_id: 'catalog:1', threadUpdated: 1704067200 }, '2024-01-01'],
  [{ thread_updated: '1704067200000' }, '2024-01-01'],
  [{ source: 'lewdcorner', threadUpdated: null, lewdcornerThreadUpdated: '2026-03-10' }, '2026-03-10'],
])('Details shows the source update date for %j', (game, expected) => {
  const details = detailsFor({ release_date: '2023-01-01', ...game })
  const row = [...details.querySelectorAll('div')]
    .find((element) => element.firstElementChild?.textContent === 'Last Updated')
  expect(row, 'Details must include Last Updated separately from Release Date').toBeTruthy()
  expect(row.textContent).toBe(`Last Updated${expected}`)
  expect(details.textContent).toContain('Release Date2023-01-01')
})

test.each([
  {},
  { threadUpdated: 'not-a-date' },
  { thread_updated: 0 },
  { source: 'steam', steam_id: 10, steam_release_date: '2026-02-10' },
])('Details omits Last Updated when no valid update date exists: %j', (game) => {
  const details = detailsFor({ release_date: '2023-01-01', ...game })
  expect(details.textContent).not.toContain('Last Updated')
})
