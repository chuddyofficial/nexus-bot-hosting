const express = require('express');
const fs = require('fs');
const path = require('path');
const Bot = require('../models/Bot');
const requireAuth = require('../middleware/requireAuth');
const dockerService = require('../process/processService');
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

  try {
    await dockerService.removeContainerIfExists(bot.container_name);
  } catch (err) {
    console.error(`Failed to remove container for bot ${bot.id}:`, err.message);
  }
  fs.rmSync(bot.folder_path, { recursive: true, force: true });
  Bot.deleteBot(bot.id);

  res.json({ ok: true });
});

router.post('/:id/start', async (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });
  if (!bot.start_command && (!bot.entry_file || !fs.existsSync(path.join(bot.folder_path, bot.entry_file)))) {
    return res.status(400).json({ error: `Entry file "${bot.entry_file}" not found. Upload your bot files first.` });
  }

  try {
    const envVars = Bot.getEnvVars(bot);
    const { containerId, hookOutput } = await dockerService.startBotContainer({ bot, hostFolderPath: bot.folder_path, envVars });
    Bot.updateStatus(bot.id, 'running', containerId);
    Bot.markStarted(bot.id);
    res.json({ bot: Bot.toPublic(Bot.getById(bot.id)), hookOutput });
  } catch (err) {
    console.error('start error', err);
    Bot.updateStatus(bot.id, 'error');
    res.status(500).json({ error: 'Failed to start bot. ' + err.message, hookOutput: err.hookOutput });
  }
});

router.post('/:id/stop', async (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  try {
    await dockerService.stopBotContainer(bot.container_name);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stop bot. ' + err.message });
  }
  Bot.updateStatus(bot.id, 'stopped');
  res.json({ bot: Bot.toPublic(Bot.getById(bot.id)) });
});

router.get('/:id/status', async (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  try {
    const liveStatus = await dockerService.getContainerStatus(bot.container_name);
    if (liveStatus !== bot.status) Bot.updateStatus(bot.id, liveStatus);
    res.json({ status: liveStatus });
  } catch (err) {
    res.status(503).json({ error: 'Could not reach the container runtime.' });
  }
});

router.get('/:id/logs', async (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  try {
    const logs = await dockerService.getLogs(bot.container_name, 500);
    res.json({ logs });
  } catch (err) {
    res.status(503).json({ error: 'Could not reach the container runtime.' });
  }
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
  // SFTP traffic can't go through a Cloudflare-proxied domain (it only forwards
  // HTTP/HTTPS), so this must be the VPS's real reachable address, not PUBLIC_DOMAIN.
  const host = process.env.SFTP_HOST || process.env.PUBLIC_DOMAIN || 'bot.chnexus.net';

  res.json({ sftpUsername, sftpPassword, host, port });
});

// Connection info only (no credentials) - lets the UI show the correct host/port
// for an already-generated login without re-issuing a new password.
router.get('/:id/sftp-info', (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  const port = process.env.SFTP_PORT || '2222';
  const host = process.env.SFTP_HOST || process.env.PUBLIC_DOMAIN || 'bot.chnexus.net';
  res.json({ host, port });
});

// --- Settings tab: rename ---
router.put('/:id/settings', (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  const { name } = req.body || {};
  if (!name || !NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Bot name must be 2-32 characters (letters, numbers, spaces, - or _).' });
  }

  Bot.updateSettings(bot.id, { name });
  res.json({ bot: Bot.toPublic(Bot.getById(bot.id)) });
});

// --- Startup/process config tab ---
const RESTART_POLICIES = ['never', 'on-crash', 'always'];

router.put('/:id/startup', (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  const { startCommand, preStartHook, restartPolicy, autoStart } = req.body || {};
  if (restartPolicy && !RESTART_POLICIES.includes(restartPolicy)) {
    return res.status(400).json({ error: `Restart policy must be one of: ${RESTART_POLICIES.join(', ')}.` });
  }
  if (startCommand && startCommand.length > 500) {
    return res.status(400).json({ error: 'Start command is too long (max 500 characters).' });
  }
  if (preStartHook && preStartHook.length > 2000) {
    return res.status(400).json({ error: 'Pre-start hook is too long (max 2000 characters).' });
  }

  Bot.updateStartupConfig(bot.id, {
    startCommand: startCommand || null,
    preStartHook: preStartHook || null,
    restartPolicy: restartPolicy || bot.restart_policy || 'never',
    autoStart: !!autoStart
  });
  res.json({ bot: Bot.toPublic(Bot.getById(bot.id)) });
});

// --- Resource limits (bot settings tab) ---
router.put('/:id/resources', (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  const { cpuLimit, memoryLimitMb } = req.body || {};
  const cpu = cpuLimit === '' || cpuLimit == null ? null : Number(cpuLimit);
  const mem = memoryLimitMb === '' || memoryLimitMb == null ? null : parseInt(memoryLimitMb, 10);

  if (cpu !== null && (!Number.isFinite(cpu) || cpu <= 0 || cpu > dockerService.MAX_CPU_LIMIT)) {
    return res.status(400).json({ error: `CPU limit must be between 0 and ${dockerService.MAX_CPU_LIMIT} cores.` });
  }
  if (mem !== null && (!Number.isInteger(mem) || mem <= 0 || mem > dockerService.MAX_MEMORY_LIMIT_MB)) {
    return res.status(400).json({ error: `Memory limit must be between 0 and ${dockerService.MAX_MEMORY_LIMIT_MB} MB.` });
  }

  Bot.updateResourceLimits(bot.id, { cpuLimit: cpu, memoryLimitMb: mem });
  res.json({
    bot: Bot.toPublic(Bot.getById(bot.id)),
    defaults: { cpuLimit: dockerService.DEFAULT_CPU_LIMIT, memoryLimitMb: dockerService.DEFAULT_MEMORY_LIMIT_MB },
    max: { cpuLimit: dockerService.MAX_CPU_LIMIT, memoryLimitMb: dockerService.MAX_MEMORY_LIMIT_MB }
  });
});

// --- Environment variables ---
router.put('/:id/env', (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  const { envVars } = req.body || {};
  if (typeof envVars !== 'object' || envVars === null || Array.isArray(envVars)) {
    return res.status(400).json({ error: 'envVars must be an object of key/value pairs.' });
  }
  const entries = Object.entries(envVars);
  if (entries.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 environment variables.' });
  }
  for (const [key, value] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return res.status(400).json({ error: `Invalid variable name "${key}". Use letters, numbers, underscores; can't start with a number.` });
    }
    if (String(value).length > 4000) {
      return res.status(400).json({ error: `Value for "${key}" is too long (max 4000 characters).` });
    }
  }

  Bot.updateEnvVars(bot.id, envVars);
  res.json({ bot: Bot.toPublic(Bot.getById(bot.id)) });
});

// --- Live resource metrics (per-bot) ---
router.get('/:id/stats', async (req, res) => {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  if (bot.status !== 'running') {
    return res.json({ running: false });
  }

  const stats = await dockerService.getStats(bot.container_name);
  if (!stats) return res.json({ running: false });

  const info = await dockerService.getContainerInfo(bot.container_name);
  const startedAt = info?.State?.StartedAt ? new Date(info.State.StartedAt).getTime() : bot.last_started_at;
  const uptimeSeconds = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;

  res.json({
    running: true,
    cpuPercent: stats.cpuPercent,
    memoryUsedMb: stats.memoryUsedMb,
    memoryLimitMb: stats.memoryLimitMb,
    uptimeSeconds,
    restartCount: bot.restart_count
  });
});

module.exports = router;
