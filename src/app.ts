import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { requireIdentity, type Auth, type RaterConfig } from './auth'
import type { Db } from './db'
import type { User } from './db/schema'
import { page } from './page'
import { api } from './routes/api'

/** What every request handler gets: the database and how to tell who's asking (src/auth.ts). */
export interface Env {
  DB: Db
  AUTH: Auth
  /** The RATERS variable (src/auth.ts parseRaters): who the raters are and their names. */
  RATERS?: RaterConfig[] | null
}

export type AppEnv = {
  Bindings: Env
  /**
   * Set by requireIdentity: the verified email, and the rater it belongs to (unset for a
   * viewer, who may only read).
   */
  Variables: { email: string; rater?: User }
}

const app = new Hono<AppEnv>()

// Requests wait for the migrations and get a 503 if they failed, so a pod with an
// unusable or outdated database never turns ready (healthPath: /health in src/index.ts).
app.use('*', async (c, next) => {
  try {
    await c.env.DB.ready
  } catch (error) {
    return c.json({ error: 'database_unavailable', message: (error as Error).message }, 503)
  }
  await next()
})

// Everything but /health needs a verified identity (Cloudflare Access in production).
app.use('*', requireIdentity)

// The tier-list app (src/page.ts); the JSON API lives under /api.
app.get('/', c => c.html(page))

app.get('/health', async c => {
  const { rows } = await c.env.DB.db.execute<{ version: string }>(sql`select version() as version`)
  return c.json({ status: 'ok', database: rows[0]?.version ?? 'unknown' })
})

app.route('/api', api)

app.notFound(c => c.json({ error: 'not_found', message: 'no such route' }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  console.error(err)
  return c.json({ error: 'internal', message: 'internal error' }, 500)
})

export { app }
