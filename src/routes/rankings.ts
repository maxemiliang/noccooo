import { asc, eq, inArray } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app'
import { flavours, rankings, TIERS, type Tier } from '../db/schema'
import { findUser, flavourJson, parseId } from './shared'

export const rankingsApi = new Hono<AppEnv>()

const flavourIds = z.array(z.int().positive()).optional()

/** The whole tier list: flavour ids per tier, best first within the tier. Missing tiers are empty. */
const SetTiers = z.object({
  tiers: z.strictObject({ S: flavourIds, A: flavourIds, B: flavourIds, C: flavourIds, D: flavourIds, F: flavourIds })
})

type RankingEntry = {
  flavourId: number
  rank: number
  tier: Tier
  flavour: ReturnType<typeof flavourJson>
}

async function listRankings(c: Context<AppEnv>, userId: number): Promise<RankingEntry[]> {
  const rows = await c.env.DB.db
    .select({ rank: rankings.rank, tier: rankings.tier, flavour: flavours })
    .from(rankings)
    .innerJoin(flavours, eq(rankings.flavourId, flavours.id))
    .where(eq(rankings.userId, userId))
    .orderBy(asc(rankings.rank))
  // Numbered from the stored order, so a deleted flavour leaves no gap.
  return rows.map((row, i) => ({
    flavourId: row.flavour.id,
    rank: i + 1,
    tier: row.tier,
    flavour: flavourJson(row.flavour)
  }))
}

/**
 * Replace a rater's whole tier list. Only the rater themself may do it. Ranks number the
 * placed flavours in reading order: S left to right, then A, and so on.
 */
rankingsApi.put('/users/:userId/rankings', async c => {
  const userId = parseId(c.req.param('userId'))
  const rater = c.get('rater')
  const user = userId ? await findUser(c, userId) : null
  if (!userId || !user) return c.json({ error: 'not_found', message: 'no such user' }, 404)
  if (rater?.id !== userId) {
    return c.json({ error: 'forbidden', message: 'you can only change your own tier list' }, 403)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json', message: 'request body is not valid JSON' }, 400)
  }
  const parsed = SetTiers.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', message: 'invalid input', details: parsed.error.issues }, 422)
  }
  const placed = TIERS.flatMap(tier => (parsed.data.tiers[tier] ?? []).map(flavourId => ({ tier, flavourId })))
  const order = placed.map(p => p.flavourId)
  if (new Set(order).size !== order.length) {
    return c.json({ error: 'invalid_input', message: 'a flavour is in the tier list twice' }, 422)
  }
  if (order.length > 0) {
    const found = await c.env.DB.db.select({ id: flavours.id }).from(flavours).where(inArray(flavours.id, order))
    if (found.length !== order.length) {
      const known = new Set(found.map(f => f.id))
      return c.json(
        { error: 'invalid_input', message: 'unknown flavour ids', details: { missing: order.filter(id => !known.has(id)) } },
        422
      )
    }
  }

  await c.env.DB.db.transaction(async tx => {
    await tx.delete(rankings).where(eq(rankings.userId, userId))
    if (order.length > 0) {
      await tx.insert(rankings).values(placed.map(({ tier, flavourId }, i) => ({ userId, flavourId, tier, rank: i + 1 })))
    }
  })
  return c.json({ rankings: await listRankings(c, userId) })
})

rankingsApi.get('/users/:userId/rankings', async c => {
  const userId = parseId(c.req.param('userId'))
  const user = userId ? await findUser(c, userId) : null
  if (!userId || !user) return c.json({ error: 'not_found', message: 'no such user' }, 404)
  return c.json({ user: { id: user.id, name: user.name }, rankings: await listRankings(c, userId) })
})

/**
 * Compare two raters: each flavour with both tiers, both ranks and the gap, Spearman's
 * rank correlation over the flavours both placed, how many share a tier, and the biggest
 * disagreements.
 */
rankingsApi.get('/compare', async c => {
  const a = parseId(c.req.query('a'))
  const b = parseId(c.req.query('b'))
  if (!a || !b) {
    return c.json({ error: 'invalid_input', message: 'query params a and b (user ids) are required' }, 422)
  }
  if (a === b) {
    return c.json({ error: 'invalid_input', message: 'a and b must be different users' }, 422)
  }
  const [userA, userB] = await Promise.all([findUser(c, a), findUser(c, b)])
  if (!userA || !userB) return c.json({ error: 'not_found', message: 'no such user' }, 404)

  const [rankA, rankB, allFlavours] = await Promise.all([
    listRankings(c, a),
    listRankings(c, b),
    c.env.DB.db.select().from(flavours).orderBy(asc(flavours.day), asc(flavours.id))
  ])
  const byA = new Map(rankA.map(r => [r.flavourId, r]))
  const byB = new Map(rankB.map(r => [r.flavourId, r]))

  const entries = allFlavours.map(f => {
    const ea = byA.get(f.id)
    const eb = byB.get(f.id)
    const diff = ea && eb ? Math.abs(ea.rank - eb.rank) : null
    return {
      flavour: flavourJson(f),
      tierA: ea?.tier ?? null,
      tierB: eb?.tier ?? null,
      rankA: ea?.rank ?? null,
      rankB: eb?.rank ?? null,
      diff
    }
  })

  const both = entries.filter(e => e.diff !== null)
  const n = both.length
  let spearman: number | null = null
  if (n >= 2) {
    const sumD2 = both.reduce((sum, e) => sum + (e.rankA! - e.rankB!) ** 2, 0)
    spearman = Math.round((1 - (6 * sumD2) / (n * (n * n - 1))) * 10000) / 10000
  }

  const sameTier = both.filter(e => e.tierA === e.tierB).length
  const biggestDisagreements = [...both].filter(e => e.diff! > 0).sort((x, y) => y.diff! - x.diff!).slice(0, 5)

  return c.json({
    a: { id: userA.id, name: userA.name },
    b: { id: userB.id, name: userB.name },
    spearman,
    bothPlaced: n,
    sameTier,
    entries,
    biggestDisagreements
  })
})
