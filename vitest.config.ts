import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', '.'],
    include: ['*.test.ts', 'scripts/**/*.test.ts', 'schemas/**/*.test.ts'],
  },
});
