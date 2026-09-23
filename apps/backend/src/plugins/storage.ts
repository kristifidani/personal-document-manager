import { createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    storage: {
      save(
        id: string,
        file: NodeJS.ReadableStream
      ): Promise<{ path: string; sizeBytes: number }>
      remove(path: string): Promise<void>
    }
  }
}

// Local-disk storage under STORAGE_DIR. Files are named by document id;
// `path` is kept separate from `id` in the return value so callers don't
// have to assume that relationship (see documents migration comment).
export default fp(
  async (fastify) => {
    const dir = resolve(fastify.config.STORAGE_DIR)
    await mkdir(dir, { recursive: true })

    fastify.decorate('storage', {
      async save(id, file) {
        const path = id
        await pipeline(file, createWriteStream(join(dir, path)))
        const { size } = await stat(join(dir, path))
        return { path, sizeBytes: size }
      },
      async remove(path) {
        await rm(join(dir, path), { force: true })
      }
    })
  },
  { name: 'storage', dependencies: ['env'] }
)
