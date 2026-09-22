const { events, startBotContainer } = require('../process/processService');
const Bot = require('../models/Bot');

const RESTART_DELAY_MS = 1500;
const MAX_AUTO_RESTARTS = 20; // guards against a crash-loop hammering the host

/**
 * Keeps bot status/restart_count in sync when a process's lifecycle changes
 * outside of a direct API call - a crash, or a soft resource-limit kill -
 * and applies each bot's own restart policy (never / on-crash / always),
 * since there's no container runtime to delegate that to anymore.
 * (Previously this subscribed to Docker's event stream and relied on
 * Docker's native RestartPolicy; processService exposes the same exit/oom
 * events directly since it now runs bots as plain child processes.)
 */
function watchContainerEvents() {
  events.on('exit', ({ botId, exitCode, wasStopIntentional }) => {
    const bot = Bot.getById(botId);
    if (!bot) return;

    const status = exitCode === 0 ? 'stopped' : 'error';
    Bot.updateStatus(bot.id, status);

    if (wasStopIntentional) return; // user pressed Stop - never auto-restart that

    const policy = bot.restart_policy || 'never';
    const shouldRestart = policy === 'always' || (policy === 'on-crash' && exitCode !== 0);
    if (!shouldRestart) return;
    if ((bot.restart_count || 0) >= MAX_AUTO_RESTARTS) {
      console.warn(`[process-events] bot ${bot.id} (${bot.name}) hit the auto-restart cap (${MAX_AUTO_RESTARTS}); leaving it stopped`);
      return;
    }

    setTimeout(async () => {
      const fresh = Bot.getById(botId);
      // Re-check: the user may have stopped/deleted/edited the bot in the gap.
      if (!fresh || fresh.status === 'running') return;
      try {
        const envVars = Bot.getEnvVars(fresh);
        const { containerId } = await startBotContainer({ bot: fresh, hostFolderPath: fresh.folder_path, envVars });
        Bot.updateStatus(fresh.id, 'running', containerId);
        Bot.markStarted(fresh.id);
        Bot.incrementRestartCount(fresh.id);
      } catch (err) {
        console.error(`[process-events] auto-restart failed for bot ${fresh.id} (${fresh.name}):`, err.message);
        Bot.updateStatus(fresh.id, 'error');
      }
    }, RESTART_DELAY_MS);
  });

  events.on('oom', ({ botId }) => {
    const bot = Bot.getById(botId);
    if (!bot) return;
    console.warn(`[process-events] bot ${bot.id} (${bot.name}) was killed for exceeding its resource limit`);
  });
}

module.exports = { watchContainerEvents };
