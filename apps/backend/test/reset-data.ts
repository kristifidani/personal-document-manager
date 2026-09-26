/**
 * Wipes all app data for a clean slate: empties every table except the migrations log, and deletes every file in `STORAGE_DIR`. The schema stays migrated.
 *
 * Runs as `npm run data:reset`, and before the suite in `npm test`: test files run in parallel, so the reset happens once, up front.
 *
 * MVP: wipes whatever `DATABASE_URL` points at, with no guard; add one before any non-local database exists.
 */
import { readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Client, escapeIdentifier } from 'pg'

/** node-pg-migrate's record of applied migrations; wiping it would make `migrate:up` re-run them. */
const MIGRATIONS_TABLE = 'pgmigrations'

async function resetData() {
  const { DATABASE_URL, STORAGE_DIR } = process.env
  if (!DATABASE_URL || !STORAGE_DIR) {
    throw new Error('DATABASE_URL and STORAGE_DIR must be set (see .env)')
  }

  // empty every app table; cascade covers foreign keys between them
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  let tables: string[]
  try {
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = current_schema() and table_type = 'BASE TABLE' and table_name <> $1`,
      [MIGRATIONS_TABLE]
    )
    tables = rows.map((row) => row.table_name)
    if (tables.length > 0) {
      await client.query(
        `truncate ${tables.map(escapeIdentifier).join(', ')} cascade`
      )
    }
  } finally {
    await client.end()
  }

  // delete stored files; storage is flat, so only top-level files are touched
  const dir = resolve(STORAGE_DIR)
  const entries = await readdir(dir, { withFileTypes: true }).catch(
    (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return []
      throw err
    }
  )
  const files = entries.filter((entry) => entry.isFile())
  await Promise.all(files.map((file) => rm(join(dir, file.name))))

  console.log(
    `Reset: emptied ${tables.join(', ') || 'no tables'}; deleted ${files.length} file(s) from ${dir}`
  )
}

resetData().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
