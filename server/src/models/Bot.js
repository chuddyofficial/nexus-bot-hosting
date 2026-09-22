const { randomUUID } = require('crypto');
const db = require('../db');

const MAX_BOTS_PER_USER = parseInt(process.env.MAX_BOTS_PER_USER || '5', 10);

function countByUser(userId) {
  return db.prepare('SELECT COUNT(*) AS c FROM bots WHERE user_id = ?').get(userId).c;
}

function createBot({ userId, name, runtime, containerName, folderPath }) {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO bots (id, user_id, name, runtime, status, container_name, folder_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'created', ?, ?, ?, ?)
  `).run(id, userId, name, runtime, containerName, folderPath, now, now);
  return getById(id);
}

function getById(id) {
  return db.prepare('SELECT * FROM bots WHERE id = ?').get(id);
}

function getByIdForUser(id, userId) {
  return db.prepare('SELECT * FROM bots WHERE id = ? AND user_id = ?').get(id, userId);
}

function listByUser(userId) {
  return db.prepare('SELECT * FROM bots WHERE user_id = ? ORDER BY created_at ASC').all(userId);
}

function listAll() {
  return db.prepare(`
    SELECT bots.*, users.email AS owner_email, users.display_name AS owner_name
    FROM bots JOIN users ON users.id = bots.user_id
    ORDER BY bots.created_at DESC
  `).all();
}

function limitForUser(user) {
  return user.bot_limit_override != null ? user.bot_limit_override : MAX_BOTS_PER_USER;
}

function updateStatus(id, status, containerId = undefined) {
  if (containerId === undefined) {
    db.prepare('UPDATE bots SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id);
  } else {
    db.prepare('UPDATE bots SET status = ?, container_id = ?, updated_at = ? WHERE id = ?')
      .run(status, containerId, Date.now(), id);
  }
}

function updateEntryFile(id, entryFile) {
  db.prepare('UPDATE bots SET entry_file = ?, updated_at = ? WHERE id = ?').run(entryFile, Date.now(), id);
}

function deleteBot(id) {
  db.prepare('DELETE FROM bots WHERE id = ?').run(id);
}

function toPublic(bot) {
  if (!bot) return null;
  return {
    id: bot.id,
    name: bot.name,
    runtime: bot.runtime,
    status: bot.status,
    entryFile: bot.entry_file,
    createdAt: bot.created_at,
    updatedAt: bot.updated_at
  };
}

function toAdminPublic(bot) {
  if (!bot) return null;
  return {
    ...toPublic(bot),
    userId: bot.user_id,
    ownerEmail: bot.owner_email,
    ownerName: bot.owner_name
  };
}

module.exports = {
  MAX_BOTS_PER_USER,
  countByUser,
  createBot,
  getById,
  getByIdForUser,
  listByUser,
  listAll,
  limitForUser,
  updateStatus,
  updateEntryFile,
  deleteBot,
  toPublic,
  toAdminPublic
};
