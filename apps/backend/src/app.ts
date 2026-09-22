import { join } from 'node:path'
import AutoLoad from '@fastify/autoload'
import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

const app: FastifyPluginAsync = async (fastify): Promise<void> => {
  void fastify.register(AutoLoad, { dir: join(__dirname, 'plugins') })
  void fastify.register(AutoLoad, { dir: join(__dirname, 'routes') })
}

export default fp(app, { name: 'app' })
