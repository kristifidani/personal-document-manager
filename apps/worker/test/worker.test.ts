/** Tests for `runOnce`: one full claim → handle → finish cycle against the real queue. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { runOnce } from '../src/worker'
import { connect, createDocumentWithJob, jobStatus } from './helper'

test('returns false when no job is pending', async (t) => {
  const { pool, config } = connect(t)

  assert.strictEqual(await runOnce(pool, config), false)
})

test('marks a job done when its handler succeeds', async (t) => {
  const { pool, config } = connect(t)
  const { jobId } = await createDocumentWithJob(pool, config, {
    withFile: true
  })

  assert.strictEqual(await runOnce(pool, config), true)
  assert.strictEqual(await jobStatus(pool, jobId), 'done')
})

test('marks a job failed when its handler throws', async (t) => {
  const { pool, config } = connect(t)
  const { jobId } = await createDocumentWithJob(pool, config, {
    withFile: false
  })

  assert.strictEqual(await runOnce(pool, config), true)
  assert.strictEqual(await jobStatus(pool, jobId), 'failed')
})
