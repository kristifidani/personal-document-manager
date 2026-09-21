// Shared test setup: builds the app the same way the server does, minus the network.
import type { TestContext } from 'node:test'
import Fastify from 'fastify'
import app from '../src/app'

export async function build(t: TestContext) {
  const fastify = Fastify()
  await fastify.register(app)
  await fastify.ready()

  t.after(() => fastify.close())

  return fastify
}
