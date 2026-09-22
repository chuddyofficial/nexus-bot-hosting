const fs = require('fs');
const path = require('path');
const Bot = require('../models/Bot');
const dockerService = require('../process/processService');

/** Starts every bot flagged auto_start=1, called once on server boot. */
async function runAutoStart() {
  const bots = Bot.listAutoStart();
  if (bots.length === 0) return;

  console.log(`[auto-start] starting ${bots.length} bot(s) flagged for auto-start...`);
  for (const bot of bots) {
    try {
      if (!bot.start_command && (!bot.entry_file || !fs.existsSync(path.join(bot.folder_path, bot.entry_file)))) {
        console.warn(`[auto-start] skipping "${bot.name}" (${bot.id}): entry file missing`);
        continue;
      }
      const envVars = Bot.getEnvVars(bot);
      const { containerId } = await dockerService.startBotContainer({ bot, hostFolderPath: bot.folder_path, envVars });
      Bot.updateStatus(bot.id, 'running', containerId);
      Bot.markStarted(bot.id);
      console.log(`[auto-start] started "${bot.name}" (${bot.id})`);
    } catch (err) {
      console.error(`[auto-start] failed to start "${bot.name}" (${bot.id}):`, err.message);
      Bot.updateStatus(bot.id, 'error');
    }
  }
}

module.exports = { runAutoStart };
