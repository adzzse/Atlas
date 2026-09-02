import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  VIEW_SORT_PREFERENCES_KEY,
  getViewSortPreference,
  loadViewSortPreferences,
  saveViewSortPreferences,
  updateViewSortPreference,
} from '../src/utils/viewSortPreferences.js'

const makeStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

describe('view sort preferences', () => {
  test('stores Library and Wishlist order independently in one field', () => {
    const storage = makeStorage()
    let preferences = loadViewSortPreferences(storage)

    preferences = updateViewSortPreference(preferences, 'local', {
      sort: 'dateAdded',
      sortDirection: 'desc',
    })
    preferences = updateViewSortPreference(preferences, 'wishlist', {
      sort: 'creator',
      sortDirection: 'asc',
    })
    saveViewSortPreferences(preferences, storage)

    const restored = loadViewSortPreferences(storage)
    expect(getViewSortPreference(restored, 'local')).toEqual({
      sort: 'dateAdded',
      sortDirection: 'desc',
    })
    expect(getViewSortPreference(restored, 'wishlist')).toEqual({
      sort: 'creator',
      sortDirection: 'asc',
    })
  })

  test('falls back safely when the stored field is invalid', () => {
    const storage = makeStorage({ [VIEW_SORT_PREFERENCES_KEY]: '{broken json' })

    expect(loadViewSortPreferences(storage)).toEqual({
      library: { sort: 'name', sortDirection: 'asc' },
      wishlist: { sort: 'name', sortDirection: 'asc' },
    })
  })

  test('ignores Browse so it cannot overwrite either saved order', () => {
    const preferences = updateViewSortPreference(
      {
        library: { sort: 'dateAdded', sortDirection: 'desc' },
        wishlist: { sort: 'creator', sortDirection: 'asc' },
      },
      'catalog',
      { sort: 'rating', sortDirection: 'desc' },
    )

    expect(preferences).toEqual({
      library: { sort: 'dateAdded', sortDirection: 'desc' },
      wishlist: { sort: 'creator', sortDirection: 'asc' },
    })
  })
})

test('App wires the saved order into both views and every filter sidebar', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8')

  expect(app).toContain("applyViewSort('local'")
  expect(app).toContain("applyViewSort('wishlist'")
  expect(app.match(/onFilterChange=\{handleViewFilterChange\}/g)).toHaveLength(3)
})
