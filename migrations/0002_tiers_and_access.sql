-- Tier lists: every placed flavour gets a tier. Rows from before tiers land in C.
ALTER TABLE "rankings" ADD COLUMN "tier" text DEFAULT 'C' NOT NULL;--> statement-breakpoint
ALTER TABLE "rankings" ALTER COLUMN "tier" DROP DEFAULT;--> statement-breakpoint
-- Raters are identified by their Cloudflare Access email now, not a token.
ALTER TABLE "users" DROP COLUMN "token_hash";--> statement-breakpoint
ALTER TABLE "rankings" ADD CONSTRAINT "rankings_tier_valid" CHECK ("rankings"."tier" in ('S', 'A', 'B', 'C', 'D', 'F'));
