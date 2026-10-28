import { describe, expect, it } from 'vitest'

const { applyMediaSources } = require('../electron/db/mediaSources')

describe('downloaded banner preference', () => {
  it('keeps a downloaded banner ahead of its web fallback in download mode', () => {
    const localBanner = 'C:/Atlas/data/images/1/banner_f95_mc.webp'
    const remoteBanner = 'https://attachments.f95zone.to/agent17/banner.jpg'

    const game = applyMediaSources(
      {
        banner_url: localBanner,
        banner_source: 'download',
        f95_banner: remoteBanner,
      },
      { sourceOrder: ['f95'], mediaStorageMode: 'download', bannerFileExists: true },
    )

    expect(game.banner_url).toBe(localBanner)
    expect(game.banner_candidates).toEqual([localBanner, remoteBanner])
  })

  it('uses remote media when the downloaded banner no longer exists', () => {
    const remoteBanner = 'https://attachments.f95zone.to/agent17/banner.jpg'
    const game = applyMediaSources(
      {
        banner_url: 'C:/Atlas/data/images/1/missing.webp',
        banner_source: 'download',
        f95_banner: remoteBanner,
      },
      { sourceOrder: ['f95'], mediaStorageMode: 'download', bannerFileExists: false },
    )

    expect(game.banner_url).toBe(remoteBanner)
  })
})
