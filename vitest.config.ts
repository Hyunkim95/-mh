import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["libs/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Use jsdom for client-side React tests, node for server tests
    environmentMatchGlobs: [
      ["**/libs/client/**/*.test.tsx", "jsdom"],
      ["**/libs/client/**/*.spec.tsx", "jsdom"],
      ["**/libs/server/**/*.test.ts", "node"],
    ],
    setupFiles: ["./test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov", "json-summary"],
      include: ["libs/*/src/**/*.{ts,tsx}"],
      thresholds: {
        lines: 70,
      },
      exclude: [
        "**/__tests__/**",
        "**/node_modules/**",
        "**/dist/**",
        "**/*.d.ts",
        "**/index.ts",
        "**/idl/**",
        "**/seed.ts",
        "**/migrate.ts",
        "**/backfill-*.ts",
        "**/instrument.ts",
        "**/server.ts",
        "**/example-api-etl.ts",
        "**/types.ts",
        "**/types/*.ts",
      ],
    },
  },
});
