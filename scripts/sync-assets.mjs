#!/usr/bin/env node
/**
 * sync-assets — copies the exported art from the Aura_Assets pipeline into this repo.
 *
 *   npm run assets:sync                      # source: $AURA_ASSETS_DIR, else ../Aura_Assets
 *   npm run assets:sync -- D:\path\to\Aura_Assets
 *
 * Pipeline: Aseprite sources → Aura_Assets/tools/build.ps1 → Aura_Assets/export + Aura_Assets/tiled
 *           → this script → public/assets (served) + src/modules/builder/catalog/furniture.manifest.json (bundled)
 *
 * What is copied (destination folders are emptied first so retired files disappear):
 *   export/furniture/<id>.png               → public/assets/furniture/sheets/<id>.png      (view-se | view-nw [, front row])
 *   export/furniture/thumbnails/<id>.png    → public/assets/furniture/thumbnails/<id>.png  (64×64 catalog thumbnails)
 *   export/furniture/furniture.manifest.json → src/modules/builder/catalog/furniture.manifest.json
 *   export/characters/<id>.png|.json        → public/assets/characters/                     (Aseprite sheet + JSON)
 *   tiled/<map>.tmj                         → public/assets/maps/<map>.tmj
 *   tileset images referenced by each map   → public/assets/maps/<same relative path>       (image-collection tilesets skipped)
 *
 * Nothing here edits art. Re-run after every Aura_Assets build, then commit the result.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] ?? process.env.AURA_ASSETS_DIR ?? join(root, '..', 'Aura_Assets'));
const publicAssets = join(root, 'public', 'assets');
const manifestTarget = join(root, 'src', 'modules', 'builder', 'catalog', 'furniture.manifest.json');

const copied = [];

function fail(message) {
  console.error(`[assets:sync] ${message}`);
  process.exit(1);
}

function resetDir(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function copy(from, to) {
  if (!existsSync(from)) fail(`missing source file: ${from}`);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied.push(relative(root, to));
}

function listFiles(dir, predicate) {
  if (!existsSync(dir)) fail(`missing source folder: ${dir}`);
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => entry.name);
}

if (!existsSync(source)) {
  fail(`Aura_Assets not found at ${source}. Pass the path as an argument or set AURA_ASSETS_DIR.`);
}

// ─── Furniture ───

const furnitureExport = join(source, 'export', 'furniture');
const manifest = JSON.parse(readFileSync(join(furnitureExport, 'furniture.manifest.json'), 'utf8'));
const furnitureIds = manifest.items.map((item) => item.id);

resetDir(join(publicAssets, 'furniture'));
for (const id of furnitureIds) {
  copy(join(furnitureExport, `${id}.png`), join(publicAssets, 'furniture', 'sheets', `${id}.png`));
  copy(join(furnitureExport, 'thumbnails', `${id}.png`), join(publicAssets, 'furniture', 'thumbnails', `${id}.png`));
}
copy(join(furnitureExport, 'furniture.manifest.json'), manifestTarget);

// ─── Characters ───

const characterExport = join(source, 'export', 'characters');
resetDir(join(publicAssets, 'characters'));
for (const name of listFiles(characterExport, (n) => /\.(png|json)$/.test(n) && !n.endsWith('.preview.png'))) {
  copy(join(characterExport, name), join(publicAssets, 'characters', name));
}

// ─── Tiled maps + the tileset images they reference ───

const tiledDir = join(source, 'tiled');
resetDir(join(publicAssets, 'maps'));
for (const mapFile of listFiles(tiledDir, (n) => n.endsWith('.tmj'))) {
  const mapPath = join(tiledDir, mapFile);
  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  copy(mapPath, join(publicAssets, 'maps', mapFile));

  for (const tileset of map.tilesets ?? []) {
    if (tileset.source) {
      fail(`${mapFile}: tileset "${tileset.source}" is external. Export the .tmj with embedded tilesets.`);
    }
    if (!tileset.image) continue; // image-collection tileset (e.g. furniture) — furniture comes from the catalog
    const from = resolve(tiledDir, tileset.image);
    const to = resolve(publicAssets, 'maps', tileset.image);
    if (!to.startsWith(join(publicAssets, 'maps'))) {
      fail(`${mapFile}: tileset image "${tileset.image}" points outside the map folder.`);
    }
    copy(from, to);
  }
}

console.log(`[assets:sync] ${basename(source)} → ${copied.length} files`);
for (const file of copied) console.log(`  ${file}`);
