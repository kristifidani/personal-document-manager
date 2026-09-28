import envSchema from 'env-schema'

/** The validated environment returned by `loadConfig`. */
export interface Config {
  DATABASE_URL: string
  STORAGE_DIR: string
}

const schema = {
  type: 'object',
  required: ['DATABASE_URL', 'STORAGE_DIR'],
  properties: {
    DATABASE_URL: { type: 'string', minLength: 1 },
    STORAGE_DIR: { type: 'string', minLength: 1 }
  }
}

/**
 * Validates the environment at startup, so the worker fails fast on missing config. Uses `env-schema`, the library behind the backend's `@fastify/env`, with the same rules. `dotenv: true` reads `.env` directly. `process.env` wins over `.env`, and `data` (used by tests) wins over both.
 * @throws when a variable is missing or empty.
 */
export function loadConfig(data?: Partial<Config>): Config {
  return envSchema<Config>({ schema, dotenv: true, data })
}
