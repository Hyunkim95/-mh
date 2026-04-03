import { readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const SRC_DIR = "/app/libs/server/src";
const DIST_DIR = "/app/libs/server/dist";

const SRC_EXTENSIONS = new Set([".ts", ".tsx", ".json"]);
const DIST_EXTENSIONS = new Set([".js", ".mjs", ".d.ts", ".d.mts", ".map"]);

function walk(dir, extensions, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, extensions, files);
      continue;
    }

    const ext = extname(entry.name);
    if (extensions.has(ext) || [...extensions].some((allowed) => entry.name.endsWith(allowed))) {
      files.push(fullPath);
    }
  }

  return files;
}

function newestMtime(paths) {
  let newest = 0;
  let newestPath = "";

  for (const filePath of paths) {
    const mtime = statSync(filePath).mtimeMs;
    if (mtime > newest) {
      newest = mtime;
      newestPath = filePath;
    }
  }

  return { newest, newestPath };
}

if (!existsSync(DIST_DIR)) {
  console.error("stale-build: dist directory is missing");
  process.exit(1);
}

const sourceFiles = walk(SRC_DIR, SRC_EXTENSIONS);
const distFiles = walk(DIST_DIR, DIST_EXTENSIONS);

if (distFiles.length === 0) {
  console.error("stale-build: dist directory has no built files");
  process.exit(1);
}

const srcNewest = newestMtime(sourceFiles);
const distNewest = newestMtime(distFiles);

if (srcNewest.newest > distNewest.newest) {
  console.error(
    `stale-build: source is newer than dist (${srcNewest.newestPath} > ${distNewest.newestPath})`,
  );
  process.exit(1);
}

console.log("fresh-build");
