import { afterEach, beforeEach, expect, test } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import Module from 'node:module'
import vm from 'node:vm'
import path from 'node:path'
import { parse } from 'acorn'

let database
let collections
let restoreLoad

// Real SQLite exercises migration/query behavior without rebuilding sqlite3 for Electron.
beforeEach(() => {
  database = new DatabaseSync(':memory:')
  database.exec('CREATE TABLE games (record_id INTEGER PRIMARY KEY); INSERT INTO games VALUES (1),(2);')
  const db = {
    // sqlite3 calls expose write results on this; mirror that callback interface.
    run(sql, params, callback) {
      try {
        const result = database.prepare(sql).run(...params)
        callback.call({ changes: Number(result.changes), lastID: Number(result.lastInsertRowid) }, null)
      } catch (error) { callback(error) }
    },
    // Keep SQL execution real; only the asynchronous driver interface is adapted.
    all(sql, params, callback) {
      try { callback(null, database.prepare(sql).all(...params)) } catch (error) { callback(error) }
    },
    // Single-row queries use the same database as writes and membership changes.
    get(sql, params, callback) {
      try { callback(null, database.prepare(sql).get(...params)) } catch (error) { callback(error) }
    },
  }
  const originalLoad = Module._load
  // The database getter is supplied at call time, just as Electron initializes it.
  Module._load = function loadCollectionDependencies(request, parent, isMain) {
    if (request === './index' && parent?.filename.endsWith('collections.js')) return { db }
    if (request === './writeLock' && parent?.filename.endsWith('collections.js')) {
      return { withWriteLock: async (_label, operation) => operation() }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  restoreLoad = () => { Module._load = originalLoad }
  const filename = require.resolve('../electron/db/collections')
  delete require.cache[filename]
  collections = require(filename)
  for (const ddl of collections.COLLECTIONS_DDL) database.exec(ddl)
  for (const ddl of collections.COLLECTIONS_INDEXES) database.exec(ddl)
})

afterEach(() => {
  restoreLoad?.()
  database?.close()
  delete require.cache[require.resolve('../electron/db/collections')]
})

test('creator grouping defaults off and survives create/edit/read', async () => {
  const created = await collections.createCollection({ name: 'Studio', groupByCreator: true })
  const ordinary = await collections.createCollection({ name: 'Favorites' })
  expect(created.success).toBe(true)
  expect((await collections.getCollections()).find((row) => row.id === created.id).groupByCreator).toBe(true)
  expect((await collections.getCollections()).find((row) => row.id === ordinary.id).groupByCreator).toBe(false)
  await collections.renameCollection(created.id, 'Renamed')
  expect((await collections.getCollections()).find((row) => row.id === created.id).groupByCreator).toBe(true)
  await collections.renameCollection(created.id, 'Renamed', { groupByCreator: false })
  expect((await collections.getCollections()).find((row) => row.id === created.id).groupByCreator).toBe(false)
})

test('ordinary collection keeps the global layout while any creator-grouped membership overrides it', async () => {
  const studio = await collections.createCollection({ name: 'Studio', groupByCreator: true })
  const favorites = await collections.createCollection({ name: 'Favorites' })
  await collections.addGameToCollection(studio.id, 1)
  await collections.addGameToCollection(favorites.id, 1)
  await collections.addGameToCollection(favorites.id, 2)
  expect(await collections.resolveLibraryFolderStructure('{title}/{version}', { recordId: 1 })).toBe('{creator}/{title}/{version}')
  expect(await collections.resolveLibraryFolderStructure('{atlasId}/{title}/{version}', { recordId: 2 })).toBe('{atlasId}/{title}/{version}')
  await collections.removeGameFromCollection(studio.id, 1)
  expect(await collections.resolveLibraryFolderStructure('{title}/{version}', { recordId: 1 })).toBe('{title}/{version}')
})

test('pending selection chooses a destination without creating membership', async () => {
  const studio = await collections.createCollection({ name: 'Studio', groupByCreator: true })
  expect(await collections.resolveLibraryFolderStructure('{title}/{version}', { collectionId: studio.id })).toBe('{creator}/{title}/{version}')
  expect(await collections.getCollectionMemberships()).toEqual([])
  await expect(collections.resolveLibraryFolderStructure('{title}/{version}', { collectionId: 999 })).rejects.toThrow('Collection not found')
  await expect(collections.resolveLibraryFolderStructure('{title}/{version}', { collectionId: 'bad' })).rejects.toThrow('Invalid collection')
})

test('boolean input is validated instead of treating a string false as enabled', async () => {
  expect((await collections.createCollection({ name: 'Studio', groupByCreator: 'false' })).success).toBe(false)
  const studio = await collections.createCollection({ name: 'Studio', groupByCreator: true })
  expect((await collections.renameCollection(studio.id, 'Studio', { groupByCreator: 'false' })).success).toBe(false)
})

// Inspect handlers without booting Electron or changing production exports.
function nodes(node, matches) {
  if (!node || typeof node.type !== 'string') return []
  return [
    ...(matches(node) ? [node] : []),
    ...Object.values(node).flatMap((value) => Array.isArray(value)
      ? value.flatMap((child) => nodes(child, matches)) : nodes(value, matches)),
  ]
}

test('all structured install/import paths use the collection-resolved layout', () => {
  const source = fs.readFileSync(new URL('../electron/ipc/importer.js', import.meta.url), 'utf8')
  const calls = nodes(parse(source, { ecmaVersion: 'latest' }), (node) =>
    node.type === 'CallExpression' && node.callee.name === 'buildStructuredImportPath')
  expect(calls).toHaveLength(6)
  expect(calls.map((call) => call.arguments[1].name)).toEqual([
    'resolvedFormat', 'resolvedFormat', 'resolvedFormat', 'resolvedFormat', 'format', 'resolvedFormat',
  ])
})

test('read-only preview resolves existing catalog membership and validates replacement choices', async () => {
  const studio = await collections.createCollection({ name: 'Studio', groupByCreator: true })
  await collections.addGameToCollection(studio.id, 1)
  const source = fs.readFileSync(new URL('../electron/ipc/importer.js', import.meta.url), 'utf8')
  const handle = nodes(parse(source, { ecmaVersion: 'latest' }), (node) =>
    node.type === 'CallExpression' && node.callee.object?.name === 'ipcMain'
    && node.callee.property?.name === 'handle' && node.arguments[0]?.value === 'preview-library-path')[0]
  const callback = handle.arguments[1]
  const game = { title: 'Game', creator: 'Studio', atlasId: 10 }
  const { buildStructuredImportPath, normalizeVersionName, sanitizePathSegment, toPositiveInteger } = require('../electron/library/importRules')
  const preview = vm.runInNewContext(`(${source.slice(callback.start, callback.end)})`, {
    ctx: { appConfig: { Library: { gameFolder: 'D:/Library', libraryFolderStructure: '{title}/{version}' } } },
    appConfig: {}, path, process: {}, dbModule: { db: {} },
    getAssetBasePath: () => '', getMediaStorageMode: () => 'remote',
    toLocalRecordId: (value) => Number(value) > 0 ? Number(value) : null,
    getGame: async () => game,
    buildCatalogRecordDeps: () => ({}), resolveCatalogRecord: async () => ({ recordId: 1 }),
    dbGet: async () => ({ game_path: path.join('D:/OldLibrary', 'Studio', 'Game', 'v1') }),
    resolveLibraryFolderStructure: collections.resolveLibraryFolderStructure,
    buildStructuredImportPath, normalizeVersionName, sanitizePathSegment, toPositiveInteger,
    getUniquePath: (candidate) => `${candidate} (1)`,
  })
  const fromCatalog = await preview(null, { game, version: 'v2' })
  expect(fromCatalog.path).toBe(`${path.join('D:/Library', 'Studio', 'Game', 'v2')} (1)`)
  const replaced = await preview(null, { recordId: 1, version: 'v2', replaceVersionId: 4 })
  expect(replaced.path).toBe(`${path.join('D:/OldLibrary', 'Studio', 'Game', 'v2')} (1)`)
  const invalid = await preview(null, { recordId: 1, version: 'v2', replaceVersionId: 4, collectionId: 999 })
  expect(invalid.success).toBe(false)
  expect(invalid.error).toBe('Collection not found')
  expect(await collections.getCollectionMemberships()).toHaveLength(1)
})
