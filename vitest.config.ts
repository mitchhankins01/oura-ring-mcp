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
        branches: 75,
        functions: 80,
        lines: 80,
        statements: 80
      }
    }
  }
});
