// noccooo's functions on maxcloud. The image runs `maxcloud-functions`, which starts the one
// named in FUNCTION_TARGET. migrations/ is drizzle-kit's (meta/_journal.json), so the runtime
// leaves it alone: the app applies it itself, once per instance, before serving (src/db).

import { onRequest } from '@max-cloud/functions'
import { app, type Env } from './app'
import { authFromEnv, parseRaters } from './auth'
import { createDb } from './db'

let env: Env | undefined

/**
 * Made on first use: `maxcloud-functions --describe` loads this module without a database.
 * Auth is Cloudflare Access (CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD from maxcloud.yaml's env:);
 * the raters are RATERS (mcloud env set, so the emails stay out of this public repo).
 */
function productionEnv(): Env {
  env ??= { DB: createDb(), AUTH: authFromEnv(), RATERS: parseRaters(process.env.RATERS) }
  return env
}

/**
 * The web app. Private (cluster-local) until maxcloud.yaml's domains: give it a hostname
 * (and public: true a web-<app>.gronblom.dev one). One instance stays up, so a cold start
 * (Node, then the migration check) never greets a request.
 */
export const web = onRequest(
  { minInstances: 1, maxInstances: 2, memory: '256Mi', healthPath: '/health' },
  req => app.fetch(req, productionEnv())
)
