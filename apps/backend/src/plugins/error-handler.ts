import { FastifyError } from '@fastify/error'
import fp from 'fastify-plugin'

/** Whether `error` is a request failing the route's schema: a plain `Error` that Fastify marks with `validation`, a 400 and `FST_ERR_VALIDATION`. */
function isValidationError(error: unknown): error is FastifyError {
  return error instanceof Error && 'validation' in error
}

/**
 * Builds every error response as `{ code, message }`: `code` is a stable name for the failure, `message` is for a human, and the HTTP status carries the category. Covers errors thrown by routes and requests for an unknown route.
 *
 * Only a validation error or an error built with `@fastify/error` (ours, Fastify's or a plugin's), with a 4xx status, reaches the client: its message was written for the client. Anything else is logged in full and answered with a generic 500, even when it carries a `statusCode` of its own, as an error from a third-party client might.
 */
export default fp(
  async (fastify) => {
    fastify.setErrorHandler((error, request, reply) => {
      // expected error: send its own status, code and message
      if (
        (error instanceof FastifyError || isValidationError(error)) &&
        error.statusCode !== undefined &&
        error.statusCode < 500
      ) {
        request.log.info({ err: error }, error.message)
        return reply
          .code(error.statusCode)
          .send({ code: error.code, message: error.message })
      }

      // unexpected error: keep the detail in the log only
      request.log.error({ err: error }, 'Unexpected error')
      return reply
        .code(500)
        .send({ code: 'INTERNAL_ERROR', message: 'Something went wrong' })
    })

    // replaces Fastify's built-in 404, which answers in a shape of its own
    fastify.setNotFoundHandler((request, reply) => {
      request.log.info('Route not found')
      return reply.code(404).send({
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${request.method}:${request.url} not found`
      })
    })
  },
  { name: 'error-handler' }
)
