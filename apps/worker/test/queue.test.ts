/** Tests for `claimJob` and `finishJob` against the real `jobs` table. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { claimJob, finishJob } from '../src/queue'
import { connect, createDocumentWithJob, jobStatus } from './helper'

test('returns undefined when no job is pending', async (t) => {
  const { pool } = connect(t)

  assert.strictEqual(await claimJob(pool), undefined)
})

test('claims the oldest pending job first', async (t) => {
  const { pool, config } = connect(t)
  const older = await createDocumentWithJob(pool, config, { withFile: false })
  const newer = await createDocumentWithJob(pool, config, { withFile: false })

  const first = await claimJob(pool)
  const second = await claimJob(pool)

  assert.deepStrictEqual(first, {
    id: older.jobId,
    document_id: older.documentId,
    job_type: 'extract'
  })
  assert.strictEqual(second?.id, newer.jobId)
  assert.strictEqual(await jobStatus(pool, older.jobId), 'processing')
})

test('concurrent claims hand a job to only one claimer', async (t) => {
  const { pool, config } = connect(t)
  const { jobId } = await createDocumentWithJob(pool, config, {
    withFile: false
  })

  const claims = await Promise.all([claimJob(pool), claimJob(pool)])

  assert.deepStrictEqual(
    claims.map((job) => job?.id),
    claims[0] ? [jobId, undefined] : [undefined, jobId]
  )
})

test('finishJob records the outcome', async (t) => {
  const { pool, config } = connect(t)
  const { jobId } = await createDocumentWithJob(pool, config, {
    withFile: false
  })
  await claimJob(pool)

  await finishJob(pool, jobId, 'failed')

  assert.strictEqual(await jobStatus(pool, jobId), 'failed')
})
