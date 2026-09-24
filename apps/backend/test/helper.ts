import type { TestContext } from 'node:test'
import Fastify from 'fastify'
import app from '../src/app'

/**
 * Builds the full app (all plugins and routes) without opening a port, and closes it when the test ends. Uses `Fastify()` + `register(app)` because fastify-cli's `helper.js` has broken typings (resolves to `any`).
 */
export async function build(t: TestContext) {
  const fastify = Fastify()
  await fastify.register(app)
  await fastify.ready()

  t.after(() => fastify.close())

  return fastify
}
