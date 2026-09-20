const { randomUUID, randomBytes } = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');

const SALT_ROUNDS = 12;

function createUser({ email, password, displayName }) {
  const id = randomUUID();
  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
  const verifyToken = randomBytes(32).toString('hex');
  const now = Date.now();

  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, email_verified, verify_token, created_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `).run(id, email.toLowerCase().trim(), passwordHash, displayName, verifyToken, now);

  return getUserById(id);
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByVerifyToken(token) {
  return db.prepare('SELECT * FROM users WHERE verify_token = ?').get(token);
}

function markEmailVerified(id) {
  db.prepare('UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?').run(id);
}

function setResetToken(id, token, expiresAt) {
  db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(token, expiresAt, id);
}

function getUserByResetToken(token) {
  return db.prepare('SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?')
    .get(token, Date.now());
}

function updatePassword(id, newPassword) {
  const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?')
    .run(hash, id);
}

function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.password_hash);
}

function toPublic(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    emailVerified: !!user.email_verified,
    createdAt: user.created_at
  };
}

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByVerifyToken,
  markEmailVerified,
  setResetToken,
  getUserByResetToken,
  updatePassword,
  verifyPassword,
  toPublic
};
