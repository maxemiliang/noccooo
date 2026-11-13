# noccooo

A base [Hono](https://hono.dev) app on [maxcloud](https://github.com/maxemiliang/maxcloud)
(the homelab's run platform), with PostgreSQL through [drizzle](https://orm.drizzle.team).
Set up with `mcloud init`; the app definition is [maxcloud.yaml](maxcloud.yaml).

## Layout

```
├── maxcloud.yaml          # the app on maxcloud: db, (later) buckets/domains; mcloud deploy reads it
├── src/
│   ├── index.ts           # the functions: `web`, the Hono app (onRequest from @max-cloud/functions)
│   ├── app.ts             # the Hono app: routes, migration gate, error handlers
│   ├── routes/api.ts      # /api (users CRUD as the base example)
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
