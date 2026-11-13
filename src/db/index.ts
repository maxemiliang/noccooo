import { resolve } from 'node:path'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import * as schema from './schema'

export { schema }

// Any constant works; it only has to be the same for every instance of this app
const MIGRATION_LOCK = 0x6e6f6363 // "nocc"

export interface Db {
  /** The drizzle client, on a pool of its own. */
  db: NodePgDatabase<typeof schema>
  /**
   * Resolves once the pending migrations in migrations/ have been applied, rejects if they
   * failed. Started by createDb; every request waits for it (src/app.ts), so a pod with an
   * unusable or outdated database never turns ready.
   */
  ready: Promise<void>
  close(): Promise<void>
}

/**
 * A database on `url` (default $DATABASE_URL, which maxcloud sets for apps with `db:` in
 * maxcloud.yaml). Starts the migrations right away, once per instance.
 */
export function createDb(url = process.env.DATABASE_URL): Db {
  if (!url) {
    throw new Error("DATABASE_URL isn't set (maxcloud sets it for apps with db: in maxcloud.yaml; locally: make dev-db, .env)")
  }
  const pool = new pg.Pool({ connectionString: url, max: 10 })
  // A pooled connection that drops while idle (failover, server restart) is reported here;
  // without a listener it would crash the process. The pool replaces it on the next query.
  pool.on('error', error => console.error(`[db] Idle connection lost: ${error.message}`))
  let resolveReady!: () => void
  let rejectReady!: (error: unknown) => void
  const ready = new Promise<void>((res, rej) => {
    resolveReady = res
    rejectReady = rej
  })
  migrateDb(url).then(resolveReady, rejectReady)
  return {
    db: drizzle(pool, { schema }),
    ready,
    close: () => pool.end()
  }
}

/**
 * Applies pending migrations. A session-level advisory lock makes instances that start
 * together (a rollout with several replicas) take turns, so each migration runs once.
 */
async function migrateDb(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK])
    await migrate(drizzle(client), { migrationsFolder: resolve('migrations') })
  } finally {
    // Ending the session releases the lock
    await client.end()
  }
}
