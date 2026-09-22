const { randomUUID, randomBytes } = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');

const SALT_ROUNDS = 12;

function createUser({ email, password, displayName, username = null, isAdmin = false }) {
  const id = randomUUID();
  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
  const verifyToken = randomBytes(32).toString('hex');
  const now = Date.now();

  db.prepare(`
    INSERT INTO users (id, email, username, password_hash, display_name, email_verified, verify_token, is_admin, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(id, email.toLowerCase().trim(), username, passwordHash, displayName, verifyToken, isAdmin ? 1 : 0, now);

  return getUserById(id);
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
}

function getUserByEmailOrUsername(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;
  return db.prepare('SELECT * FROM users WHERE email = ? OR username = ?')
    .get(value.toLowerCase(), value);
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

function listAll() {
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
}

function setDisabled(id, disabled) {
  db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, id);
}

function setBotLimitOverride(id, limit) {
  db.prepare('UPDATE users SET bot_limit_override = ? WHERE id = ?').run(limit, id);
}

function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function updateProfile(id, { displayName, username }) {
  db.prepare('UPDATE users SET display_name = ?, username = ? WHERE id = ?')
    .run(displayName, username || null, id);
}

function setPendingEmail(id, pendingEmail, token) {
  db.prepare('UPDATE users SET pending_email = ?, pending_email_token = ? WHERE id = ?')
    .run(pendingEmail, token, id);
}

function getUserByPendingEmailToken(token) {
  return db.prepare('SELECT * FROM users WHERE pending_email_token = ?').get(token);
}

function confirmPendingEmail(id) {
  const user = getUserById(id);
  if (!user || !user.pending_email) return null;
  db.prepare('UPDATE users SET email = ?, pending_email = NULL, pending_email_token = NULL, email_verified = 1 WHERE id = ?')
    .run(user.pending_email, id);
  return getUserById(id);
}

function toPublic(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.display_name,
    emailVerified: !!user.email_verified,
    isAdmin: !!user.is_admin,
    disabled: !!user.disabled,
    botLimitOverride: user.bot_limit_override,
    pendingEmail: user.pending_email,
    createdAt: user.created_at
  };
}

module.exports = {
  createUser,
  getUserByEmail,
  getUserByUsername,
  getUserByEmailOrUsername,
  getUserById,
  getUserByVerifyToken,
  markEmailVerified,
  setResetToken,
  getUserByResetToken,
  updatePassword,
  verifyPassword,
  listAll,
  setDisabled,
  setBotLimitOverride,
  updateProfile,
  setPendingEmail,
  getUserByPendingEmailToken,
  confirmPendingEmail,
  deleteUser,
  toPublic
};
