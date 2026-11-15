// Local dev server: the app on http://127.0.0.1:8787 with a local Postgres (DATABASE_URL,
// default the `make dev-db` container). createDb applies the pending migrations before the
// server starts. Restarts on changes (tsx watch). Run with `make dev`. There's no Cloudflare
// here, so auth is dev auth (the page's switcher picks who you are) unless the CF_ACCESS_*
// variables are set.

import { serve } from '@hono/node-server'
import { app, type Env } from '../src/app'
import { authFromEnv, parseRaters } from '../src/auth'
import { createDb } from '../src/db'

const url = process.env.DATABASE_URL ?? 'postgres://postgres:dev@127.0.0.1:55434/postgres'
const devDefaults = {
  AUTH_DEV: '1',
  RATERS: 'Maxi <maxi@example.com>, Janina <janina@example.com>',
  DEV_USER_EMAIL: 'maxi@example.com'
}
const vars = { ...devDefaults, ...process.env }
const env: Env = { DB: createDb(url), AUTH: authFromEnv(vars), RATERS: parseRaters(vars.RATERS) }
await env.DB.ready

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: req => app.fetch(req, env), port, hostname: '127.0.0.1' }, () =>
  console.log(`noccooo dev server on http://127.0.0.1:${port}`)
)
