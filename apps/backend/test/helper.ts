import type { TestContext } from 'node:test'
import Fastify, { FastifyPluginAsync } from 'fastify'
import app from '../src/app'

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
