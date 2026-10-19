#!/usr/bin/env node
/**
 * Merge missing multilingual category/status names from data-init into data.
 * Only adds missing nameEn/nameJa/nameKo fields; never overwrites existing values.
 * Usage: node scripts/migrate-category-i18n.js [--dry-run]
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dataPath = path.join(root, 'data', 'categories.json');
const initPath = path.join(root, 'data-init', 'categories.json');
const dryRun = process.argv.includes('--dry-run');
const fields = ['nameEn', 'nameJa', 'nameKo'];

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const init = JSON.parse(fs.readFileSync(initPath, 'utf8'));
let added = 0;

for (const key of Object.keys(init)) {
  if (!Array.isArray(data[key]) || !Array.isArray(init[key])) continue;
  const byId = new Map(init[key].map(item => [item.id, item]));
  for (const item of data[key]) {
    const source = byId.get(item.id);
    if (!source) continue;
    for (const field of fields) {
      if (!item[field] && source[field]) {
        item[field] = source[field];
        added++;
      }
    }
  }
}

if (!added) {
  console.log('No missing translations. Nothing to do.');
  process.exit(0);
}
if (dryRun) {
  console.log(`Dry run: would add ${added} translation fields.`);
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(root, 'backups');
fs.mkdirSync(backup, { recursive: true });
fs.copyFileSync(dataPath, path.join(backup, `categories-${stamp}.json`));
const tmp = dataPath + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
fs.renameSync(tmp, dataPath);
console.log(`Added ${added} translation fields. Backup: backups/categories-${stamp}.json`);
