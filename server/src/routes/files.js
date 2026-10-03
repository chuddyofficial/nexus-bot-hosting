const express = require('express');
const Bot = require('../models/Bot');
const requireAuth = require('../middleware/requireAuth');
const botNode = require('../botnode/client');
const { createFileRouter } = require('../services/fileRoutes');

const router = express.Router();
router.use(requireAuth);

function getBotOr404(req, res) {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return null;
  }
  return bot;
}

if (botNode.isRemote) {
  // Files live on the Linux bot node: check ownership here, then stream the
  // request through to the same file routes running on the node.
  router.all('/:id/:op(tree|file|create|rename|upload|extract|download)', (req, res) => {
    const bot = getBotOr404(req, res);
    if (!bot) return;

    const query = new URLSearchParams(req.originalUrl.split('?')[1] || '');
    if (req.params.op === 'download') query.set('name', bot.name);
    const qs = query.toString();
    const target = `${botNode.botPath(bot.user_id, bot.id)}/files/${req.params.op}${qs ? '?' + qs : ''}`;
    botNode.proxyRequest(req, res, target);
  });
} else {
  router.use('/:id', createFileRouter((req, res) => {
    const bot = getBotOr404(req, res);
    return bot && { root: bot.folder_path, downloadName: bot.name };
  }));
}

module.exports = router;
