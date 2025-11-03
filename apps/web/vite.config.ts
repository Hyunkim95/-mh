import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      include: [
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
  },
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      // This is required for some packages to work in the browser
      stream: "stream-browserify",
      crypto: "crypto-browserify",
      buffer: "buffer",
    },
  },
  optimizeDeps: {
    include: ["@solana/web3.js"],
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
      external: [/^vite-plugin-node-polyfills\//, "@trpc-template/server"],
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
});
