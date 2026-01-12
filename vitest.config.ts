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
  },
});
