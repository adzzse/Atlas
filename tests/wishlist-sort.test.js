import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { filterGamesWithState } from '../src/hooks/useFilters.js'
import { normalizeGamesForRenderer } from '../src/utils/gameDisplay.js'

const dbIndex = require('../electron/db/index.js')
const { getWishlistEntries, getWishlistEntry } = require('../electron/db/wishlist.js')
let dataDir

// Use the production schema and hydration so a missing SQL column cannot hide behind renderer fixtures.
const run = (sql) => new Promise((resolve, reject) => {
  dbIndex.db.run(sql, (err) => err ? reject(err) : resolve())
})

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-wishlist-sort-'))
  dbIndex.initializeDatabase(dataDir)
  // Schema creation is queued by the database's open callback.
  await vi.waitFor(() => run('SELECT wishlist_id FROM wishlist_entries LIMIT 1'), { timeout: 5000 })
  await run(`INSERT INTO atlas_data (atlas_id, title) VALUES
    (1, 'Alpha'), (2, 'Zulu'), (3, 'Middle'), (5, 'Missing'), (6, 'Delta')`)
  await run(`INSERT INTO f95_zone_data (f95_id, atlas_id, thread_updated) VALUES
    (101, 1, '2026-01-10'), (102, 2, '2026-06-10'), (103, 3, '')`)
  await run(`INSERT INTO lewdcorner_data (lc_id, atlas_id, thread_updated) VALUES
    (201, 1, '2026-07-10'), (203, 3, '2026-03-10'), (206, 6, '2026-03-10')`)
  await run(`INSERT INTO lewdcorner_data (lc_id, thread_updated) VALUES (204, '2026-03-10')`)
  await run(`INSERT INTO steam_data (steam_id, release_date) VALUES (301, '2026-02-10')`)
  await run(`INSERT INTO wishlist_entries (identity_key, atlas_id, lc_id, steam_id, source, title, flagged_at) VALUES
    ('atlas:1', 1, NULL, NULL, 'atlas', 'Alpha', 1),
    ('atlas:2', 2, NULL, NULL, 'atlas', 'Zulu', 1),
    ('atlas:3', 3, NULL, NULL, 'atlas', 'Middle', 1),
    ('lewdcorner:204', NULL, 204, NULL, 'lewdcorner', 'Beta', 1),
    ('atlas:5', 5, NULL, NULL, 'atlas', 'Missing', 1),
    ('atlas:6', 6, NULL, NULL, 'atlas', 'Delta', 1),
    ('steam:301', NULL, NULL, 301, 'steam', 'Steam', 1)`)
})

afterAll(async () => {
  if (dbIndex.db) {
    await new Promise((resolve, reject) => dbIndex.db.close((err) => err ? reject(err) : resolve()))
  }
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true })
})

test.each([
  ['desc', ['Zulu', 'Beta', 'Delta', 'Middle', 'Steam', 'Alpha', 'Missing']],
  ['asc', ['Alpha', 'Steam', 'Beta', 'Delta', 'Middle', 'Zulu', 'Missing']],
])('Wishlist Last Updated sorts by source date %s instead of title', async (sortDirection, expected) => {
  const games = normalizeGamesForRenderer(await getWishlistEntries())
  const sorted = filterGamesWithState(games, {
    sort: 'lastUpdated', sortDirection, installState: 'all',
  })
  expect(sorted.map((game) => game.title)).toEqual(expected)
})

test('Wishlist entry hydration prefers F95 dates and falls back to linked LewdCorner dates', async () => {
  expect(await getWishlistEntry({ atlas_id: 1 })).toMatchObject({ threadUpdated: '2026-01-10' })
  expect(await getWishlistEntry({ atlas_id: 3 })).toMatchObject({ threadUpdated: '2026-03-10' })
  expect(await getWishlistEntry({ atlas_id: 6 })).toMatchObject({ threadUpdated: '2026-03-10' })
  expect(await getWishlistEntry({ lc_id: 204 })).toMatchObject({ threadUpdated: '2026-03-10' })
  expect(await getWishlistEntry({ atlas_id: 5 })).toMatchObject({ threadUpdated: null })
})

test('the shared Library sort preserves and compares update dates passed to the renderer', () => {
  const games = normalizeGamesForRenderer([
    { title: 'Alpha', thread_updated: '2026-01-10', hasInstalledVersion: true },
    { title: 'Zulu', thread_updated: '2026-06-10', hasInstalledVersion: true },
  ])
  expect(filterGamesWithState(games, { sort: 'lastUpdated', sortDirection: 'desc' })
    .map((game) => game.title)).toEqual(['Zulu', 'Alpha'])
  expect(filterGamesWithState(games, { sort: 'lastUpdated', sortDirection: 'asc' })
    .map((game) => game.title)).toEqual(['Alpha', 'Zulu'])
})
