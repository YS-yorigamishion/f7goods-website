const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, 'data', 'admin.json');
const password = process.env.ADMIN_PASSWORD;
const force = process.argv.includes('--force');

if (!password || password.length < 8) {
  console.error('Set ADMIN_PASSWORD env var (min 8 chars) before running init-admin.js');
  process.exit(1);
}

if (fs.existsSync(adminPath) && !force) {
  try {
    const existing = JSON.parse(fs.readFileSync(adminPath, 'utf-8'));
    if (existing.passwordHash && existing.passwordHash !== '$2a$10$placeholder') {
      console.error('Admin already initialized. Use --force to overwrite.');
      process.exit(1);
    }
  } catch {
    // corrupt file — allow reinit
  }
}

const hash = bcrypt.hashSync(password, 10);
fs.writeFileSync(
  adminPath,
  JSON.stringify({ username: 'admin', passwordHash: hash }, null, 2)
);

console.log('Admin initialized successfully.');
console.log('Username: admin');
console.log('Password: (set via ADMIN_PASSWORD, not printed)');
