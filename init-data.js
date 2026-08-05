const fs = require('fs');
const path = require('path');

const files = [
  'events.json', 'works.json', 'circles.json', 'projects.json',
  'settings.json', 'categories.json', 'announcements.json',
  'likes.json', 'wants.json', 'updates.json',
  'author-announcements.json', 'author-announcement-reads.json'
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
      // author-announcement-reads.json is an object, not array
      const defaultContent = file === 'author-announcement-reads.json' ? '{}' : (file.endsWith('s.json') ? '[]' : '{}');
      fs.writeFileSync(target, defaultContent);
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
