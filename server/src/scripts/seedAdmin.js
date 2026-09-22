// One-off script to create or promote an admin account.
// Usage: node src/scripts/seedAdmin.js <email> <password> <username> [displayName]
require('dotenv').config();

const User = require('../models/User');

const [, , email, password, username, displayName] = process.argv;

if (!email || !password) {
  console.error('Usage: node src/scripts/seedAdmin.js <email> <password> [username] [displayName]');
  process.exit(1);
}

const existing = User.getUserByEmail(email);
if (existing) {
  const db = require('../db');
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(existing.id);
  console.log(`Existing user ${email} promoted to admin.`);
  process.exit(0);
}

const user = User.createUser({
  email,
  password,
  displayName: displayName || username || 'Admin',
  username: username || null,
  isAdmin: true
});

require('../models/User');
const db = require('../db');
db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(user.id);

console.log(`Admin account created: ${user.email} (username: ${user.username || 'none'})`);
