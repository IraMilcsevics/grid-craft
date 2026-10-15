import { defineConfig } from 'vitest/config'

// Browser tests against the production build. Run `npm run build` first, then `npm run test:e2e`.
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
