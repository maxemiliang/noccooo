import { defineConfig } from 'vitest/config'

// Tests run in Node against a real Postgres (TEST_DATABASE_URL, see `make test-db`).
export default defineConfig({
  test: {
    testTimeout: 30_000
  }
})
