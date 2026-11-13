// Local dev server: the app on http://127.0.0.1:8787 with a local Postgres (DATABASE_URL,
// default the `make dev-db` container). createDb applies the pending migrations before the
// server starts. Restarts on changes (tsx watch). Run with `make dev`.

import { serve } from '@hono/node-server'
import { app, type Env } from '../src/app'
import { createDb } from '../src/db'

const url = process.env.DATABASE_URL ?? 'postgres://postgres:dev@127.0.0.1:55434/postgres'
const env: Env = { DB: createDb(url) }
await env.DB.ready

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: req => app.fetch(req, env), port, hostname: '127.0.0.1' }, () =>
  console.log(`noccooo dev server on http://127.0.0.1:${port}`)
)
