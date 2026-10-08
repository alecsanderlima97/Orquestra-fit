/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'reports', '.female-drive-source.json');
const catalogPath = path.join(root, 'public', 'gif-catalog-feminine.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const existing = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const slugify = (value) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const byFile = new Map(existing.map((entry) => [entry.file, entry]));
const usedIds = new Set(existing.map((entry) => entry.id));
let added = 0;

for (const item of source) {
  if (byFile.has(item.file)) continue;

  const relativeFile = item.file.startsWith('FEMININO/') ? item.file.slice('FEMININO/'.length) : item.file;
  const baseId = `feminino-${slugify(relativeFile)}`;
  let id = baseId;
  if (usedIds.has(id)) id = `${baseId}-${item.driveId.slice(0, 8)}`;
  usedIds.add(id);
  byFile.set(item.file, {
    id,
    name: item.name,
    file: item.file,
    url: `https://drive.usercontent.google.com/download?id=${item.driveId}&export=download&confirm=t`,
    equipment: item.equipment,
    muscle: item.muscle,
  });
  added += 1;
}

const merged = [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file, 'pt-BR'));
fs.writeFileSync(catalogPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
fs.unlinkSync(sourcePath);
for (const file of fs.readdirSync(path.join(root, 'reports'))) {
  if (/^\.female-drive-source-\\d+\\.part$/.test(file)) fs.unlinkSync(path.join(root, 'reports', file));
}

console.log(JSON.stringify({ existing: existing.length, source: source.length, added, total: merged.length }, null, 2));
