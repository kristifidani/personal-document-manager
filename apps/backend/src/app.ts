import { join } from 'node:path'
import AutoLoad from '@fastify/autoload'
import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

/**
 * Backend entry point, started by fastify-cli (`npm run dev` / `npm start`) and registered directly by tests (`test/helper.ts`). Auto-loads every file in `plugins/`, then `routes/`, so new plugins and routes need no registration here.
 */
const app: FastifyPluginAsync = async (fastify): Promise<void> => {
  void fastify.register(AutoLoad, { dir: join(__dirname, 'plugins') })
  void fastify.register(AutoLoad, { dir: join(__dirname, 'routes') })
}

export default fp(app, { name: 'app' })
