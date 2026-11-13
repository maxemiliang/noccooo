import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

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
