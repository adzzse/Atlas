'use strict'

const axios = require('axios')

// A published, installable Windows nightly is actionable; drafts and builds
// still uploading their installer/manifest must not generate a notification.
function nightlyNotice(releases, lastSeenTag) {
  if (!Array.isArray(releases)) throw new Error('Invalid upstream releases response')
  const nightly = releases.filter((release) => {
    const assets = release.assets?.filter((asset) => asset.state === 'uploaded' && asset.size > 0) || []
    return !release.draft && release.prerelease && release.published_at &&
      /^v\d+\.\d+\.\d+-nightly\.\d+$/.test(release.tag_name) &&
      assets.some((asset) => asset.name === 'nightly.yml') &&
      assets.some((asset) => asset.name.endsWith('.exe'))
  }).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
  const latest = nightly[0]
  if (!latest || latest.tag_name === lastSeenTag) return null
  const seenIndex = nightly.findIndex((release) => release.tag_name === lastSeenTag)
  return {
    tag: latest.tag_name,
    version: latest.tag_name.slice(1),
    // ponytail: count catch-up releases in the latest 100 only; older history
    // still produces a latest-release notice, never an invented exact count.
    count: seenIndex > 0 ? seenIndex : null,
    url: `https://github.com/towerwatchman/Atlas/releases/tag/${encodeURIComponent(latest.tag_name)}`,
  }
}

// This read-only request must never change electron-updater's selected feed or
// pending installer. A failed request leaves the notification receipt intact.
async function fetchNightlyNotice(lastSeenTag) {
  const { data } = await axios.get('https://api.github.com/repos/towerwatchman/Atlas/releases', {
    params: { per_page: 100 },
    timeout: 15000,
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Atlas-Fork-Upstream-Check' },
  })
  return nightlyNotice(data, lastSeenTag)
}

module.exports = { nightlyNotice, fetchNightlyNotice }
