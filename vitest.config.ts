import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'content', root: 'packages/content', include: ['test/**/*.test.ts'] } },
      { test: { name: 'sim', root: 'packages/sim', include: ['test/**/*.test.ts'], testTimeout: 120000 } },
      { test: { name: 'trackc', root: 'packages/trackc', include: ['test/**/*.test.ts'], testTimeout: 180000 } },
      { test: { name: 'net', root: 'packages/net', include: ['test/**/*.test.ts'], testTimeout: 120000 } },
      { test: { name: 'room', root: 'packages/room', include: ['test/**/*.test.ts'], testTimeout: 120000 } },
      { test: { name: 'server', root: 'apps/server', include: ['test/**/*.test.ts'], testTimeout: 60000 } },
      { test: { name: 'client', root: 'apps/client', include: ['test/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'tools', root: 'tools', include: ['test/**/*.test.ts'] } },
    ],
  },
});
