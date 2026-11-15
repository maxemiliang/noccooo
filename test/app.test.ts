import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type CryptoKey } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app, type Env } from '../src/app'
import { accessAuth, authFromEnv, parseRaters } from '../src/auth'
import { createDb } from '../src/db'
import { flavours, rankings, users } from '../src/db/schema'

// A real Postgres (make test starts one and sets TEST_DATABASE_URL); createDb applies
// the pending migrations, which the tests then exercise through the app. Auth is the real
// Cloudflare Access verifier, with a local signing key standing in for the team's.
const TEAM = 'https://noccooo-test.cloudflareaccess.com'
const AUD = 'test-aud-tag'
let env: Env
let signingKey: CryptoKey
let otherKey: CryptoKey

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error("TEST_DATABASE_URL isn't set (make test starts the test Postgres)")
  const pair = await generateKeyPair('ES256')
  signingKey = pair.privateKey
  otherKey = (await generateKeyPair('ES256')).privateKey
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' }
  env = {
    DB: createDb(url),
    AUTH: accessAuth({ teamDomain: TEAM, aud: AUD, keys: createLocalJWKSet({ keys: [jwk] }) })
  }
  await env.DB.ready
  // The test container keeps its data between runs; start every run from a clean slate.
  await env.DB.db.delete(rankings)
  await env.DB.db.delete(flavours)
  await env.DB.db.delete(users)
})

afterAll(async () => {
  await env.DB.close()
})

type JwtOpts = { aud?: string; iss?: string; exp?: string | number; key?: CryptoKey }

/** A Cf-Access-Jwt-Assertion like the one Access adds for `email`. */
function accessJwt(email: string, opts: JwtOpts = {}) {
  return new SignJWT({ email, type: 'app' })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setIssuer(opts.iss ?? TEAM)
    .setAudience([opts.aud ?? AUD])
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(opts.key ?? signingKey)
}

/** `as` defaults to Alice; `anon` sends no Access token at all. */
type CallOpts = {
  json?: unknown
  body?: string | Uint8Array
  as?: string
  anon?: boolean
  jwt?: string
  headers?: Record<string, string>
}

async function call(method: string, path: string, opts: CallOpts = {}) {
  const headers: Record<string, string> = { ...opts.headers }
  const jwt = opts.jwt ?? (opts.anon ? undefined : await accessJwt(opts.as ?? ALICE))
  if (jwt) headers['cf-access-jwt-assertion'] = jwt
  let body: string | Uint8Array | undefined
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(opts.json)
  } else if (opts.body !== undefined) {
    body = opts.body
  }
  return app.fetch(new Request(`http://localhost${path}`, { method, headers, body }), env)
}

const ALICE = 'alice@noccooo.dev'
const BOB = 'bob@noccooo.dev'
const EVE = 'eve@noccooo.dev'

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

describe('noccooo base', () => {
  it('answers /health once the database is up', async () => {
    const res = await call('GET', '/health', { anon: true })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; database: string }
    expect(body.status).toBe('ok')
    expect(body.database).toContain('PostgreSQL')
  })

  it('serves the app page at / and its script parses', async () => {
    const res = await call('GET', '/', { as: ALICE })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('noccooo')
    const script = html.match(/<script>([\s\S]*)<\/script>/)
    expect(script).toBeTruthy()
    // Parses (does not run) — catches broken escaping in src/page.ts
    new Function(script![1]!)
  })

  it('answers 404 for unknown routes', async () => {
    const res = await call('GET', '/nope', { as: ALICE })
    expect(res.status).toBe(404)
  })
})

describe('Cloudflare Access auth', () => {
  it('lets /health through without Access (the cluster probe)', async () => {
    expect((await call('GET', '/health', { anon: true })).status).toBe(200)
  })

  it('rejects requests without a valid Access token', async () => {
    expect((await call('GET', '/', { anon: true })).status).toBe(401)
    expect((await call('GET', '/api/flavours', { anon: true })).status).toBe(401)
    expect((await call('GET', '/api/me', { jwt: 'not.a.jwt' })).status).toBe(401)
    expect((await call('GET', '/api/me', { jwt: await accessJwt(ALICE, { aud: 'other-app' }) })).status).toBe(401)
    expect((await call('GET', '/api/me', { jwt: await accessJwt(ALICE, { iss: 'https://evil.cloudflareaccess.com' }) })).status).toBe(401)
    expect((await call('GET', '/api/me', { jwt: await accessJwt(ALICE, { exp: Math.floor(Date.now() / 1000) - 60 }) })).status).toBe(401)
    expect((await call('GET', '/api/me', { jwt: await accessJwt(ALICE, { key: otherKey }) })).status).toBe(401)
    // The plain email header Access also sends is never trusted on its own
    expect((await call('GET', '/api/me', { anon: true, headers: { 'cf-access-authenticated-user-email': ALICE } })).status).toBe(401)
  })

  it('fails closed when auth is not configured', async () => {
    const unconfigured: Env = { DB: env.DB, AUTH: authFromEnv({}) }
    const res = await app.fetch(new Request('http://localhost/api/me'), unconfigured)
    expect(res.status).toBe(503)
    expect(((await res.json()) as { error: string }).error).toBe('auth_unconfigured')
  })

  it('makes the first two people raters, named after their email', async () => {
    const res = await call('GET', '/api/me', { as: 'Alice@Noccooo.dev' })
    expect(res.status).toBe(200)
    const me = (await res.json()) as { email: string; user: { id: number; name: string; email: string } | null; dev: boolean }
    expect(me.email).toBe(ALICE)
    expect(me.user).toMatchObject({ name: 'Alice', email: ALICE })
    expect(me.dev).toBe(false)

    // Same person again: same row
    const again = (await (await call('GET', '/api/me', { as: ALICE })).json()) as { user: { id: number } }
    expect(again.user.id).toBe(me.user!.id)

    const bob = (await (await call('GET', '/api/me', { as: BOB })).json()) as { user: { name: string } | null }
    expect(bob.user?.name).toBe('Bob')
  })

  it('a third person is a viewer: can read, cannot write', async () => {
    const eve = (await (await call('GET', '/api/me', { as: EVE })).json()) as { user: unknown }
    expect(eve.user).toBeNull()
    expect((await call('GET', '/api/flavours', { as: EVE })).status).toBe(200)
    expect((await call('GET', '/', { as: EVE })).status).toBe(200)
    expect((await call('POST', '/api/flavours', { as: EVE, json: { day: 1, name: 'x' } })).status).toBe(403)
    expect((await call('PATCH', '/api/me', { as: EVE, json: { name: 'Eve' } })).status).toBe(403)

    const { users } = (await (await call('GET', '/api/users', { as: EVE })).json()) as { users: { email: string }[] }
    expect(users.map(u => u.email)).toEqual([ALICE, BOB])
  })

  it('raters rename themselves', async () => {
    const res = await call('PATCH', '/api/me', { as: ALICE, json: { name: '  Alice G  ' } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { user: { name: string } }).user.name).toBe('Alice G')
    expect((await call('PATCH', '/api/me', { as: ALICE, json: { name: '' } })).status).toBe(422)
    await call('PATCH', '/api/me', { as: ALICE, json: { name: 'Alice' } })
  })

  it('reads one user, 404 for unknown ones', async () => {
    const { users } = (await (await call('GET', '/api/users', { as: ALICE })).json()) as { users: { id: number }[] }
    expect((await call('GET', `/api/users/${users[0]!.id}`, { as: ALICE })).status).toBe(200)
    expect((await call('GET', '/api/users/999999', { as: ALICE })).status).toBe(404)
  })
})

describe('flavours and pictures', () => {
  let f1: number, f2: number, f3: number

  it('creates flavours and validates input', async () => {
    const created = await call('POST', '/api/flavours', { as: ALICE, json: { day: 1, name: 'Peppermint' } })
    expect(created.status).toBe(201)
    f1 = ((await created.json()) as { flavour: { id: number } }).flavour.id

    expect((await call('POST', '/api/flavours', { as: ALICE, json: { day: 1, name: 'Dupe' } })).status).toBe(409)
    expect((await call('POST', '/api/flavours', { as: ALICE, json: { day: 25, name: 'X' } })).status).toBe(422)
    expect((await call('POST', '/api/flavours', { as: ALICE, json: { day: 0, name: 'X' } })).status).toBe(422)
    expect((await call('POST', '/api/flavours', { as: ALICE, json: { day: 2 } })).status).toBe(422)

    for (const [day, name] of [[2, 'Salted caramel'], [3, 'Gingerbread']] as const) {
      const res = await call('POST', '/api/flavours', { as: ALICE, json: { day, name } })
      expect(res.status).toBe(201)
      const id = ((await res.json()) as { flavour: { id: number } }).flavour.id
      if (day === 2) f2 = id
      else f3 = id
    }

    const list = await call('GET', '/api/flavours')
    const { flavours } = (await list.json()) as { flavours: { day: number; hasImage: boolean }[] }
    expect(flavours.map(f => f.day)).toEqual([1, 2, 3])
    expect(flavours.every(f => f.hasImage === false)).toBe(true)

    expect((await call('GET', `/api/flavours/${f1}`)).status).toBe(200)
    expect((await call('GET', '/api/flavours/999999')).status).toBe(404)
  })

  it('renames a flavour and rejects a taken day', async () => {
    const renamed = await call('PATCH', `/api/flavours/${f1}`, { as: ALICE, json: { name: 'Peppermint bark' } })
    expect(renamed.status).toBe(200)
    const { flavour } = (await renamed.json()) as { flavour: { name: string } }
    expect(flavour.name).toBe('Peppermint bark')
    expect((await call('PATCH', `/api/flavours/${f1}`, { as: ALICE, json: { day: 2 } })).status).toBe(409)
  })

  it('stores and serves the picture', async () => {
    expect(
      (await call('POST', `/api/flavours/${f1}/image`, { as: ALICE, body: PNG, headers: { 'content-type': 'image/png' } })).status
    ).toBe(200)

    const img = await call('GET', `/api/flavours/${f1}/image`)
    expect(img.status).toBe(200)
    expect(img.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await img.arrayBuffer()).equals(PNG)).toBe(true)

    const listed = (await (await call('GET', '/api/flavours')).json()) as { flavours: { id: number; hasImage: boolean; imageUrl: string | null }[] }
    const me = listed.flavours.find(f => f.id === f1)!
    expect(me.hasImage).toBe(true)
    expect(me.imageUrl).toBe(`/api/flavours/${f1}/image`)

    // no picture yet on f2
    expect((await call('GET', `/api/flavours/${f2}/image`)).status).toBe(404)
  })

  it('rejects bad pictures', async () => {
    expect(
      (await call('POST', `/api/flavours/${f2}/image`, { as: ALICE, body: 'hello', headers: { 'content-type': 'text/plain' } })).status
    ).toBe(415)
    expect(
      (await call('POST', `/api/flavours/${f2}/image`, {
        as: ALICE,
        body: Buffer.alloc(5 * 1024 * 1024 + 1),
        headers: { 'content-type': 'image/png' }
      })).status
    ).toBe(413)
    expect((await call('POST', `/api/flavours/${f2}/image`, { as: EVE, body: PNG, headers: { 'content-type': 'image/png' } })).status).toBe(403)
  })

  it('deletes a flavour', async () => {
    const created = await call('POST', '/api/flavours', { as: ALICE, json: { day: 24, name: 'Temporary' } })
    const id = ((await created.json()) as { flavour: { id: number } }).flavour.id
    expect((await call('DELETE', `/api/flavours/${id}`, { as: EVE })).status).toBe(403)
    expect((await call('DELETE', `/api/flavours/${id}`, { as: ALICE })).status).toBe(204)
    expect((await call('GET', `/api/flavours/${id}`)).status).toBe(404)
  })

  it('keeps the three flavours for the ranking tests', () => {
    expect([f1, f2, f3].every(id => Number.isSafeInteger(id) && id > 0)).toBe(true)
  })
})

// Tier lists and compare need the flavours from the describe above; keep them in module scope.
let F1 = 0, F2 = 0, F3 = 0

type RankingRow = { flavourId: number; rank: number; tier: string }

describe('tier lists and compare', () => {
  beforeAll(async () => {
    const list = (await (await call('GET', '/api/flavours')).json()) as { flavours: { id: number; day: number }[] }
    const byDay = new Map(list.flavours.map(f => [f.day, f.id]))
    F1 = byDay.get(1)!
    F2 = byDay.get(2)!
    F3 = byDay.get(3)!
  })

  async function userId(email: string): Promise<number> {
    const { users } = (await (await call('GET', '/api/users')).json()) as { users: { id: number; email: string }[] }
    return users.find(u => u.email === email)!.id
  }

  it('validates tier list writes', async () => {
    const alice = await userId(ALICE)
    const put = (opts: CallOpts) => call('PUT', `/api/users/${alice}/rankings`, opts)
    expect((await put({ anon: true, json: { tiers: { S: [F1] } } })).status).toBe(401)
    // Bob on Alice's tier list, and a viewer
    expect((await put({ as: BOB, json: { tiers: { S: [F1] } } })).status).toBe(403)
    expect((await put({ as: EVE, json: { tiers: { S: [F1] } } })).status).toBe(403)
    expect((await put({ json: { tiers: { S: [F1], A: [F1] } } })).status).toBe(422)
    expect((await put({ json: { tiers: { S: [999999] } } })).status).toBe(422)
    expect((await put({ json: { tiers: { Z: [F1] } } })).status).toBe(422)
    expect((await put({ json: { order: [F1] } })).status).toBe(422)
    expect((await call('PUT', '/api/users/999999/rankings', { json: { tiers: {} } })).status).toBe(404)
  })

  it('replaces a tier list wholesale; ranks run in reading order', async () => {
    const alice = await userId(ALICE)
    const res = await call('PUT', `/api/users/${alice}/rankings`, { json: { tiers: { A: [F3], C: [F1, F2] } } })
    expect(res.status).toBe(200)
    const { rankings } = (await res.json()) as { rankings: RankingRow[] }
    expect(rankings.map(({ flavourId, rank, tier }) => ({ flavourId, rank, tier }))).toEqual([
      { flavourId: F3, rank: 1, tier: 'A' },
      { flavourId: F1, rank: 2, tier: 'C' },
      { flavourId: F2, rank: 3, tier: 'C' }
    ])

    const got = (await (await call('GET', `/api/users/${alice}/rankings`, { as: EVE })).json()) as { rankings: RankingRow[] }
    expect(got.rankings.map(r => [r.flavourId, r.tier])).toEqual([[F3, 'A'], [F1, 'C'], [F2, 'C']])

    // Unplacing everything
    const cleared = (await (await call('PUT', `/api/users/${alice}/rankings`, { json: { tiers: {} } })).json()) as { rankings: RankingRow[] }
    expect(cleared.rankings).toEqual([])
  })

  it('compares two raters: spearman -1 for reversed lists', async () => {
    const alice = await userId(ALICE)
    const bob = await userId(BOB)
    await call('PUT', `/api/users/${alice}/rankings`, { json: { tiers: { S: [F1], B: [F2], F: [F3] } } })
    await call('PUT', `/api/users/${bob}/rankings`, { as: BOB, json: { tiers: { S: [F3], B: [F2], D: [F1] } } })

    expect((await call('GET', '/api/compare')).status).toBe(422)
    expect((await call('GET', `/api/compare?a=${alice}&b=${alice}`)).status).toBe(422)
    expect((await call('GET', `/api/compare?a=${alice}&b=999999`)).status).toBe(404)

    const res = await call('GET', `/api/compare?a=${alice}&b=${bob}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      spearman: number | null
      bothPlaced: number
      sameTier: number
      entries: { flavour: { id: number }; tierA: string | null; tierB: string | null; rankA: number | null; rankB: number | null; diff: number | null }[]
      biggestDisagreements: { flavour: { id: number }; diff: number }[]
      a: { name: string }; b: { name: string }
    }
    expect(body.a.name).toBe('Alice')
    expect(body.b.name).toBe('Bob')
    expect(body.spearman).toBe(-1)
    expect(body.bothPlaced).toBe(3)
    expect(body.sameTier).toBe(1)
    const byId = new Map(body.entries.map(e => [e.flavour.id, e]))
    expect(byId.get(F1)).toMatchObject({ tierA: 'S', tierB: 'D', rankA: 1, rankB: 3, diff: 2 })
    expect(byId.get(F2)).toMatchObject({ tierA: 'B', tierB: 'B', rankA: 2, rankB: 2, diff: 0 })
    expect(byId.get(F3)).toMatchObject({ tierA: 'F', tierB: 'S', rankA: 3, rankB: 1, diff: 2 })
    // Agreements aren't disagreements
    expect(body.biggestDisagreements.map(e => e.diff)).toEqual([2, 2])
  })

  it('spearman 1 for identical lists, null when too few in common', async () => {
    const alice = await userId(ALICE)
    const bob = await userId(BOB)
    await call('PUT', `/api/users/${bob}/rankings`, { as: BOB, json: { tiers: { S: [F1], B: [F2], F: [F3] } } })
    let body = (await (await call('GET', `/api/compare?a=${alice}&b=${bob}`)).json()) as { spearman: number | null; sameTier: number }
    expect(body.spearman).toBe(1)
    expect(body.sameTier).toBe(3)

    // Bob places only one flavour: not enough in common for rho
    await call('PUT', `/api/users/${bob}/rankings`, { as: BOB, json: { tiers: { A: [F2] } } })
    const partial = (await (await call('GET', `/api/compare?a=${alice}&b=${bob}`)).json()) as {
      spearman: number | null
      entries: { flavour: { id: number }; tierB: string | null; rankB: number | null; diff: number | null }[]
    }
    expect(partial.spearman).toBeNull()
    const byId = new Map(partial.entries.map(e => [e.flavour.id, e]))
    expect(byId.get(F2)).toMatchObject({ tierB: 'A', rankB: 1, diff: 1 })
    expect(byId.get(F1)).toMatchObject({ tierB: null, rankB: null, diff: null })
  })

  it('deleting a flavour takes it out of both tier lists', async () => {
    const alice = await userId(ALICE)
    const created = await call('POST', '/api/flavours', { json: { day: 20, name: 'Short-lived' } })
    const id = ((await created.json()) as { flavour: { id: number } }).flavour.id
    await call('PUT', `/api/users/${alice}/rankings`, { json: { tiers: { S: [id, F1] } } })
    expect((await call('DELETE', `/api/flavours/${id}`)).status).toBe(204)
    const got = (await (await call('GET', `/api/users/${alice}/rankings`)).json()) as { rankings: RankingRow[] }
    expect(got.rankings.map(r => r.flavourId)).toEqual([F1])
  })
})

describe('RATERS: configured raters and their names', () => {
  // Same database and Access verifier, but with the raters named up front.
  let configured: Env
  beforeAll(() => {
    configured = { ...env, RATERS: parseRaters('Maxi <Maxi@noccooo.dev>, Janina <janina@noccooo.dev>') }
  })
  const callConfigured = async (path: string, email: string) =>
    app.fetch(
      new Request(`http://localhost${path}`, { headers: { 'cf-access-jwt-assertion': await accessJwt(email) } }),
      configured
    )

  it('parses "Name <email>" lists and rejects malformed ones', () => {
    expect(parseRaters(undefined)).toBeNull()
    expect(parseRaters('  ')).toBeNull()
    expect(parseRaters('Maxi <A@B.fi>,Janina<c@d.fi>')).toEqual([
      { name: 'Maxi', email: 'a@b.fi' },
      { name: 'Janina', email: 'c@d.fi' }
    ])
    expect(() => parseRaters('maxi@b.fi')).toThrow(/Name <email>/)
    expect(() => parseRaters('A <a@b.fi>, B <b@b.fi>, C <c@b.fi>')).toThrow(/at most/)
  })

  it('creates the listed raters with their names; everyone else is a viewer', async () => {
    const maxi = (await (await callConfigured('/api/me', 'maxi@noccooo.dev')).json()) as { user: { name: string } | null }
    expect(maxi.user?.name).toBe('Maxi')
    const janina = (await (await callConfigured('/api/me', 'janina@noccooo.dev')).json()) as { user: { name: string } | null }
    expect(janina.user?.name).toBe('Janina')
    // Alice has a row from before, but isn't on the list
    const alice = (await (await callConfigured('/api/me', ALICE)).json()) as { user: unknown }
    expect(alice.user).toBeNull()

    const { users } = (await (await callConfigured('/api/users', ALICE)).json()) as { users: { name: string }[] }
    expect(users.map(u => u.name)).toEqual(['Maxi', 'Janina'])
  })
})
