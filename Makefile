.PHONY: install dev dev-db test-db build test typecheck clean deploy

install:
	mise install
	pnpm install

# Local Postgres containers: dev keeps its data in a volume, test is thrown away.
DEV_DB := postgres://postgres:dev@127.0.0.1:55434/postgres
TEST_DATABASE_URL ?= postgres://postgres:test@127.0.0.1:55435/postgres

dev-db:
	@docker start noccooo-pg-dev >/dev/null 2>&1 || docker run -d --name noccooo-pg-dev -p 127.0.0.1:55434:5432 \
		-e POSTGRES_PASSWORD=dev -v noccooo-pg-dev:/var/lib/postgresql postgres:18 >/dev/null
	@until docker exec noccooo-pg-dev pg_isready -q; do sleep 0.3; done

test-db:
	@docker start noccooo-pg-test >/dev/null 2>&1 || docker run -d --rm --name noccooo-pg-test -p 127.0.0.1:55435:5432 \
		-e POSTGRES_PASSWORD=test postgres:18 >/dev/null
	@until docker exec noccooo-pg-test pg_isready -q; do sleep 0.3; done

# The app on http://127.0.0.1:8787 with the dev database; applies pending migrations first.
dev: dev-db
	pnpm exec env DATABASE_URL=$(DEV_DB) pnpm dev

build:
	pnpm build

test: test-db
	pnpm exec env TEST_DATABASE_URL=$(TEST_DATABASE_URL) pnpm test

typecheck:
	pnpm typecheck

clean:
	rm -rf dist .dev

# Production: deploys to maxcloud (maxcloud.yaml): for a gitops app, a push to main runs
# .github/workflows/deploy.yaml, which builds this Dockerfile, writes the functions'
# manifests to deploy/k8s and lets Flux apply them. `mcloud deploy` registers the app the
# first time and can also deploy directly. Ask before running.
deploy:
	mcloud deploy
