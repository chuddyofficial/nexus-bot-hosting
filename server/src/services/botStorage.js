const fs = require('fs');
const path = require('path');
const botNode = require('../botnode/client');

/**
 * Where bot folders live. Locally (default) that's BOTS_DIR on this machine;
 * with BOT_NODE_URL set it's the remote Linux bot node, and every operation
 * here goes over its /agent API instead of touching the local disk.
 */
const BOTS_DIR = path.resolve(__dirname, '..', '..', process.env.BOTS_DIR || '../bots');
if (!botNode.isRemote && !fs.existsSync(BOTS_DIR)) fs.mkdirSync(BOTS_DIR, { recursive: true });

function localFolderPath(userId, botId) {
  return path.join(BOTS_DIR, userId, botId);
}

/** Creates the bot's folder, seeding { entryFile, content } if given. `bot` needs id, user_id, folder_path. */
async function createBotFolder(bot, starter) {
  if (botNode.isRemote) {
    await botNode.call('POST', botNode.botPath(bot.user_id, bot.id), starter || {});
    return;
  }
  fs.mkdirSync(bot.folder_path, { recursive: true });
  if (starter) fs.writeFileSync(path.join(bot.folder_path, starter.entryFile), starter.content, 'utf8');
}

/** Deletes the bot's folder. Remote failures are logged rather than thrown so deletes still go through. */
async function deleteBotFolder(bot) {
  if (botNode.isRemote) {
    try {
      await botNode.call('DELETE', botNode.botPath(bot.user_id, bot.id));
    } catch (err) {
      console.error(`Failed to delete files for bot ${bot.id} on the bot node:`, err.message);
    }
    return;
  }
  fs.rmSync(bot.folder_path, { recursive: true, force: true });
}

async function fileExists(bot, relPath) {
  if (botNode.isRemote) {
    const { exists } = await botNode.call(
      'GET',
      `${botNode.botPath(bot.user_id, bot.id)}/exists?path=${encodeURIComponent(relPath)}`
    );
    return !!exists;
  }
  return fs.existsSync(path.join(bot.folder_path, relPath));
}

/** The bot folder's path as seen by the Docker daemon (used for the container bind mount). */
async function dockerBindPath(bot) {
  if (botNode.isRemote) {
    const { botsDir } = await botNode.getInfo();
    return path.posix.join(botsDir, bot.user_id, bot.id);
  }
  return path.resolve(bot.folder_path);
}

/**
 * Pushes every bot's SFTP login (username + bcrypt hash) to the bot node, which
 * runs the SFTP server next to the files. No-op when bots run locally.
 */
async function syncSftpUsers() {
  if (!botNode.isRemote) return;
  const Bot = require('../models/Bot');
  const users = Bot.listSftpLogins().map((b) => ({
    username: b.sftp_username,
    hash: b.sftp_password_hash,
    userId: b.user_id,
    botId: b.id
  }));
  await botNode.call('PUT', '/agent/sftp-users', { users });
}

module.exports = {
  isRemote: botNode.isRemote,
  localFolderPath,
  createBotFolder,
  deleteBotFolder,
  fileExists,
  dockerBindPath,
  syncSftpUsers
};
