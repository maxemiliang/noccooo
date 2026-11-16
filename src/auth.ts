import { count, eq, sql } from 'drizzle-orm'
import type { Context, Next } from 'hono'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { AppEnv } from './app'
import { users, type User } from './db/schema'

/**
 * Who a request comes from. In production that's Cloudflare Access: the domain is behind
 * an Access application, which signs every request it lets through with a JWT in the
 * Cf-Access-Jwt-Assertion header. The app verifies it (signature, issuer, audience) and
 * takes the email from it, so nobody can reach the app or claim to be someone else by
 * talking to the origin directly. Locally there's no Cloudflare, so dev auth takes the
 * email from a cookie the page's switcher sets.
 */
export interface Auth {
  /** The verified email of whoever sent the request, or null. */
  identify(req: Request): Promise<string | null>
  /** True for dev auth: the page shows a user switcher. */
  dev: boolean
}

export interface AccessConfig {
  /** https://<team>.cloudflareaccess.com — the token issuer, and where its signing keys live. */
  teamDomain: string
  /** The Access application's Application Audience (AUD) tag. */
  aud: string
  /** The keys to verify with; default the team's published ones (tests pass local keys). */
  keys?: JWTVerifyGetKey
}

export function accessAuth(config: AccessConfig): Auth {
  const issuer = config.teamDomain.replace(/\/+$/, '')
  const keys = config.keys ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
  return {
    dev: false,
    async identify(req) {
      const token = req.headers.get('cf-access-jwt-assertion')
      if (!token) return null
      try {
        const { payload } = await jwtVerify(token, keys, { issuer, audience: config.aud })
        // Service tokens carry no email; they aren't raters.
        return typeof payload.email === 'string' ? payload.email.toLowerCase() : null
      } catch {
        return null
      }
    }
  }
}

export const DEV_COOKIE = 'noccooo_dev_user'

/** Local development only: the email comes from the DEV_COOKIE cookie, else `fallback`. */
export function devAuth(fallback = 'dev@localhost'): Auth {
  return {
    dev: true,
    async identify(req) {
      const cookies = req.headers.get('cookie') ?? ''
      const match = new RegExp(`(?:^|;\\s*)${DEV_COOKIE}=([^;]+)`).exec(cookies)
      const email = match?.[1] ? decodeURIComponent(match[1]).trim().toLowerCase() : ''
      return email.includes('@') ? email : fallback
    }
  }
}

/**
 * Auth from the environment: Cloudflare Access when CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD
 * are set, dev auth when AUTH_DEV=1. Neither fails closed: every request gets a 503 that
 * says what to set, so a missing variable never leaves the app open.
 */
export function authFromEnv(env: NodeJS.ProcessEnv = process.env): Auth {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim()
  const aud = env.CF_ACCESS_AUD?.trim()
  if (teamDomain && aud) return accessAuth({ teamDomain, aud })
  if (env.AUTH_DEV === '1') return devAuth(env.DEV_USER_EMAIL)
  return {
    dev: false,
    identify() {
      throw new AuthConfigError()
    }
  }
}

export class AuthConfigError extends Error {
  constructor() {
    super('auth is not configured: set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD (or AUTH_DEV=1 locally)')
  }
}

/** Two people rank the calendar together: at most two raters. */
export const MAX_RATERS = 2

/** A configured rater: who they are and the name they start out with. */
export interface RaterConfig {
  name: string
  email: string
}

/**
 * The RATERS variable: `Maxi <maxi@example.com>, Janina <janina@example.com>`. Unset or
 * empty means no list (the first MAX_RATERS emails become the raters). Throws on a
 * malformed entry, so a typo fails the start instead of locking someone out.
 */
export function parseRaters(raw: string | undefined): RaterConfig[] | null {
  if (!raw?.trim()) return null
  const raters = raw.split(',').map(entry => {
    const match = /^\s*([^<>]+?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(entry)
    if (!match) throw new Error(`RATERS: expected "Name <email>", got ${JSON.stringify(entry.trim())}`)
    return { name: match[1]!, email: match[2]!.toLowerCase() }
  })
  if (raters.length > MAX_RATERS) throw new Error(`RATERS: at most ${MAX_RATERS} raters`)
  return raters
}

// Taken while deciding whether a new email becomes a rater, so two first visits at once
// can't make a third.
const RATER_LOCK = 0x72617465 // "rate"

/**
 * The user row for `email`, or null for a viewer. With RATERS set, exactly those emails
 * are raters, created with their configured name the first time they come by. Without it
 * the first MAX_RATERS people through Access become the raters, named after their email.
 * Either way a rater can rename themselves later; who gets in at all is the Access policy.
 */
export async function userForEmail(c: Context<AppEnv>, email: string): Promise<User | null> {
  const db = c.env.DB.db
  const configured = c.env.RATERS
  if (configured) {
    const rater = configured.find(r => r.email === email)
    if (!rater) return null
    const rows = await db.select().from(users).where(eq(sql`lower(${users.email})`, email)).limit(1)
    if (rows[0]) return rows[0]
    await db.insert(users).values({ email, name: rater.name }).onConflictDoNothing()
    const [created] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    return created ?? null
  }
  const existing = await db.select().from(users).where(eq(sql`lower(${users.email})`, email)).limit(1)
  if (existing[0]) return existing[0]
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(${RATER_LOCK})`)
    const again = await tx.select().from(users).where(eq(sql`lower(${users.email})`, email)).limit(1)
    if (again[0]) return again[0]
    const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(users)
    if (n >= MAX_RATERS) return null
    const [created] = await tx.insert(users).values({ email, name: nameFromEmail(email) }).returning()
    return created ?? null
  })
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0]?.split(/[._+-]/)[0] ?? ''
  return local ? local[0]!.toUpperCase() + local.slice(1) : email
}

/**
 * Everything but /health (the cluster's probe, which never passes Cloudflare) needs a
 * verified identity. Raters (c.var.rater) may write; viewers only read.
 */
export async function requireIdentity(c: Context<AppEnv>, next: Next) {
  if (c.req.path === '/health') return next()
  let email: string | null
  try {
    email = await c.env.AUTH.identify(c.req.raw)
  } catch (error) {
    if (error instanceof AuthConfigError) return c.json({ error: 'auth_unconfigured', message: error.message }, 503)
    throw error
  }
  if (!email) {
    return c.json(
      { error: 'unauthorized', message: 'sign in through Cloudflare Access (no valid Cf-Access-Jwt-Assertion)' },
      401
    )
  }
  c.set('email', email)
  const user = await userForEmail(c, email)
  if (user) c.set('rater', user)
  return next()
}

/** Writes under /api need a rater. */
export async function requireRater(c: Context<AppEnv>, next: Next) {
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return next()
  if (!c.get('rater')) {
    return c.json(
      { error: 'forbidden', message: `only the ${MAX_RATERS} raters can make changes; you're signed in as a viewer` },
      403
    )
  }
  return next()
}
