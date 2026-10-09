import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { type AddressInfo, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'

/** Where each app's `npm start` runs: `apps/<name>`. */
const APPS_DIR = join(__dirname, '..', '..')

/** How long an app gets to exit after SIGTERM before it is killed; the worker finishes its current job first, which can hang. */
const STOP_TIMEOUT_MS = 10_000

/** What the started apps have printed, prefixed by app name; a failed `waitFor` shows it. */
const output: string[] = []

/** Apps that exited before their test stopped them; `waitFor` fails as soon as there is one. */
const exited: string[] = []

/** Process groups of the apps not stopped yet. */
const running = new Set<number>()

/**
 * Sends `signal` to the process group led by `pid`; signal `0` only checks it.
 * @returns whether any process in the group was still running.
 */
function signalGroup(pid: number, signal: NodeJS.Signals | 0) {
  try {
    process.kill(-pid, signal)
    return true
  } catch {
    return false
  }
}

// Ctrl+C reaches only the terminal's process group, not the apps', and skips `t.after`; exit instead, so the `exit` handler stops them
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => process.exit(1))
}
process.on('exit', () => {
  for (const pid of running) signalGroup(pid, 'SIGTERM')
})

/** A port no other process is using: the OS picks one for a throwaway server, which frees it again. */
async function freePort() {
  const server = createServer().listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  server.close()
  await once(server, 'close')
  return port
}

/**
 * Starts an app with its own `npm start`, as a person would, and stops it when the test ends. Each app loads its own `.env`; `env` overrides it.
 *
 * `npm start` runs npm → sh → node, so the app runs in its own process group and stopping it signals the whole group, then waits until every process in it has exited.
 * @throws when the test ends, if the app had to be killed after `STOP_TIMEOUT_MS`.
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
  running.add(pid)

  // keep the output for diagnosing a failure, and note an exit the test didn't ask for
  let stopping = false
  const record = (chunk: Buffer) => output.push(`[${name}] ${chunk.toString()}`)
  child.stdout.on('data', record)
  child.stderr.on('data', record)
  child.on('exit', (code, signal) => {
    output.push(`[${name}] exited (${signal ?? String(code)})\n`)
    if (!stopping) exited.push(name)
  })

  // stop the group, killing it if it outlasts the grace period
  t.after(async () => {
    stopping = true
    signalGroup(pid, 'SIGTERM')
    const deadline = performance.now() + STOP_TIMEOUT_MS
    let killed = false
    while (signalGroup(pid, 0)) {
      if (!killed && performance.now() > deadline) {
        killed = signalGroup(pid, 'SIGKILL')
      }
      await sleep(50)
    }
    running.delete(pid)
    if (killed) {
      throw new Error(
        `${name} did not stop within ${STOP_TIMEOUT_MS} ms of SIGTERM and was killed`
      )
    }
  })
}

/** Everything the started apps have printed so far, for a failure message. */
export function appOutput() {
  return `App output:\n${output.join('')}`
}

/**
 * Calls `check` until it returns a value other than `undefined`.
 * @param what names the awaited state in the timeout error.
 * @throws on timeout or when an app exits early, with every started app's output; or the error `check` throws.
 */
export async function waitFor<T>(
  what: string,
  check: () => Promise<T | undefined>,
  timeoutMs: number
): Promise<T> {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    if (exited.length > 0) {
      throw new Error(
        `${exited.join(' and ')} exited while waiting for ${what}. ${appOutput()}`
      )
    }
    const value = await check()
    if (value !== undefined) return value
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${what}. ${appOutput()}`)
}

/**
 * Starts the backend and the worker on one fresh storage directory and a free port, waits until the backend answers, and stops both and removes the directory when the test ends.
 * @returns the backend's base URL.
 */
export async function startStack(t: TestContext) {
  // a failure shows only this test's apps
  output.length = 0
  exited.length = 0

  // one storage directory for both apps, as the README's deployment assumes
  const storageDir = await mkdtemp(join(tmpdir(), 'pdm-e2e-'))
  const port = await freePort()
  const env = { PORT: String(port), STORAGE_DIR: storageDir }
  // `warn` drops the per-request logs, which would bury the worker's in a failure
  startApp(t, 'backend', { ...env, FASTIFY_LOG_LEVEL: 'warn' })
  startApp(t, 'worker', env)
  t.after(() => rm(storageDir, { recursive: true, force: true }))

  // wait for the backend; `npm start` builds first, so allow for the compile
  const baseUrl = `http://localhost:${port}`
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
