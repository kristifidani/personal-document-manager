import envSchema from 'env-schema'

/** The validated environment returned by `loadConfig`. */
export interface Config {
  DATABASE_URL: string
  STORAGE_DIR: string
  ANTHROPIC_API_KEY: string
}

const schema = {
  type: 'object',
  required: ['DATABASE_URL', 'STORAGE_DIR', 'ANTHROPIC_API_KEY'],
  properties: {
    DATABASE_URL: { type: 'string', minLength: 1 },
    STORAGE_DIR: { type: 'string', minLength: 1 },
    ANTHROPIC_API_KEY: { type: 'string', minLength: 1 }
  }
}

/**
 * Validates the environment at startup so the worker fails fast. Same rules as the backend (`env-schema` is what `@fastify/env` uses). Precedence: `data` (tests) over `process.env` over `.env`.
 * @throws when a variable is missing or empty.
 */
export function loadConfig(data?: Partial<Config>): Config {
  return envSchema<Config>({ schema, dotenv: true, data })
}
