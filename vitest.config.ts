import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'src/types/**',        // Generated types from OpenAPI
        'src/auth/**',         // CLI auth code (interactive, hard to test)
        'dist/**',
        'node_modules/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        'scripts/**',
        'vitest.config.ts',
        'tests/fixtures/**',   // Test fixtures (JSON)
        'tests/helpers/**',    // Test helpers
        'src/utils/index.ts',  // Re-export file
      ],
      thresholds: {
        // Global thresholds
        branches: 70,
        functions: 80,
        lines: 80,
        statements: 80,
        // Per-file thresholds for utilities (higher standards)
        'src/utils/formatters.ts': {
          branches: 100,
          functions: 100,
          lines: 95,
          statements: 95
        },
        'src/utils/errors.ts': {
          branches: 95,
          functions: 100,
          lines: 95,
          statements: 95
        },
        'src/utils/analysis.ts': {
          branches: 80,
          functions: 95,
          lines: 90,
          statements: 90
        },
        'src/client.ts': {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100
        }
      }
    }
  }
});
