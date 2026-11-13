// noccooo's functions on maxcloud. The image runs `maxcloud-functions`, which starts the one
// named in FUNCTION_TARGET. migrations/ is drizzle-kit's (meta/_journal.json), so the runtime
// leaves it alone: the app applies it itself, once per instance, before serving (src/db).

import { onRequest } from '@max-cloud/functions'
import { app, type Env } from './app'
import { createDb } from './db'

let env: Env | undefined

/** Made on first use: `maxcloud-functions --describe` loads this module without a database. */
function productionEnv(): Env {
  env ??= { DB: createDb() }
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
