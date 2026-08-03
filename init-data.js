const fs = require('fs');
const path = require('path');

const files = [
  'events.json', 'works.json', 'circles.json', 'projects.json',
  'settings.json', 'categories.json', 'announcements.json',
  'likes.json', 'wants.json', 'updates.json'
];

const dataDir = path.join(__dirname, 'data');
const initDir = path.join(__dirname, 'data-init');

let created = 0;
for (const file of files) {
  const target = path.join(dataDir, file);
  if (!fs.existsSync(target)) {
    const source = path.join(initDir, file);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, target);
      created++;
      console.log(`  Created: data/${file}`);
    } else {
      fs.writeFileSync(target, file.endsWith('s.json') ? '[]' : '{}');
      created++;
      console.log(`  Created: data/${file} (empty)`);
    }
  }
}

if (created > 0) {
  console.log(`\nInitialized ${created} data file(s).`);
} else {
  console.log('All data files already exist, nothing to do.');
}
