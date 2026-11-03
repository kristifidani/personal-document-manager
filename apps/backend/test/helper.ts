/** Helpers shared by the backend's tests. */
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import Fastify, { type FastifyPluginAsync } from 'fastify'
// `app` autoloads plugins by path, so TypeScript doesn't see the `fastify.*` they add; importing them here gives `App` all of them
import '@fastify/postgres'
import '../src/plugins/env'
import '../src/plugins/storage'
import app from '../src/app'

// the test database and storage, so tests never touch dev data; a variable already set (CI) wins
process.loadEnvFile(join(__dirname, '../.env.test'))

/**
 * Builds a Fastify instance with only `plugins`, registered in order, without opening a port, and closes it when the test ends. Use it to test plugins in isolation.
 */
export async function buildPlugins(
  t: TestContext,
  ...plugins: FastifyPluginAsync[]
) {
  const fastify = Fastify()
  for (const plugin of plugins) await fastify.register(plugin)
  await fastify.ready()

  t.after(() => fastify.close())

  return fastify
}

/**
 * Builds the full app (all plugins and routes). Registers `app` directly because fastify-cli's `helper.js` has broken typings (resolves to `any`).
 */
export function build(t: TestContext) {
  return buildPlugins(t, app)
}

/** The Fastify instance returned by `build()`. */
export type App = Awaited<ReturnType<typeof build>>

/** The body of every error response. */
export interface ErrorResponse {
  code: string
  message: string
}

/**
 * Inserts a document row directly, as an upload and the worker's classify job would leave it, and returns its id. Columns not given get valid values; the hash is random, so rows never collide.
 */
export async function insertDocument(
  app: App,
  columns: {
    size_bytes?: number
    content_sha256?: string
    document_type?: string
    title?: string
    summary?: string
  } = {}
) {
  const { rows } = await app.pg.query<{ id: string }>(
    `insert into documents (filename, mime_type, size_bytes, storage_path, content_sha256, document_type, title, summary)
     values ('test.pdf', 'application/pdf', $1, 'test-path', $2, $3, $4, $5)
     returning id`,
    [
      columns.size_bytes ?? 100,
      columns.content_sha256 ?? randomBytes(32).toString('hex'),
      columns.document_type ?? null,
      columns.title ?? null,
      columns.summary ?? null
    ]
  )
  const id = rows[0]?.id
  if (!id) throw new Error('Inserting the document returned no row')
  return id
}
