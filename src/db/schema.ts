import { sql } from 'drizzle-orm'
import { check, customType, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

/** bytea as a Buffer (this drizzle version has no bytea column helper; pg returns Buffers). */
const byteaBuffer = customType<{ data: Buffer | null; driverData: Buffer | null }>({
  dataType: () => 'bytea',
  toDriver: value => value,
  fromDriver: value => value as Buffer | null
})

const timestamptz = (name: string) => timestamp(name, { withTimezone: true })

// Identity by default (not always), so a one-off import can keep old ids
const id = () => integer('id').primaryKey().generatedByDefaultAsIdentity()

const timestamps = {
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow().$onUpdate(() => new Date())
}

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  ...timestamps
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

/** One flavour (door) of the 2026 advent calendar. The picture is optional, stored inline. */
export const flavours = pgTable('flavours', {
  id: id(),
  day: integer('day').notNull().unique(), // the calendar door, 1..24
  name: text('name').notNull(),
  image: byteaBuffer('image'),
  imageContentType: text('image_content_type'),
  ...timestamps
}, t => ({
  dayRange: check('flavours_day_range', sql`${t.day} between 1 and 24`)
}))

export type Flavour = typeof flavours.$inferSelect
export type NewFlavour = typeof flavours.$inferInsert

/** The tiers of a tier list, best first. */
export const TIERS = ['S', 'A', 'B', 'C', 'D', 'F'] as const
export type Tier = (typeof TIERS)[number]

/**
 * A rater's tier list: each placed flavour's tier, and its overall position (rank 1 is the
 * leftmost flavour in S, counting on through the tiers), unique per rater. Unplaced
 * flavours have no row.
 */
export const rankings = pgTable('rankings', {
  id: id(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  flavourId: integer('flavour_id').notNull().references(() => flavours.id, { onDelete: 'cascade' }),
  rank: integer('rank').notNull(),
  tier: text('tier').$type<Tier>().notNull(),
  ...timestamps
}, t => ({
  tierValid: check('rankings_tier_valid', sql`${t.tier} in ('S', 'A', 'B', 'C', 'D', 'F')`),
  userFlavour: uniqueIndex('rankings_user_flavour_unique').on(t.userId, t.flavourId),
  userRank: uniqueIndex('rankings_user_rank_unique').on(t.userId, t.rank),
  rankPositive: check('rankings_rank_positive', sql`${t.rank} >= 1`)
}))

export type Ranking = typeof rankings.$inferSelect
export type NewRanking = typeof rankings.$inferInsert
