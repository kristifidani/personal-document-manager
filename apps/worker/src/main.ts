/**
 * Worker entry point, started by `npm run dev` / `npm start`. Validates the environment, then exits.
 */
import { loadConfig } from './env'

function main() {
  loadConfig()
  console.log('Worker started')
  // TODO: poll the jobs queue.
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exitCode = 1
}
