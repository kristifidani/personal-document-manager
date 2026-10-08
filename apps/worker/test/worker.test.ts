/** Tests for `runOnce` (one claim → handle → finish cycle) and the `pollJobs` loop, against the real queue. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Pool } from 'pg'
import type { Config } from '../src/env'
import { pollJobs, runOnce } from '../src/worker'
import { connect, createDocumentWithJob, readJob, sample } from './helper'

/** Runs `pollJobs` for 100 ms, far below `POLL_INTERVAL_MS`, then aborts it. @returns how long it took to stop. */
async function pollBriefly(pool: Pool, config: Config) {
  const shutdown = new AbortController()
  const start = performance.now()
  const polling = pollJobs(pool, config, shutdown.signal)
  await sleep(100)
  shutdown.abort()
  await polling
  return performance.now() - start
}

test('returns false when no job is pending', async (t) => {
  const { pool, config } = connect(t)

  assert.strictEqual(await runOnce(pool, config), false)
})

test('marks a job done when its handler succeeds', async (t) => {
  const { pool, config } = connect(t)
  const { jobId } = await createDocumentWithJob(
    pool,
    config,
    sample('text.pdf')
  )

  assert.strictEqual(await runOnce(pool, config), true)
  assert.strictEqual((await readJob(pool, jobId))?.status, 'done')
})

test('marks a job failed with the reason when its handler throws', async (t) => {
  const { pool, config } = connect(t)
  const { jobId } = await createDocumentWithJob(pool, config, null)

  assert.strictEqual(await runOnce(pool, config), true)
  const job = await readJob(pool, jobId)
  assert.strictEqual(job?.status, 'failed')
  // the missing file's error from `access`
  assert.match(job.error ?? '', /^ENOENT/)
})

test('pollJobs sleeps when idle and stops as soon as it is aborted', async (t) => {
  const { pool, config } = connect(t)
  const query = t.mock.method(pool, 'query')

  const elapsed = await pollBriefly(pool, config)

  assert.strictEqual(query.mock.callCount(), 1)
  assert.ok(elapsed < 2_000)
})

test('pollJobs sleeps after a database error instead of retrying at once', async (t) => {
  const { pool, config } = connect(t)
  // reject on a later tick, like a real connection error; an immediate rejection would starve the timers if the loop spun
  const query = t.mock.method(pool, 'query', async () => {
    await sleep(1)
    throw new Error('database down')
  })

  const elapsed = await pollBriefly(pool, config)

  assert.strictEqual(query.mock.callCount(), 1)
  assert.ok(elapsed < 2_000)
})
