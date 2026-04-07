import { defineConfig } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  tsconfig: "./tsconfig.json",
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 300_000, // 5 min — obfuscation routes are slow
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // serial — tests share on-chain state
  retries: 0,
  reporter: [["list"]],

  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",

  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],

  webServer: {
    command:
      "yarn build:shared && yarn build:client && yarn workspace @trpc-template/web dev -- --port 4173",
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      VITE_TEST_WALLET: "true",
      VITE_RPC_URL: "http://localhost:8899",
      VITE_DEV_API_PROXY_TARGET: "http://localhost:3001",
      PORT: "4173",
    },
    port: 4173,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
