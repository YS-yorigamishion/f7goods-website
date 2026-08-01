const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const password = process.env.ADMIN_PASSWORD || 'f7goods2026';
const hash = bcrypt.hashSync(password, 10);

const adminData = {
  username: 'admin',
  passwordHash: hash
};

fs.writeFileSync(
  path.join(__dirname, 'data', 'admin.json'),
  JSON.stringify(adminData, null, 2)
);

console.log('Admin initialized successfully.');
console.log('Username: admin');
console.log('Password: ' + password);
