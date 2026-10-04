/** Tests for the error-handler plugin, registered in isolation. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import createError from '@fastify/error'
import errorHandler from '../../src/plugins/error-handler'
import { buildPlugins } from '../helper'

test('an error not built with @fastify/error returns a generic 500, whatever status it carries', async (t) => {
  const fastify = await buildPlugins(t, errorHandler, async (instance) => {
    instance.get('/throws', () => {
      throw Object.assign(new Error('internal detail'), { statusCode: 404 })
    })
  })

  const res = await fastify.inject({ url: '/throws' })

  assert.strictEqual(res.statusCode, 500)
  assert.deepStrictEqual(res.json(), {
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong'
  })
})

test('a 5xx error built with @fastify/error returns the generic 500 too', async (t) => {
  const InternalDetailError = createError('INTERNAL_DETAIL', 'internal detail')
  const fastify = await buildPlugins(t, errorHandler, async (instance) => {
    instance.get('/throws', () => {
      throw new InternalDetailError()
    })
  })

  const res = await fastify.inject({ url: '/throws' })

  assert.strictEqual(res.statusCode, 500)
  assert.deepStrictEqual(res.json(), {
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong'
  })
})

test('an unknown route returns 404 in the same shape', async (t) => {
  const fastify = await buildPlugins(t, errorHandler)

  const res = await fastify.inject({ url: '/missing' })

  assert.strictEqual(res.statusCode, 404)
  assert.deepStrictEqual(res.json(), {
    code: 'ROUTE_NOT_FOUND',
    message: 'Route GET:/missing not found'
  })
})
