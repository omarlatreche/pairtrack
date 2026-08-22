import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    setupFiles: ['tests/unit/setup.ts'],
    testTimeout: 20_000,
    // SheetJS is a ~1MB CJS bundle. Letting Vite transform it for the jsdom
    // environment is pathologically slow; loading it externally through Node's
    // own CJS resolution is the same code, in a fraction of the time.
    server: {
      deps: {
        external: ['xlsx'],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/crypto/**', 'src/data/**', 'src/import/**', 'src/export/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
