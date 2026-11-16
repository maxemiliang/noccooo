# noccooo

A [Hono](https://hono.dev) app on [maxcloud](https://github.com/maxemiliang/maxcloud)
(the homelab's run platform), with PostgreSQL through [drizzle](https://orm.drizzle.team).
Set up with `mcloud init`; the app definition is [maxcloud.yaml](maxcloud.yaml).

It ranks the 2026 advent calendar's 24 flavours ("doors") as a tier list: two raters each
add flavours with a picture and sort them into S, A, B, C, D and F, then compare their
lists. The UI is the mobile-first single page at `/`; the JSON API is under `/api`.

## Auth: Cloudflare Access

The whole app sits behind a [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
application on `noccooo.makiya.dev` (the domain is already proxied). Access does the
sign-in (one-time PIN to your email, Google, …) and adds a signed JWT to every request it
lets through (`Cf-Access-Jwt-Assertion`). The app verifies that JWT against the team's
public keys, issuer and the application's AUD tag ([src/auth.ts](src/auth.ts)), so going
around Cloudflare to the origin, or forging the email header, gets a 401.

- The raters are `RATERS`, e.g. `Maxi <maxi@…>, Janina <janina@…>`: those emails rank,
  starting out with those names (renamable in the "You" dialog). Anyone else Access lets
  in can look but not change anything (403 on writes). Without `RATERS`, the first two
  emails through become the raters, named after their email. Who gets in at all is the
  Access policy. This repo is public, so set it with `mcloud env set`, not in git.
- A rater can only change their own tier list; flavours and pictures are shared.
- `/health` skips auth: the cluster's probe never passes Cloudflare.
- Without `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` the app answers 503 to everything,
  so a missing variable never leaves it open.

Setting it up:

1. Cloudflare Zero Trust → Access → Applications → Add → Self-hosted. Domain
   `noccooo.makiya.dev`, path empty (the whole site).
2. Policy: Allow, Include → Emails → the two of you. Pick a login method (one-time PIN
   works without any identity provider).
3. Copy the application's **AUD tag** (Overview / Basic information) and your team
   domain (Settings → Custom pages, `https://<team>.cloudflareaccess.com`).
4. Put those two in `env:` in [maxcloud.yaml](maxcloud.yaml) and deploy.
5. `mcloud env set RATERS='Maxi <…>, Janina <…>'`.

This is done: the Access application is "noccooo" (policy "noccooo: raters by email",
one-time PIN login, 30-day sessions), and maxcloud.yaml carries its values.

Locally there's no Cloudflare: `make dev` uses dev auth with Maxi (`maxi@example.com`)
and Janina (`janina@example.com`) as the raters, and the "You" dialog switches between
users (a cookie). Dev auth is only ever on when `AUTH_DEV=1`, which only
`scripts/dev.ts` sets.

## API

All of it needs Access (above); writes need a rater.

```
GET    /api/me                         # { email, user (null for a viewer), maxRaters, dev }
PATCH  /api/me                         # { name } rename yourself
GET    /api/users                      # the raters
GET    /api/users/:id
GET    /api/flavours                   # doors 1..24 with hasImage/imageUrl
POST   /api/flavours                   # { day: 1..24, name }
PATCH  /api/flavours/:id               # { day?, name? }
DELETE /api/flavours/:id
POST   /api/flavours/:id/image         # raw image bytes, content-type image/* (≤5 MiB; the page sends ~900px JPEGs)
GET    /api/flavours/:id/image         # the picture
PUT    /api/users/:id/rankings         # { tiers: { S: [flavourId…], A: […], … } } your own; left to right within a tier
GET    /api/users/:id/rankings         # [{ flavourId, tier, rank }] in reading order
GET    /api/compare?a=&b=              # per-flavour tierA/tierB/rankA/rankB/diff, Spearman rho, sameTier, biggest disagreements
```

## Layout

```
├── maxcloud.yaml          # the app on maxcloud: db, (later) buckets/domains; mcloud deploy reads it
├── src/
│   ├── index.ts           # the functions: `web`, the Hono app (onRequest from @max-cloud/functions)
│   ├── app.ts             # the Hono app: routes, migration gate, error handlers
│   ├── page.ts            # the tier-list UI served at / (vanilla HTML/CSS/JS, mobile-first)
│   ├── auth.ts            # Cloudflare Access JWT verification, dev auth, raters
│   ├── routes/
│   │   ├── api.ts         # /api: me, users (raters), write gate; mounts the routers below
│   │   ├── flavours.ts    # flavour CRUD + picture upload/serve
│   │   ├── rankings.ts    # PUT/GET tier lists, GET /api/compare
│   │   └── shared.ts      # pgCode/parseId/serializers
│   └── db/                # schema.ts (drizzle pg-core) and index.ts (pool + drizzle client + migrations)
├── migrations/            # drizzle-kit's folder (meta/_journal.json): `pnpm db:generate` adds to it;
│                          # the app applies it on start, maxcloud's runner leaves it alone
├── scripts/dev.ts         # local dev server (@hono/node-server)
├── deploy/k8s/            # what Flux applies; functions.yaml is generated on every deploy
└── Dockerfile             # the image maxcloud builds and runs (`maxcloud-functions`)
```

## Develop

```sh
mise install        # node 24, pnpm 12, mcloud
pnpm install
make dev            # Postgres in Docker on :55432, app on http://127.0.0.1:8787
make test           # tests against a throwaway Postgres on :55433
make typecheck
```

`make dev` applies pending migrations, then serves. Generate a migration after changing
`src/db/schema.ts` with `pnpm db:generate` (needs `DATABASE_URL`, see `.env.example`).

## Deploy

Push to `main` of the GitHub repo and [.github/workflows/deploy.yaml](.github/workflows/deploy.yaml)
builds the image, writes the function manifests to `deploy/k8s`, and Flux applies them.
`mcloud deploy` registers the app from `maxcloud.yaml` the first time. On maxcloud the
database is the `db:` entry: every function gets `DATABASE_URL` from the `db-app` Secret.
