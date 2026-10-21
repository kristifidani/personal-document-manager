import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    storage: {
      /**
       * Streams `file` to storage under `id`.
       * @returns `path` to persist in `documents.storage_path`, the written size in bytes, and the content's hex SHA-256.
       */
      save(
        id: string,
        file: NodeJS.ReadableStream
      ): Promise<{ path: string; sizeBytes: number; sha256: string }>
      /** Deletes the file at `path`; a missing file is not an error. */
      remove(path: string): Promise<void>
    }
  }
}

/**
 * Stores uploaded files under `STORAGE_DIR`, exposed as `fastify.storage`. Each file is named by its document id.
 *
 * MVP: local disk. Callers depend only on the `storage` interface, so the backing store can change without touching them.
 */
export default fp(
  async (fastify) => {
    const dir = resolve(fastify.config.STORAGE_DIR)
    await mkdir(dir, { recursive: true })

    fastify.decorate('storage', {
      async save(id, file) {
        const path = id
        // hash while writing, so the file is read only once
        const hash = createHash('sha256')
        await pipeline(
          file,
          async function* (chunks: AsyncIterable<string | Buffer>) {
            for await (const chunk of chunks) {
              hash.update(chunk)
              yield chunk
            }
          },
          createWriteStream(join(dir, path))
        )
        const { size } = await stat(join(dir, path))
        return { path, sizeBytes: size, sha256: hash.digest('hex') }
      },
      async remove(path) {
        await rm(join(dir, path), { force: true })
      }
    })
  },
  { name: 'storage', dependencies: ['env'] }
)
