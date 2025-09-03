import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'es2020',
  external: [
    '@trpc-template/auth-shared',
    '@trpc-template/ethereum-node',
    '@trpc-template/solana-node',
    '@trpc/server'
  ]
})