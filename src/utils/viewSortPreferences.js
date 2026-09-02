import { normalizeFilterState } from '../hooks/useFilters.js'

export const VIEW_SORT_PREFERENCES_KEY = 'atlasViewSortPreferences'

const defaultPreferences = {
  library: { sort: 'name', sortDirection: 'asc' },
  wishlist: { sort: 'name', sortDirection: 'asc' },
}

const normalizeSort = (value) => {
  const normalized = normalizeFilterState(value)
  return { sort: normalized.sort, sortDirection: normalized.sortDirection }
}

// Keep one malformed local preference from changing how either view sorts.
const normalizePreferences = (value = {}) => ({
  library: normalizeSort(value?.library || defaultPreferences.library),
  wishlist: normalizeSort(value?.wishlist || defaultPreferences.wishlist),
})

// Reading is best-effort because localStorage can be unavailable in tests or a
// locked-down renderer; the normal defaults are still a valid order.
export const loadViewSortPreferences = (storage) => {
  try {
    const target = storage ?? globalThis.localStorage
    const raw = target?.getItem(VIEW_SORT_PREFERENCES_KEY)
    return normalizePreferences(raw ? JSON.parse(raw) : defaultPreferences)
  } catch {
    return normalizePreferences(defaultPreferences)
  }
}

// Persist both views together so a Library write cannot erase Wishlist order.
export const saveViewSortPreferences = (preferences, storage) => {
  const normalized = normalizePreferences(preferences)
  try {
    const target = storage ?? globalThis.localStorage
    target?.setItem(VIEW_SORT_PREFERENCES_KEY, JSON.stringify(normalized))
  } catch {
    // A sort preference is safe to lose when storage itself is unavailable.
  }
  return normalized
}

// App calls this at every view boundary instead of carrying the previous tab's
// active sort into the next one.
export const getViewSortPreference = (preferences, mode) => {
  const key = mode === 'local' ? 'library' : mode === 'wishlist' ? 'wishlist' : null
  return key ? normalizePreferences(preferences)[key] : null
}

// Browse has its own server-side sort and must never overwrite these two local
// view preferences.
export const updateViewSortPreference = (preferences, mode, filters) => {
  const key = mode === 'local' ? 'library' : mode === 'wishlist' ? 'wishlist' : null
  const normalized = normalizePreferences(preferences)
  return key ? { ...normalized, [key]: normalizeSort(filters) } : normalized
}
