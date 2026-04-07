import { execSync } from "node:child_process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import svgr from 'vite-plugin-svgr'
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Build-time version identifier used by the deployment-detection feature.
// Prefer Netlify's injected env vars; fall back to git SHA, then to a timestamp.
const buildVersion =
  process.env.COMMIT_REF ||
  process.env.BUILD_ID ||
  (() => {
    try {
      return execSync("git rev-parse HEAD").toString().trim();
    } catch {
      return String(Date.now());
    }
  })();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devApiProxyTarget =
    env.VITE_DEV_API_PROXY_TARGET || "http://localhost:3001";
  const devServerPort = Number(env.PORT || 5173);

  return {
    plugins: [
      react(),
      svgr(),
      {
        name: "emit-version-json",
        apply: "build",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "version.json",
            source: JSON.stringify({ version: buildVersion }),
          });
        },
      },
      nodePolyfills({
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
        include: [
          "buffer",
          "zlib",
          "util",
          "crypto",
          "stream",
          "assert",
          "os",
          "path",
          "fs",
          "http",
          "https",
          "url",
        ],
      }),
    ],
    server: {
      host: "0.0.0.0",
      port: devServerPort,
      proxy: {
        "/trpc": {
          target: devApiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    define: {
      global: "globalThis",
      __APP_VERSION__: JSON.stringify(buildVersion),
    },
    resolve: {
      alias: {
        // This is required for some packages to work in the browser
        stream: "stream-browserify",
        crypto: "crypto-browserify",
      },
    },
    optimizeDeps: {
      include: ["@solana/web3.js", "buffer"],
      exclude: ["@trpc-template/server"],
      esbuildOptions: {
        target: "esnext",
        define: {
          global: "globalThis",
        },
      },
    },
    ssr: {
      external: ["@trpc-template/server"],
      noExternal: [],
    },
    build: {
      target: "esnext",
      rollupOptions: {
        external: ["@trpc-template/server"],
        output: {
          manualChunks: {
            solana: ["@solana/web3.js", "@coral-xyz/anchor", "@coral-xyz/borsh"],
          },
        },
      },
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});
