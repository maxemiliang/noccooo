import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app, type Env } from '../src/app'
import { createDb } from '../src/db'

// A real Postgres (make test starts one and sets TEST_DATABASE_URL); createDb applies
// the pending migrations, which the tests then exercise through the app.
let env: Env

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error("TEST_DATABASE_URL isn't set (make test starts the test Postgres)")
  env = { DB: createDb(url) }
  await env.DB.ready
})

afterAll(async () => {
  await env.DB.close()
})

describe('noccooo', () => {
  it('answers /health once the database is up', async () => {
    const res = await app.fetch(new Request('http://localhost/health'), env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; database: string }
    expect(body.status).toBe('ok')
    expect(body.database).toContain('PostgreSQL')
  })

  it('creates, lists and reads a user', async () => {
    const created = await app.fetch(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@noccooo.dev', name: 'Test User' })
      }),
      env
    )
    expect(created.status).toBe(201)
    const { user } = (await created.json()) as { user: { id: number; email: string; name: string } }
    expect(user.email).toBe('test@noccooo.dev')

    const list = await app.fetch(new Request('http://localhost/api/users'), env)
    expect(list.status).toBe(200)
    const { users } = (await list.json()) as { users: { id: number }[] }
    expect(users.some((u: { id: number }) => u.id === user.id)).toBe(true)

    const one = await app.fetch(new Request(`http://localhost/api/users/${user.id}`), env)
    expect(one.status).toBe(200)

    const missing = await app.fetch(new Request('http://localhost/api/users/999999'), env)
    expect(missing.status).toBe(404)
  })

  it('rejects invalid input', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', name: '' })
      }),
      env
    )
    expect(res.status).toBe(422)
  })

  it('answers 404 for unknown routes', async () => {
    const res = await app.fetch(new Request('http://localhost/nope'), env)
    expect(res.status).toBe(404)
  })
})
