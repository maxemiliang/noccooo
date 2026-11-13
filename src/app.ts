import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Db } from './db'
import { api } from './routes/api'

/** What every request handler gets: the database (pool, drizzle client, migration state). */
export interface Env {
  DB: Db
}

export type AppEnv = {
  Bindings: Env
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

app.get('/', c => c.json({ name: 'noccooo', links: { health: '/health', api: '/api' } }))

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
