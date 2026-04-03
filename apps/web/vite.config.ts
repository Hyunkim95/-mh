import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import svgr from 'vite-plugin-svgr'
import { nodePolyfills } from "vite-plugin-node-polyfills";
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devApiProxyTarget =
    env.VITE_DEV_API_PROXY_TARGET || "http://localhost:3001";

  return {
    plugins: [
      react(),
      svgr(),
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
      port: 5173,
      proxy: {
        "/trpc": {
          target: devApiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    define: {
      global: "globalThis",
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
