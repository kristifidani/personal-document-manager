import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'

/** The backend's port during the suite; not 3000, so a running dev server doesn't clash. */
const PORT = 3100

/** Where each app's `npm start` runs: `apps/<name>`. */
const APPS_DIR = join(__dirname, '..', '..')

/** What the started apps have printed, prefixed by app name; `waitFor` shows it on timeout. */
const output: string[] = []

/** Whether any process in the group led by `pid` is still running. */
function groupAlive(pid: number) {
  try {
    process.kill(-pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Starts an app with its own `npm start`, as a person would, and stops it when the test ends. Each app loads its own `.env`; `env` overrides it.
 *
 * `npm start` runs npm → sh → node, so the app runs in its own process group and stopping it signals the whole group, then waits until every process in it has exited.
 */
function startApp(t: TestContext, name: string, env: Record<string, string>) {
  const child = spawn('npm', ['start'], {
    cwd: join(APPS_DIR, name),
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const { pid } = child
  if (pid === undefined) throw new Error(`Could not start ${name}`)

  // keep the output for diagnosing a timeout
  const record = (chunk: Buffer) => output.push(`[${name}] ${chunk.toString()}`)
  child.stdout.on('data', record)
  child.stderr.on('data', record)
  child.on('exit', (code, signal) =>
    output.push(`[${name}] exited (${signal ?? String(code)})\n`)
  )

  t.after(async () => {
    if (!groupAlive(pid)) return
    process.kill(-pid, 'SIGTERM')
    while (groupAlive(pid)) await sleep(50)
  })
}

/**
 * Calls `check` until it returns a value other than `undefined`.
 * @param what names the awaited state in the timeout error.
 * @throws on timeout, with every started app's output; or the error `check` throws.
 */
export async function waitFor<T>(
  what: string,
  check: () => Promise<T | undefined>,
  timeoutMs: number
): Promise<T> {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    const value = await check()
    if (value !== undefined) return value
    await sleep(250)
  }
  throw new Error(
    `Timed out waiting for ${what}. App output:\n${output.join('')}`
  )
}

/**
 * Starts the backend and the worker on one fresh storage directory, waits until the backend answers, and stops both and removes the directory when the test ends.
 * @returns the backend's base URL.
 */
export async function startStack(t: TestContext) {
  // one storage directory for both apps, as the README's deployment assumes
  const storageDir = await mkdtemp(join(tmpdir(), 'pdm-e2e-'))
  const env = { PORT: String(PORT), STORAGE_DIR: storageDir }
  // `warn` drops the per-request logs, which would bury the worker's in a timeout error
  startApp(t, 'backend', { ...env, FASTIFY_LOG_LEVEL: 'warn' })
  startApp(t, 'worker', env)
  t.after(() => rm(storageDir, { recursive: true, force: true }))

  // wait for the backend; `npm start` builds first, so allow for the compile
  const baseUrl = `http://localhost:${PORT}`
  await waitFor(
    'the backend to answer GET /health',
    () =>
      fetch(`${baseUrl}/health`).then(
        (res) => res.ok || undefined,
        () => undefined // not listening yet
      ),
    60_000
  )
  return baseUrl
}
