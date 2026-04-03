import { defineConfig } from "tsup";

export default defineConfig((options) => ({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  // In watch mode the API imports this package from dist, so deleting dist on
  // every rebuild briefly makes @trpc-template/server disappear.
  clean: !options.watch,
  external: ["@trpc/server", "zod"],
}));
