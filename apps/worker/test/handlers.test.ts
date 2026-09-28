/** Tests for `handleJob`. Jobs are passed in directly and never inserted, so the queue stays empty. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { handleJob } from '../src/handlers'
import { connect, createDocument } from './helper'

test('extract resolves when the stored file exists', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, { withFile: true })

  await handleJob(pool, config, {
    id: randomUUID(),
    document_id: documentId,
    job_type: 'extract'
  })
})

test('extract rejects when the stored file is missing', async (t) => {
  const { pool, config } = connect(t)
  const documentId = await createDocument(pool, config, { withFile: false })

  await assert.rejects(
    handleJob(pool, config, {
      id: randomUUID(),
      document_id: documentId,
      job_type: 'extract'
    }),
    { code: 'ENOENT' }
  )
})

test('rejects an unknown job type', async (t) => {
  const { pool, config } = connect(t)

  await assert.rejects(
    handleJob(pool, config, {
      id: randomUUID(),
      document_id: randomUUID(),
      job_type: 'unknown'
    }),
    /Unknown job type: unknown/
  )
})
