import { AsyncLocalStorage } from 'node:async_hooks'
import { pino, type Logger } from 'pino'

/** The default logger. `main.ts` sets its level at startup. */
const root = pino()

/** Remembers the current job's logger while that job is being handled. */
const current = new AsyncLocalStorage<Logger>()

/**
 * Returns the logger to use right now: the current job's logger while a job is being handled, otherwise the default one.
 * Any function can call it.
 */
export function logger(): Logger {
  return current.getStore() ?? root
}

/**
 * Calls `run`. `runOnce` uses it to give each job a logger that adds the job's id.
 */
export function withLogger<T>(log: Logger, run: () => Promise<T>): Promise<T> {
  return current.run(log, run)
}
