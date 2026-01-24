# Test Structure

This directory contains shared test utilities and fixtures.

## Directory Structure

```
tests/
├── fixtures/         # Sample API responses and test data
│   └── oura-sleep-response.json
└── helpers/          # Shared test utilities
    └── (future: mockOuraClient.ts, testHelpers.ts)
```

## Test Files Location

Test files are co-located with source files:
- `src/utils/formatters.test.ts` - Unit tests for formatter utilities
- `src/client.test.ts` - Integration tests for Oura API client
- `src/tools/index.test.ts` - Unit tests for MCP tool handlers
- `src/index.test.ts` - Integration tests for MCP server

## Fixtures

Fixtures contain real API response samples from Oura's API. Use these for:
- Mocking API responses in integration tests
- Validating Zod schemas
- Testing edge cases (null values, missing fields, etc.)

## Running Tests

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode for development
pnpm test:coverage     # Run tests with coverage report
pnpm test:ui           # Open Vitest UI in browser
```

## Coverage Thresholds

The project maintains these minimum coverage requirements:
- **Branches:** 75%
- **Functions:** 80%
- **Lines:** 80%
- **Statements:** 80%

Generated types (`src/types/oura-api.ts`) are excluded from coverage.
