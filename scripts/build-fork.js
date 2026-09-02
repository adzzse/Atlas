'use strict'

// Keep upstream's base version unchanged in Git. Only the packaged application
// gets a Fork version, so merging nightly never rewrites personal build numbers.
const { build, Platform, Arch } = require('electron-builder')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const pkg = require('../package.json')

const number = process.env.FORK_BUILD_NUMBER || '0'
const publish = process.argv.includes('--publish')
if (!/^(0|[1-9]\d*)$/.test(number) || !Number.isSafeInteger(Number(number))) {
  throw new Error('FORK_BUILD_NUMBER must be a non-negative integer.')
}
if (publish && number === '0') {
  throw new Error('Set FORK_BUILD_NUMBER before publishing; fork.0 is reserved for local builds.')
}
const projectDir = path.resolve(__dirname, '..')
const version = `${pkg.version.split('-')[0]}-fork.${number}`
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf8', windowsHide: true }).trim()

build({
  projectDir,
  targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  publish: publish ? 'always' : 'never',
  config: {
    directories: { output: `release/fork-${number}` },
    extraMetadata: {
      version,
      atlasBuildSource: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local',
      atlasBuildCommit: commit,
    },
    // Deliberately explicit: neither an inherited upstream config nor a new
    // remote can redirect a personal publish into someone else's repository.
    publish: {
      provider: 'github', owner: 'adzzse', repo: 'Atlas', channel: 'fork',
      releaseType: 'draft', vPrefixedTagName: true,
    },
  },
}).catch((err) => {
  console.error(err)
  process.exitCode = 1
})
