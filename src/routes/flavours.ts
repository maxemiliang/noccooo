import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app'
import { flavours } from '../db/schema'
import { findFlavour, flavourJson, parseId, pgCode } from './shared'

export const flavoursApi = new Hono<AppEnv>()

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])

const NewFlavour = z.object({
  day: z.int().min(1).max(24),
  name: z.string().min(1).max(200)
})
const UpdateFlavour = NewFlavour.partial()

flavoursApi.get('/', async c => {
  const rows = await c.env.DB.db.select().from(flavours).orderBy(asc(flavours.day), asc(flavours.id))
  return c.json({ flavours: rows.map(flavourJson) })
})

flavoursApi.post('/', async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json', message: 'request body is not valid JSON' }, 400)
  }
  const parsed = NewFlavour.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', message: 'invalid input', details: parsed.error.issues }, 422)
  }
  try {
    const [flavour] = await c.env.DB.db.insert(flavours).values(parsed.data).returning()
    return c.json({ flavour: flavourJson(flavour!) }, 201)
  } catch (error) {
    if (pgCode(error) === '23505') {
      return c.json({ error: 'conflict', message: 'that calendar day already has a flavour' }, 409)
    }
    if (pgCode(error) === '23514') {
      return c.json({ error: 'invalid_input', message: 'day must be between 1 and 24' }, 422)
    }
    throw error
  }
})

flavoursApi.get('/:id', async c => {
  const id = parseId(c.req.param('id'))
  const flavour = id ? await findFlavour(c, id) : null
  if (!flavour) return c.json({ error: 'not_found', message: 'no such flavour' }, 404)
  return c.json({ flavour: flavourJson(flavour) })
})

flavoursApi.patch('/:id', async c => {
  const id = parseId(c.req.param('id'))
  const flavour = id ? await findFlavour(c, id) : null
  if (!flavour) return c.json({ error: 'not_found', message: 'no such flavour' }, 404)
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json', message: 'request body is not valid JSON' }, 400)
  }
  const parsed = UpdateFlavour.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', message: 'invalid input', details: parsed.error.issues }, 422)
  }
  try {
    const [updated] = await c.env.DB.db
      .update(flavours)
      .set(parsed.data)
      .where(eq(flavours.id, flavour.id))
      .returning()
    return c.json({ flavour: flavourJson(updated!) })
  } catch (error) {
    if (pgCode(error) === '23505') {
      return c.json({ error: 'conflict', message: 'that calendar day already has a flavour' }, 409)
    }
    if (pgCode(error) === '23514') {
      return c.json({ error: 'invalid_input', message: 'day must be between 1 and 24' }, 422)
    }
    throw error
  }
})

flavoursApi.delete('/:id', async c => {
  const id = parseId(c.req.param('id'))
  const flavour = id ? await findFlavour(c, id) : null
  if (!flavour) return c.json({ error: 'not_found', message: 'no such flavour' }, 404)
  await c.env.DB.db.delete(flavours).where(eq(flavours.id, flavour.id))
  return c.body(null, 204)
})

/**
 * Upload the flavour's picture: the raw image bytes as the request body, its type in
 * content-type. Stored inline in the database (bytea), so it survives restarts.
 */
flavoursApi.post('/:id/image', async c => {
  const id = parseId(c.req.param('id'))
  const flavour = id ? await findFlavour(c, id) : null
  if (!flavour) return c.json({ error: 'not_found', message: 'no such flavour' }, 404)
  const type = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (!IMAGE_TYPES.has(type)) {
    return c.json(
      { error: 'unsupported_media_type', message: `content-type must be one of ${[...IMAGE_TYPES].join(', ')}` },
      415
    )
  }
  const declared = Number(c.req.header('content-length'))
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    return c.json({ error: 'too_large', message: `image must be at most ${MAX_IMAGE_BYTES / 1024 / 1024} MiB` }, 413)
  }
  const image = Buffer.from(await c.req.arrayBuffer())
  if (image.byteLength === 0) {
    return c.json({ error: 'invalid_input', message: 'empty body' }, 400)
  }
  if (image.byteLength > MAX_IMAGE_BYTES) {
    return c.json({ error: 'too_large', message: `image must be at most ${MAX_IMAGE_BYTES / 1024 / 1024} MiB` }, 413)
  }
  const [updated] = await c.env.DB.db
    .update(flavours)
    .set({ image, imageContentType: type })
    .where(eq(flavours.id, flavour.id))
    .returning()
  return c.json({ flavour: flavourJson(updated!) })
})

flavoursApi.get('/:id/image', async c => {
  const id = parseId(c.req.param('id'))
  const flavour = id ? await findFlavour(c, id) : null
  if (!flavour?.image || !flavour.imageContentType) {
    return c.json({ error: 'not_found', message: 'no such flavour or it has no picture' }, 404)
  }
  return c.body(new Uint8Array(flavour.image), 200, {
    'content-type': flavour.imageContentType,
    'cache-control': 'public, max-age=3600'
  })
})
