/** Tests for `claimJob` and `finishJob` against the real `jobs` table. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { claimJob, finishJob } from '../src/queue'
import { connect, createDocumentWithJob, readJob } from './helper'

test('returns undefined when no job is pending', async (t) => {
  const { pool } = connect(t)

  assert.strictEqual(await claimJob(pool), undefined)
})

test('claims the oldest pending job first', async (t) => {
  const { pool, config } = connect(t)
  const older = await createDocumentWithJob(pool, config, null)
  const newer = await createDocumentWithJob(pool, config, null)

  const first = await claimJob(pool)
  const second = await claimJob(pool)

  assert.deepStrictEqual(first, {
    id: older.jobId,
    document_id: older.documentId,
    job_type: 'extract'
  })
  assert.strictEqual(second?.id, newer.jobId)
  assert.strictEqual((await readJob(pool, older.jobId))?.status, 'processing')
})

test('concurrent claims hand a job to only one claimer', async (t) => {
  const { pool, config } = connect(t)
  const { jobId } = await createDocumentWithJob(pool, config, null)

  const claims = await Promise.all([claimJob(pool), claimJob(pool)])

  assert.deepStrictEqual(
    claims.map((job) => job?.id),
    claims[0] ? [jobId, undefined] : [undefined, jobId]
  )
})

test('finishJob without an error records done', async (t) => {
  const { pool, config } = connect(t)
  const { jobId } = await createDocumentWithJob(pool, config, null)
  await claimJob(pool)

  await finishJob(pool, jobId)

  assert.deepStrictEqual(await readJob(pool, jobId), {
    status: 'done',
    error: null
  })
})

test('finishJob with an error records failed and the reason', async (t) => {
  const { pool, config } = connect(t)
  const { jobId } = await createDocumentWithJob(pool, config, null)
  await claimJob(pool)

  await finishJob(pool, jobId, 'some reason')

  assert.deepStrictEqual(await readJob(pool, jobId), {
    status: 'failed',
    error: 'some reason'
  })
})
