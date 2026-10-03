const { randomUUID, randomBytes } = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');

const MAX_BOTS_PER_USER = parseInt(process.env.MAX_BOTS_PER_USER || '5', 10);
const SALT_ROUNDS = 12;

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

function updateSettings(id, { name }) {
  db.prepare('UPDATE bots SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), id);
}

function updateStartupConfig(id, { startCommand, preStartHook, restartPolicy, autoStart }) {
  db.prepare(`
    UPDATE bots SET start_command = ?, pre_start_hook = ?, restart_policy = ?, auto_start = ?, updated_at = ?
    WHERE id = ?
  `).run(startCommand || null, preStartHook || null, restartPolicy, autoStart ? 1 : 0, Date.now(), id);
}

function updateResourceLimits(id, { cpuLimit, memoryLimitMb }) {
  db.prepare('UPDATE bots SET cpu_limit = ?, memory_limit_mb = ?, updated_at = ? WHERE id = ?')
    .run(cpuLimit, memoryLimitMb, Date.now(), id);
}

function updateEnvVars(id, envVarsObj) {
  db.prepare('UPDATE bots SET env_vars = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(envVarsObj || {}), Date.now(), id);
}

function getEnvVars(bot) {
  if (!bot.env_vars) return {};
  try {
    return JSON.parse(bot.env_vars);
  } catch {
    return {};
  }
}

function incrementRestartCount(id) {
  db.prepare('UPDATE bots SET restart_count = restart_count + 1, updated_at = ? WHERE id = ?').run(Date.now(), id);
}

function markStarted(id) {
  db.prepare('UPDATE bots SET last_started_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), id);
}

function listAutoStart() {
  return db.prepare('SELECT * FROM bots WHERE auto_start = 1').all();
}

function deleteBot(id) {
  db.prepare('DELETE FROM bots WHERE id = ?').run(id);
}

/** Generates fresh SFTP credentials for a bot, storing only a bcrypt hash of the password. */
function regenerateSftpCredentials(id) {
  const sftpUsername = `bot_${id.split('-')[0]}`;
  const sftpPassword = randomBytes(18).toString('base64url');
  const hash = bcrypt.hashSync(sftpPassword, SALT_ROUNDS);
  db.prepare('UPDATE bots SET sftp_username = ?, sftp_password_hash = ?, updated_at = ? WHERE id = ?')
    .run(sftpUsername, hash, Date.now(), id);
  return { sftpUsername, sftpPassword };
}

function getBySftpUsername(sftpUsername) {
  return db.prepare('SELECT * FROM bots WHERE sftp_username = ?').get(sftpUsername);
}

function listSftpLogins() {
  return db.prepare(`
    SELECT id, user_id, sftp_username, sftp_password_hash FROM bots
    WHERE sftp_username IS NOT NULL AND sftp_password_hash IS NOT NULL
  `).all();
}

function verifySftpPassword(bot, password) {
  if (!bot.sftp_password_hash) return false;
  return bcrypt.compareSync(password, bot.sftp_password_hash);
}

function toPublic(bot) {
  if (!bot) return null;
  return {
    id: bot.id,
    name: bot.name,
    runtime: bot.runtime,
    status: bot.status,
    entryFile: bot.entry_file,
    sftpUsername: bot.sftp_username,
    startCommand: bot.start_command,
    preStartHook: bot.pre_start_hook,
    restartPolicy: bot.restart_policy,
    autoStart: !!bot.auto_start,
    cpuLimit: bot.cpu_limit,
    memoryLimitMb: bot.memory_limit_mb,
    envVars: getEnvVars(bot),
    restartCount: bot.restart_count,
    lastStartedAt: bot.last_started_at,
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
  updateSettings,
  updateStartupConfig,
  updateResourceLimits,
  updateEnvVars,
  getEnvVars,
  incrementRestartCount,
  markStarted,
  listAutoStart,
  deleteBot,
  regenerateSftpCredentials,
  getBySftpUsername,
  listSftpLogins,
  verifySftpPassword,
  toPublic,
  toAdminPublic
};
