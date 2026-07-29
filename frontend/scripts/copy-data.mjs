// Copies /data/*.json into frontend/public/data so both `vite dev` and
// `vite build` can serve it as static files (fetched at runtime by the app).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "data");
const dest = join(here, "..", "public", "data");

if (!existsSync(src)) {
  console.warn(`No data directory found at ${src}, skipping copy.`);
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied ${src} -> ${dest}`);
