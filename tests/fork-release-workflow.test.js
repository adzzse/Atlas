import { it, expect } from 'vitest'
import fs from 'node:fs'
import { load } from 'js-yaml'

// Publishing must remain confined to the personal branch and happen only after
// the source gate and all updater assets are complete.
it('gates Fork publishing on the personal repository, checks, and complete assets', () => {
  const workflow = load(fs.readFileSync(new URL('../.github/workflows/fork.yml', import.meta.url), 'utf8'))
  const job = workflow.jobs.release
  expect(workflow.on.push.branches).toEqual(['fork'])
  expect(job.if).toBe("github.repository == 'adzzse/Atlas' && github.ref == 'refs/heads/fork'")
  expect(job.env.GH_REPO).toBe('adzzse/Atlas')
  expect(workflow.concurrency['cancel-in-progress']).toBe(false)
  const steps = job.steps
  expect(steps.findIndex((step) => step.run === 'npm run check')).toBeLessThan(steps.findIndex((step) => step.run === 'npm run publish'))
  const publish = steps.at(-1).run
  expect(publish).toContain('fork.yml')
  expect(publish).toContain('.exe.blockmap')
  expect(publish.indexOf('Missing or incomplete')).toBeLessThan(publish.indexOf('gh release edit'))
  expect(publish).toContain('--draft=false --prerelease --latest=false')
})
