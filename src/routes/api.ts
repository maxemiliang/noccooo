import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { MAX_RATERS, requireRater } from '../auth'
import type { AppEnv } from '../app'
import { users } from '../db/schema'
import { flavoursApi } from './flavours'
import { rankingsApi } from './rankings'
import { findUser, parseId, userJson } from './shared'

export const api = new Hono<AppEnv>()

// Everyone through Access may read; writes need one of the raters (src/auth.ts).
api.use('*', requireRater)

api.route('/flavours', flavoursApi)
api.route('/', rankingsApi)

/** Who you are: your email, your rater row (null for a viewer), and whether auth is dev auth. */
api.get('/me', c => {
  const rater = c.get('rater')
  return c.json({
    email: c.get('email'),
    user: rater ? userJson(rater) : null,
    maxRaters: MAX_RATERS,
    dev: c.env.AUTH.dev,
    // For the dev user switcher only: who you can switch to.
    ...(c.env.AUTH.dev && c.env.RATERS ? { devEmails: c.env.RATERS.map(r => r.email) } : {})
  })
})

const UpdateMe = z.object({ name: z.string().trim().min(1).max(60) })

/** Rename yourself (raters start with their RATERS name, else one made from their email). */
api.patch('/me', async c => {
  const rater = c.get('rater')!
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json', message: 'request body is not valid JSON' }, 400)
  }
  const parsed = UpdateMe.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', message: 'invalid input', details: parsed.error.issues }, 422)
  }
  const [user] = await c.env.DB.db
    .update(users)
    .set({ name: parsed.data.name })
    .where(eq(users.id, rater.id))
    .returning()
  return c.json({ user: userJson(user!) })
})

/** The raters. With RATERS set, only those emails, in its order, even if others have rows. */
api.get('/users', async c => {
  let rows = await c.env.DB.db.select().from(users).orderBy(users.createdAt, users.id)
  const configured = c.env.RATERS
  if (configured) {
    const order = new Map(configured.map((r, i) => [r.email, i]))
    rows = rows.filter(u => order.has(u.email.toLowerCase()))
    rows.sort((x, y) => order.get(x.email.toLowerCase())! - order.get(y.email.toLowerCase())!)
  }
  return c.json({ users: rows.map(userJson) })
})

api.get('/users/:id', async c => {
  const id = parseId(c.req.param('id'))
  const user = id ? await findUser(c, id) : null
  if (!user) return c.json({ error: 'not_found', message: 'no such user' }, 404)
  return c.json({ user: userJson(user) })
})
