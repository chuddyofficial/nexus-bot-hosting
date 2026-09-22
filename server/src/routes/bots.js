const express = require('express');
const fs = require('fs');
const path = require('path');
const Bot = require('../models/Bot');
const requireAuth = require('../middleware/requireAuth');
const dockerService = require('../docker/dockerService');
const emailService = require('../services/emailService');

const router = express.Router();
router.use(requireAuth);

const BOTS_DIR = path.resolve(__dirname, '..', '..', process.env.BOTS_DIR || '../bots');
if (!fs.existsSync(BOTS_DIR)) fs.mkdirSync(BOTS_DIR, { recursive: true });

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 _-]{1,31}$/;

function botFolderPath(userId, botId) {
  return path.join(BOTS_DIR, userId, botId);
}

router.get('/', (req, res) => {
  const bots = Bot.listByUser(req.user.id).map(Bot.toPublic);
  res.json({ bots, limit: Bot.limitForUser(req.user) });
});

router.post('/', async (req, res) => {
  const { name, runtime } = req.body || {};
  const limit = Bot.limitForUser(req.user);

  if (!name || !NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Bot name must be 2-32 characters (letters, numbers, spaces, - or _).' });
  }
  if (!['python', 'node'].includes(runtime)) {
    return res.status(400).json({ error: 'Runtime must be "python" or "node".' });
  }
  if (Bot.countByUser(req.user.id) >= limit) {
    return res.status(403).json({ error: `You can only host up to ${limit} bots.` });
  }

  const { randomUUID } = require('crypto');
  const id = randomUUID();
  const folderPath = botFolderPath(req.user.id, id);
  fs.mkdirSync(folderPath, { recursive: true });

  const containerName = `nexus-bot-${id}`;
  const bot = Bot.createBot({ userId: req.user.id, name, runtime, containerName, folderPath });
  // Fix the row's id/folder to match the pre-generated id/folder used on disk.
  require('../db').prepare('UPDATE bots SET id = ?, folder_path = ? WHERE id = ?').run(id, folderPath, bot.id);

  const entryFile = runtime === 'python' ? 'main.py' : 'index.js';
  const starter = runtime === 'python'
    ? '# Upload your bot files, or edit this starter file.\nprint("Hello from your Nexus bot!")\n'
    : '// Upload your bot files, or edit this starter file.\nconsole.log("Hello from your Nexus bot!");\n';
  fs.writeFileSync(path.join(folderPath, entryFile), starter, 'utf8');
  require('../db').prepare('UPDATE bots SET entry_file = ? WHERE id = ?').run(entryFile, id);

  const created = Bot.getById(id);
  emailService.sendBotCreatedEmail(req.user, created).catch((e) => console.error('email error', e));

  res.status(201).json({ bot: Bot.toPublic(created) });
});

router.get('/:id', (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });
  res.json({ bot: Bot.toPublic(bot) });
});

router.delete('/:id', async (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  await dockerService.removeContainerIfExists(bot.container_name);
  fs.rmSync(bot.folder_path, { recursive: true, force: true });
  Bot.deleteBot(bot.id);

  res.json({ ok: true });
});

router.post('/:id/start', async (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });
  if (!bot.entry_file || !fs.existsSync(path.join(bot.folder_path, bot.entry_file))) {
    return res.status(400).json({ error: `Entry file "${bot.entry_file}" not found. Upload your bot files first.` });
  }

  try {
    const containerId = await dockerService.startBotContainer({ bot, hostFolderPath: bot.folder_path });
    Bot.updateStatus(bot.id, 'running', containerId);
    res.json({ bot: Bot.toPublic(Bot.getById(bot.id)) });
  } catch (err) {
    console.error('start error', err);
    Bot.updateStatus(bot.id, 'error');
    res.status(500).json({ error: 'Failed to start bot. ' + err.message });
  }
});

router.post('/:id/stop', async (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  await dockerService.stopBotContainer(bot.container_name);
  Bot.updateStatus(bot.id, 'stopped');
  res.json({ bot: Bot.toPublic(Bot.getById(bot.id)) });
});

router.get('/:id/status', async (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  const liveStatus = await dockerService.getContainerStatus(bot.container_name);
  if (liveStatus !== bot.status) Bot.updateStatus(bot.id, liveStatus);
  res.json({ status: liveStatus });
});

router.get('/:id/logs', async (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  const logs = await dockerService.getLogs(bot.container_name, 500);
  res.json({ logs });
});

router.put('/:id/entry-file', (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  const { entryFile } = req.body || {};
  if (!entryFile || /[\\/]/.test(entryFile) || entryFile.includes('..')) {
    return res.status(400).json({ error: 'Invalid entry file name.' });
  }
  if (!fs.existsSync(path.join(bot.folder_path, entryFile))) {
    return res.status(400).json({ error: 'That file does not exist in your bot folder.' });
  }

  Bot.updateEntryFile(bot.id, entryFile);
  res.json({ bot: Bot.toPublic(Bot.getById(bot.id)) });
});

// Generates (or rotates) this bot's SFTP credentials. The plaintext password is
// only ever returned in this response - only a bcrypt hash is stored.
router.post('/:id/sftp-credentials', (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  const { sftpUsername, sftpPassword } = Bot.regenerateSftpCredentials(bot.id);
  const port = process.env.SFTP_PORT || '2222';
  const host = process.env.PUBLIC_DOMAIN || 'bot.chnexus.net';

  res.json({ sftpUsername, sftpPassword, host, port });
});

module.exports = router;
