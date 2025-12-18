// tsup.config.ts
import { defineConfig } from "tsup";
import path from "path";
import { promises as fs } from "fs";
import svgr from "esbuild-plugin-svgr";
var svgDualExport = () => ({
  name: "svg-dual-export",
  setup(build) {
    build.onResolve({ filter: /\.svg$/ }, (args) => {
      if (args.path.includes("?")) return;
      const abs = path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path);
      return { path: abs, namespace: "svg-dual" };
    });
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
    build.onResolve({ filter: /\.svg\?url$/ }, (args) => {
      const raw = args.path.replace(/\?url$/, "");
      const abs = path.isAbsolute(raw) ? raw : path.join(args.resolveDir, raw);
      return { path: abs, namespace: "svg-url" };
    });
    build.onLoad({ filter: /\.svg$/, namespace: "svg-url" }, async (args) => {
      const data = await fs.readFile(args.path);
      return { contents: data, loader: "dataurl" };
    });
  }
});
var tsup_config_default = defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  loader: {
    ".png": "dataurl"
  },
  esbuildPlugins: [
    svgDualExport(),
    svgr()
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
    "@tanstack/react-query"
  ]
});
export {
  tsup_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidHN1cC5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9faW5qZWN0ZWRfZmlsZW5hbWVfXyA9IFwiL1VzZXJzL3NpZGRpZ3plaWRhbi9wcm9qZWN0cy9tdWx0aWhvcHBlci9saWJzL2NsaWVudC90c3VwLmNvbmZpZy50c1wiO2NvbnN0IF9faW5qZWN0ZWRfZGlybmFtZV9fID0gXCIvVXNlcnMvc2lkZGlnemVpZGFuL3Byb2plY3RzL211bHRpaG9wcGVyL2xpYnMvY2xpZW50XCI7Y29uc3QgX19pbmplY3RlZF9pbXBvcnRfbWV0YV91cmxfXyA9IFwiZmlsZTovLy9Vc2Vycy9zaWRkaWd6ZWlkYW4vcHJvamVjdHMvbXVsdGlob3BwZXIvbGlicy9jbGllbnQvdHN1cC5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidHN1cFwiO1xuaW1wb3J0IHR5cGUgeyBQbHVnaW4gfSBmcm9tIFwiZXNidWlsZFwiO1xuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IHByb21pc2VzIGFzIGZzIH0gZnJvbSBcImZzXCI7XG5pbXBvcnQgc3ZnciBmcm9tIFwiZXNidWlsZC1wbHVnaW4tc3ZnclwiO1xuXG4vLyBEdWFsIGV4cG9ydCBmb3IgYW55IC5zdmcgaW1wb3J0OlxuLy8gLSBkZWZhdWx0OiBVUkwgKGRhdGEgVVJMKVxuLy8gLSBuYW1lZDogUmVhY3RDb21wb25lbnQgKFJlYWN0IGNvbXBvbmVudClcbmNvbnN0IHN2Z0R1YWxFeHBvcnQgPSAoKTogUGx1Z2luID0+ICh7XG4gIG5hbWU6IFwic3ZnLWR1YWwtZXhwb3J0XCIsXG4gIHNldHVwKGJ1aWxkKSB7XG4gICAgLy8gSW50ZXJjZXB0IGJhcmUgLnN2ZyBpbXBvcnRzXG4gICAgYnVpbGQub25SZXNvbHZlKHsgZmlsdGVyOiAvXFwuc3ZnJC8gfSwgKGFyZ3MpID0+IHtcbiAgICAgIGlmIChhcmdzLnBhdGguaW5jbHVkZXMoXCI/XCIpKSByZXR1cm47XG4gICAgICBjb25zdCBhYnMgPSBwYXRoLmlzQWJzb2x1dGUoYXJncy5wYXRoKVxuICAgICAgICA/IGFyZ3MucGF0aFxuICAgICAgICA6IHBhdGguam9pbihhcmdzLnJlc29sdmVEaXIsIGFyZ3MucGF0aCk7XG4gICAgICByZXR1cm4geyBwYXRoOiBhYnMsIG5hbWVzcGFjZTogXCJzdmctZHVhbFwiIH07XG4gICAgfSk7XG5cbiAgICAvLyBHZW5lcmF0ZSBtb2R1bGUgdGhhdCBleHBvcnRzIGJvdGggZGVmYXVsdCBVUkwgYW5kIG5hbWVkIFJlYWN0Q29tcG9uZW50XG4gICAgYnVpbGQub25Mb2FkKHsgZmlsdGVyOiAvXFwuc3ZnJC8sIG5hbWVzcGFjZTogXCJzdmctZHVhbFwiIH0sIGFzeW5jIChhcmdzKSA9PiB7XG4gICAgICBjb25zdCBmaWxlUGF0aCA9IGFyZ3MucGF0aDtcbiAgICAgIGNvbnN0IGNvZGUgPSBgXG5pbXBvcnQgdXJsIGZyb20gJHtKU09OLnN0cmluZ2lmeShmaWxlUGF0aCArIFwiP3VybFwiKX07XG5pbXBvcnQgUmVhY3RDb21wb25lbnQgZnJvbSAke0pTT04uc3RyaW5naWZ5KGZpbGVQYXRoICsgXCI/Y29tcG9uZW50XCIpfTtcbmV4cG9ydCB7IFJlYWN0Q29tcG9uZW50IH07XG5leHBvcnQgZGVmYXVsdCB1cmw7XG5gO1xuICAgICAgcmV0dXJuIHsgY29udGVudHM6IGNvZGUsIGxvYWRlcjogXCJqc1wiLCByZXNvbHZlRGlyOiBwYXRoLmRpcm5hbWUoZmlsZVBhdGgpIH07XG4gICAgfSk7XG5cbiAgICAvLyBPcHRpb25hbCBzdXBwb3J0IGZvciBleHBsaWNpdCA/dXJsIHRvIGZvcmNlIFVSTC1vbmx5IGltcG9ydFxuICAgIGJ1aWxkLm9uUmVzb2x2ZSh7IGZpbHRlcjogL1xcLnN2Z1xcP3VybCQvIH0sIChhcmdzKSA9PiB7XG4gICAgICBjb25zdCByYXcgPSBhcmdzLnBhdGgucmVwbGFjZSgvXFw/dXJsJC8sIFwiXCIpO1xuICAgICAgY29uc3QgYWJzID0gcGF0aC5pc0Fic29sdXRlKHJhdykgPyByYXcgOiBwYXRoLmpvaW4oYXJncy5yZXNvbHZlRGlyLCByYXcpO1xuICAgICAgcmV0dXJuIHsgcGF0aDogYWJzLCBuYW1lc3BhY2U6IFwic3ZnLXVybFwiIH07XG4gICAgfSk7XG4gICAgYnVpbGQub25Mb2FkKHsgZmlsdGVyOiAvXFwuc3ZnJC8sIG5hbWVzcGFjZTogXCJzdmctdXJsXCIgfSwgYXN5bmMgKGFyZ3MpID0+IHtcbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBmcy5yZWFkRmlsZShhcmdzLnBhdGgpO1xuICAgICAgcmV0dXJuIHsgY29udGVudHM6IGRhdGEsIGxvYWRlcjogXCJkYXRhdXJsXCIgfTtcbiAgICB9KTtcbiAgfSxcbn0pO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBlbnRyeTogW1wic3JjL2luZGV4LnRzXCJdLFxuICBmb3JtYXQ6IFtcImNqc1wiLCBcImVzbVwiXSxcbiAgZHRzOiB0cnVlLFxuICBjbGVhbjogdHJ1ZSxcbiAgc291cmNlbWFwOiB0cnVlLFxuICBsb2FkZXI6IHtcbiAgICAnLnBuZyc6ICdkYXRhdXJsJyxcbiAgfSxcbiAgZXNidWlsZFBsdWdpbnM6IFtcbiAgICBzdmdEdWFsRXhwb3J0KCksXG4gICAgc3ZncigpLFxuICBdLFxuICBleHRlcm5hbDogW1xuICAgIFwicmVhY3RcIixcbiAgICBcInJlYWN0LWRvbVwiLFxuICAgIFwicmVhY3QvanN4LXJ1bnRpbWVcIixcbiAgICBcInJlYWN0L2pzeC1kZXYtcnVudGltZVwiLFxuICAgIFwiQHNvbGFuYS93ZWIzLmpzXCIsXG4gICAgXCJAc29sYW5hL3dhbGxldC1hZGFwdGVyLXJlYWN0XCIsXG4gICAgXCJAc29sYW5hL3dhbGxldC1hZGFwdGVyLXJlYWN0LXVpXCIsXG4gICAgXCJAc29sYW5hL3dhbGxldC1hZGFwdGVyLXdhbGxldHNcIixcbiAgICBcIkB0YW5zdGFjay9yZWFjdC1xdWVyeVwiLFxuICBdLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTBTLFNBQVMsb0JBQW9CO0FBRXZVLE9BQU8sVUFBVTtBQUNqQixTQUFTLFlBQVksVUFBVTtBQUMvQixPQUFPLFVBQVU7QUFLakIsSUFBTSxnQkFBZ0IsT0FBZTtBQUFBLEVBQ25DLE1BQU07QUFBQSxFQUNOLE1BQU0sT0FBTztBQUVYLFVBQU0sVUFBVSxFQUFFLFFBQVEsU0FBUyxHQUFHLENBQUMsU0FBUztBQUM5QyxVQUFJLEtBQUssS0FBSyxTQUFTLEdBQUcsRUFBRztBQUM3QixZQUFNLE1BQU0sS0FBSyxXQUFXLEtBQUssSUFBSSxJQUNqQyxLQUFLLE9BQ0wsS0FBSyxLQUFLLEtBQUssWUFBWSxLQUFLLElBQUk7QUFDeEMsYUFBTyxFQUFFLE1BQU0sS0FBSyxXQUFXLFdBQVc7QUFBQSxJQUM1QyxDQUFDO0FBR0QsVUFBTSxPQUFPLEVBQUUsUUFBUSxVQUFVLFdBQVcsV0FBVyxHQUFHLE9BQU8sU0FBUztBQUN4RSxZQUFNLFdBQVcsS0FBSztBQUN0QixZQUFNLE9BQU87QUFBQSxrQkFDRCxLQUFLLFVBQVUsV0FBVyxNQUFNLENBQUM7QUFBQSw2QkFDdEIsS0FBSyxVQUFVLFdBQVcsWUFBWSxDQUFDO0FBQUE7QUFBQTtBQUFBO0FBSTlELGFBQU8sRUFBRSxVQUFVLE1BQU0sUUFBUSxNQUFNLFlBQVksS0FBSyxRQUFRLFFBQVEsRUFBRTtBQUFBLElBQzVFLENBQUM7QUFHRCxVQUFNLFVBQVUsRUFBRSxRQUFRLGNBQWMsR0FBRyxDQUFDLFNBQVM7QUFDbkQsWUFBTSxNQUFNLEtBQUssS0FBSyxRQUFRLFVBQVUsRUFBRTtBQUMxQyxZQUFNLE1BQU0sS0FBSyxXQUFXLEdBQUcsSUFBSSxNQUFNLEtBQUssS0FBSyxLQUFLLFlBQVksR0FBRztBQUN2RSxhQUFPLEVBQUUsTUFBTSxLQUFLLFdBQVcsVUFBVTtBQUFBLElBQzNDLENBQUM7QUFDRCxVQUFNLE9BQU8sRUFBRSxRQUFRLFVBQVUsV0FBVyxVQUFVLEdBQUcsT0FBTyxTQUFTO0FBQ3ZFLFlBQU0sT0FBTyxNQUFNLEdBQUcsU0FBUyxLQUFLLElBQUk7QUFDeEMsYUFBTyxFQUFFLFVBQVUsTUFBTSxRQUFRLFVBQVU7QUFBQSxJQUM3QyxDQUFDO0FBQUEsRUFDSDtBQUNGO0FBRUEsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsT0FBTyxDQUFDLGNBQWM7QUFBQSxFQUN0QixRQUFRLENBQUMsT0FBTyxLQUFLO0FBQUEsRUFDckIsS0FBSztBQUFBLEVBQ0wsT0FBTztBQUFBLEVBQ1AsV0FBVztBQUFBLEVBQ1gsUUFBUTtBQUFBLElBQ04sUUFBUTtBQUFBLEVBQ1Y7QUFBQSxFQUNBLGdCQUFnQjtBQUFBLElBQ2QsY0FBYztBQUFBLElBQ2QsS0FBSztBQUFBLEVBQ1A7QUFBQSxFQUNBLFVBQVU7QUFBQSxJQUNSO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
