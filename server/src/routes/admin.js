const express = require('express');
const User = require('../models/User');
const Bot = require('../models/Bot');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const dockerService = require('../services/botRuntime');
const storage = require('../services/botStorage');
const emailService = require('../services/emailService');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// --- Overview ---

router.get('/overview', async (req, res) => {
  const users = User.listAll();
  const bots = Bot.listAll();
  const running = bots.filter((b) => b.status === 'running');

  let cpuTotal = 0;
  let memTotal = 0;
  await Promise.all(running.map(async (bot) => {
    try {
      const stats = await dockerService.getStats(bot.container_name);
      if (stats) { cpuTotal += stats.cpuPercent; memTotal += stats.memoryUsedMb; }
    } catch { /* container may be mid-transition; skip */ }
  }));

  res.json({
    totalUsers: users.length,
    disabledUsers: users.filter((u) => u.disabled).length,
    totalBots: bots.length,
    runningBots: running.length,
    cpuPercent: Math.round(cpuTotal * 10) / 10,
    memoryUsedMb: Math.round(memTotal)
  });
});

// --- Users ---

router.get('/users', (req, res) => {
  const users = User.listAll().map((u) => ({
    ...User.toPublic(u),
    botCount: Bot.countByUser(u.id)
  }));
  res.json({ users });
});

router.post('/users/:id/disable', async (req, res) => {
  const target = User.getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot disable your own account.' });

  User.setDisabled(target.id, true);

  const bots = Bot.listByUser(target.id);
  for (const bot of bots) {
    if (bot.status === 'running') {
      try {
        await dockerService.stopBotContainer(bot.container_name);
      } catch (err) {
        console.error(`Failed to stop container for bot ${bot.id}:`, err.message);
      }
      Bot.updateStatus(bot.id, 'stopped');
    }
  }

  emailService.sendAccountDisabledEmail(User.toPublic(target)).catch((e) => console.error('email error', e));
  res.json({ ok: true });
});

router.post('/users/:id/enable', (req, res) => {
  const target = User.getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  User.setDisabled(target.id, false);
  res.json({ ok: true });
});

router.put('/users/:id/bot-limit', (req, res) => {
  const target = User.getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const { limit } = req.body || {};
  const parsed = limit === null || limit === '' ? null : parseInt(limit, 10);
  if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000)) {
    return res.status(400).json({ error: 'Limit must be an integer between 0 and 1000, or empty to use the default.' });
  }

  User.setBotLimitOverride(target.id, parsed);
  res.json({ ok: true });
});

router.delete('/users/:id', async (req, res) => {
  const target = User.getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });

  const bots = Bot.listByUser(target.id);
  for (const bot of bots) {
    try {
      await dockerService.removeContainerIfExists(bot.container_name);
    } catch (err) {
      console.error(`Failed to remove container for bot ${bot.id}:`, err.message);
    }
    await storage.deleteBotFolder(bot);
  }

  User.deleteUser(target.id);
  res.json({ ok: true });
});

// --- Bots (platform-wide) ---

router.get('/bots', (req, res) => {
  const bots = Bot.listAll().map(Bot.toAdminPublic);
  res.json({ bots });
});

router.post('/bots/:id/stop', async (req, res) => {
  const bot = Bot.getById(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  try {
    await dockerService.stopBotContainer(bot.container_name);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stop bot. ' + err.message });
  }
  Bot.updateStatus(bot.id, 'stopped');
  res.json({ ok: true });
});

router.delete('/bots/:id', async (req, res) => {
  const bot = Bot.getById(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });

  try {
    await dockerService.removeContainerIfExists(bot.container_name);
  } catch (err) {
    console.error(`Failed to remove container for bot ${bot.id}:`, err.message);
  }
  await storage.deleteBotFolder(bot);
  Bot.deleteBot(bot.id);

  res.json({ ok: true });
});

module.exports = router;
