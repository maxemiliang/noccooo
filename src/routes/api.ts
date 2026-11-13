import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app'
import { users } from '../db/schema'

export const api = new Hono<AppEnv>()

/** The Postgres error code of an error drizzle wrapped (DrizzleQueryError keeps it in cause). */
function pgCode(error: unknown): string | undefined {
  let e: unknown = error
  while (e && typeof e === 'object') {
    const code = (e as { code?: unknown }).code
    if (typeof code === 'string') return code
    e = (e as { cause?: unknown }).cause
  }
  return undefined
}

const NewUser = z.object({
  email: z.email(),
  name: z.string().min(1).max(200)
})

api.get('/users', async c => {
  const rows = await c.env.DB.db.select().from(users).orderBy(users.createdAt, users.id)
  return c.json({ users: rows })
})

api.post('/users', async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json', message: 'request body is not valid JSON' }, 400)
  }
  const parsed = NewUser.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', message: 'invalid input', details: parsed.error.issues }, 422)
  }
  try {
    const [user] = await c.env.DB.db.insert(users).values(parsed.data).returning()
    return c.json({ user }, 201)
  } catch (error) {
    if (pgCode(error) === '23505') {
      return c.json({ error: 'conflict', message: 'a user with that email already exists' }, 409)
    }
    throw error
  }
})

api.get('/users/:id', async c => {
  const id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id <= 0) {
    return c.json({ error: 'not_found', message: 'no such user' }, 404)
  }
  const rows = await c.env.DB.db.select().from(users).where(eq(users.id, id)).limit(1)
  const user = rows[0]
  if (!user) return c.json({ error: 'not_found', message: 'no such user' }, 404)
  return c.json({ user })
})
