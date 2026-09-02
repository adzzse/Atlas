import { describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

const { __testables: T } = require('../electron/ipc/importer')

describe('wishlist download media', () => {
  it('downloads missing media after a promoted install when local storage is enabled', async () => {
    const refreshGameMedia = vi.fn().mockResolvedValue({ success: true, failed: 0 })

    await T.autoDownloadPromotedMedia({
      promotion: { created: true },
      recordId: 29,
      storageMode: 'download',
      refreshGameMedia,
    })

    expect(refreshGameMedia).toHaveBeenCalledOnce()
    expect(refreshGameMedia).toHaveBeenCalledWith(29, {
      mode: 'missing',
      download: true,
    })
  })

  it('does nothing for streamed media or an existing library download', async () => {
    const refreshGameMedia = vi.fn()

    await T.autoDownloadPromotedMedia({
      promotion: { created: true },
      recordId: 29,
      storageMode: 'stream',
      refreshGameMedia,
    })
    await T.autoDownloadPromotedMedia({
      promotion: null,
      recordId: 29,
      storageMode: 'download',
      refreshGameMedia,
    })

    expect(refreshGameMedia).not.toHaveBeenCalled()
  })

  it('wires completed promotions to the shared media refresher', () => {
    const importer = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ipc', 'importer.js'), 'utf8')
    const media = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ipc', 'media.js'), 'utf8')

    expect(importer).toContain('refreshGameMedia: ctx.refreshGameMedia')
    expect(media).toContain('ctx.refreshGameMedia = refreshOneGame')
  })
})
