import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Module from 'module'
import sharp from 'sharp'

const originalLoad = Module._load
const imageUtilsPath = require.resolve('../electron/imageUtils.js')
const mediaHandlersPath = require.resolve('../electron/ipc/media.js')

afterEach(() => {
  Module._load = originalLoad
  delete require.cache[imageUtilsPath]
  delete require.cache[mediaHandlersPath]
})

describe('media download resilience', () => {
  it('limits a broken image to one 30-second request and continues', async () => {
    const imageBytes = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#225588' },
    }).png().toBuffer()
    const requests = []
    const axiosStub = {
      get: vi.fn(async (url, config) => {
        requests.push({ url, config })
        if (url.includes('broken.gif')) {
          const error = new Error('socket aborted')
          error.code = 'ECONNRESET'
          throw error
        }
        return {
          status: 200,
          headers: { 'content-length': String(imageBytes.length) },
          data: imageBytes,
        }
      }),
    }
    Module._load = function patched(request, parent, isMain) {
      if (request === 'axios') return axiosStub
      return originalLoad.call(this, request, parent, isMain)
    }

    const { downloadImages } = require('../electron/imageUtils.js')
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-media-resilience-'))
    const progress = []
    try {
      const result = await downloadImages(
        7,
        7,
        (current, total) => progress.push([current, total]),
        false,
        true,
        'Unlimited',
        false,
        dataDir,
        async () => null,
        async () => [
          { url: 'https://example.com/broken.gif', source: 'f95' },
          { url: 'https://example.com/working.png', source: 'f95' },
        ],
        async () => {},
        async () => {},
      )

      expect(requests.filter(({ url }) => url.includes('broken.gif'))).toHaveLength(1)
      expect(requests.every(({ config }) => config.timeout === 30_000)).toBe(true)
      expect(requests.every(({ config }) => config.signal instanceof AbortSignal)).toBe(true)
      expect(result.failed).toBe(1)
      expect(result.filesWritten).toBe(1)
      expect(progress.at(-1)).toEqual([2, 2])
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('does not eagerly preload every preview in the details renderer', () => {
    const details = fs.readFileSync('src/components/detail/GameDetailsWindow.jsx', 'utf8')
    const mediaTab = fs.readFileSync('src/components/detail/window/MediaTab.jsx', 'utf8')

    expect(details).not.toContain('new Image()')
    expect(details).not.toMatch(/const \[validPreviewUrls/)
    expect(mediaTab).toMatch(/<SafeImage\s+src=\{url\}\s+alt=\{`Preview \$\{index \+ 1\}`\}\s+loading="lazy"/)
  })
})

describe('missing-only media refresh', () => {
  it('checks every remote image even when one local preview already exists', async () => {
    const handlers = new Map()
    const downloadImages = vi.fn(async () => ({
      success: false,
      failed: 1,
      errors: ['Preview 2: socket aborted'],
    }))
    const db = {
      get: (sql, params, callback) => callback(null, { present: 1 }),
      all: (sql, params, callback) => callback(null, []),
    }
    const stubs = {
      electron: {
        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
        BrowserWindow: { getAllWindows: () => [] },
        dialog: {},
      },
      '../imageUtils': { downloadImages, buildBannerBaseName: () => 'banner_remote' },
      '../db/mediaSources': { orderPreviewsBySource: (urls) => urls },
      '../db/steam': { getSteamIDbyRecord: async () => null },
      '../scanners/steamscanner': { fetchAndStoreSteamData: async () => {} },
      '../db/gog': { getGogIDbyRecord: async () => null },
      '../scanners/gogscanner': { fetchAndStoreGogData: async () => {} },
      '../db/lewdcorner': { getLewdCornerIDbyRecord: async () => null },
      '../db/helpers': { normalizePath: (value) => value },
      '../db/media': {
        getF95IDbyRecord: async () => 26,
        getMediaSourceCache: async () => null,
        upsertMediaSourceCache: async () => {},
        nextCreatedAt: () => Date.now(),
      },
      '../db/index': { db },
    }
    Module._load = function patched(request, parent, isMain) {
      if (Object.hasOwn(stubs, request)) return stubs[request]
      return originalLoad.call(this, request, parent, isMain)
    }

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-missing-media-'))
    try {
      const registerMediaHandlers = require('../electron/ipc/media.js')
      registerMediaHandlers({
        dataDir,
        templatesDir: path.join(dataDir, 'templates'),
        configPath: path.join(dataDir, 'config.ini'),
        appConfig: {},
        getAssetBasePath: () => dataDir,
        getMediaStorageMode: () => 'download',
        getPreviews: async () => [],
        getRemoteBannerUrl: async () => 'https://example.com/banner.jpg',
        getRemotePreviewUrls: async () => [
          'https://example.com/existing.jpg',
          'https://example.com/missing.jpg',
        ],
        getAllDownloadableAssetUrlsForRecord: async () => [],
        GetAtlasIDbyRecord: async () => null,
        getMetadataSourceOrder: () => [],
        updateBanners: async () => {},
        updatePreviews: async () => {},
        upsertMediaAsset: async () => {},
      })

      const event = { sender: { isDestroyed: () => false, send: () => {} } }
      const result = await handlers.get('refresh-game-media')(event, { recordId: 26, mode: 'missing' })

      expect(downloadImages).toHaveBeenCalledOnce()
      expect(result.failed).toBe(1)
      expect(result.errors).toEqual(['Preview 2: socket aborted'])
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
