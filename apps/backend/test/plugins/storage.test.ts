/** Tests for the storage plugin, registered in isolation with only `env`. */
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import * as assert from 'node:assert'
import Fastify from 'fastify'
import env from '../../src/plugins/env'
import storage from '../../src/plugins/storage'

/** Builds a Fastify instance with only `env` and `storage`. */
async function build(t: TestContext) {
  const fastify = Fastify()
  await fastify.register(env)
  await fastify.register(storage)
  await fastify.ready()

  t.after(() => fastify.close())

  return fastify
}

test('save() creates the storage directory and writes the file', async (t) => {
  const fastify = await build(t)
  const id = randomUUID()
  const content = Buffer.from('hello world')

  const result = await fastify.storage.save(id, Readable.from(content))
  t.after(() => fastify.storage.remove(result.path))

  assert.strictEqual(result.path, id)
  assert.strictEqual(result.sizeBytes, content.length)

  const filePath = join(fastify.config.STORAGE_DIR, id)
  assert.ok(existsSync(filePath))
  assert.deepStrictEqual(await readFile(filePath), content)
})

test('remove() deletes the file', async (t) => {
  const fastify = await build(t)
  const id = randomUUID()

  const { path } = await fastify.storage.save(
    id,
    Readable.from(Buffer.from('x'))
  )
  await fastify.storage.remove(path)

  assert.strictEqual(existsSync(join(fastify.config.STORAGE_DIR, id)), false)
})

test('remove() on a missing file does not throw', async (t) => {
  const fastify = await build(t)

  await assert.doesNotReject(fastify.storage.remove(randomUUID()))
})
