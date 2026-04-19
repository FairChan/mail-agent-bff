import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { gzipSync, brotliCompressSync } from "zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const distDir = join(rootDir, "dist");
const indexPath = join(distDir, "index.html");
const VERSION = Date.now().toString(36);

const html = readFileSync(indexPath, "utf-8");
// Strip any existing ?v= params, then add fresh one
const cleaned = html.replace(/(\/assets\/[^?"]+)\?v=[^"]+/g, "$1");
const versioned = cleaned.replace(
  /(\/assets\/[^?"]+)(?=")/g,
  '$1?v=' + VERSION
);

writeFileSync(indexPath, versioned, "utf-8");

// Rewrite compressed versions
const htmlBuf = Buffer.from(versioned, "utf-8");
writeFileSync(indexPath + ".gz", gzipSync(htmlBuf));
writeFileSync(indexPath + ".br", brotliCompressSync(htmlBuf));

// Clean and version inline refs in built JS/CSS
const assetsDir = join(distDir, "assets");
for (const file of readdirSync(assetsDir)) {
  if (!file.endsWith(".js") && !file.endsWith(".css")) continue;
  const srcPath = join(assetsDir, file);
  const content = readFileSync(srcPath, "utf-8");
  const cleaned2 = content.replace(/(\/assets\/[^?"]+)\?v=[^"]+/g, "$1");
  const updated = cleaned2.replace(/(\/assets\/[^?"]+)(?=")/g, '$1?v=' + VERSION);
  if (updated !== content) {
    writeFileSync(srcPath, updated, "utf-8");
  }
}

console.log(`Cache bust applied: v=${VERSION}`);
