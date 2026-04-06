import { defineConfig } from "tsup";
import type { Plugin } from "esbuild";
import path from "path";
import { promises as fs } from "fs";
import svgr from "esbuild-plugin-svgr";

// Dual export for any .svg import:
// - default: URL (data URL)
// - named: ReactComponent (React component)
const svgDualExport = (): Plugin => ({
  name: "svg-dual-export",
  setup(build) {
    // Intercept bare .svg imports
    build.onResolve({ filter: /\.svg$/ }, (args) => {
      if (args.path.includes("?")) return;
      const abs = path.isAbsolute(args.path)
        ? args.path
        : path.join(args.resolveDir, args.path);
      return { path: abs, namespace: "svg-dual" };
    });

    // Generate module that exports both default URL and named ReactComponent
    build.onLoad({ filter: /\.svg$/, namespace: "svg-dual" }, async (args) => {
      const filePath = args.path;
      const code = `
import url from ${JSON.stringify(filePath + "?url")};
import ReactComponent from ${JSON.stringify(filePath + "?component")};
export { ReactComponent };
export default url;
`;
      return { contents: code, loader: "js", resolveDir: path.dirname(filePath) };
    });

    // Optional support for explicit ?url to force URL-only import
    build.onResolve({ filter: /\.svg\?url$/ }, (args) => {
      const raw = args.path.replace(/\?url$/, "");
      const abs = path.isAbsolute(raw) ? raw : path.join(args.resolveDir, raw);
      return { path: abs, namespace: "svg-url" };
    });
    build.onLoad({ filter: /\.svg$/, namespace: "svg-url" }, async (args) => {
      const data = await fs.readFile(args.path);
      return { contents: data, loader: "dataurl" };
    });
  },
});

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: !process.env.CI,
  clean: true,
  sourcemap: true,
  loader: {
    '.png': 'dataurl',
  },
  esbuildPlugins: [
    svgDualExport(),
    svgr(),
  ],
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "@solana/web3.js",
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-react-ui",
    "@solana/wallet-adapter-wallets",
    "@tanstack/react-query",
  ],
});
