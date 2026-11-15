import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import type { AppEnv } from '../app'
import { flavours, users, type Flavour, type User } from '../db/schema'

/** The Postgres error code of an error drizzle wrapped (DrizzleQueryError keeps it in cause). */
export function pgCode(error: unknown): string | undefined {
  let e: unknown = error
  while (e && typeof e === 'object') {
    const code = (e as { code?: unknown }).code
    if (typeof code === 'string') return code
    e = (e as { cause?: unknown }).cause
  }
  return undefined
}

export function parseId(raw: string | undefined): number | null {
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/** A user as the API shows it. */
export function userJson(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  }
}

/** Flavours are listed without their image bytes; the picture is its own endpoint. */
export function flavourJson(flavour: Flavour) {
  return {
    id: flavour.id,
    day: flavour.day,
    name: flavour.name,
    hasImage: flavour.image !== null,
    imageUrl: flavour.image !== null ? `/api/flavours/${flavour.id}/image` : null,
    createdAt: flavour.createdAt,
    updatedAt: flavour.updatedAt
  }
}

export async function findUser(c: Context<AppEnv>, id: number): Promise<User | null> {
  const rows = await c.env.DB.db.select().from(users).where(eq(users.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findFlavour(c: Context<AppEnv>, id: number): Promise<Flavour | null> {
  const rows = await c.env.DB.db.select().from(flavours).where(eq(flavours.id, id)).limit(1)
  return rows[0] ?? null
}
