const { docker } = require('../docker/dockerService');
const Bot = require('../models/Bot');

/**
 * Subscribes to the Docker event stream and keeps bot status/restart_count in
 * sync when a container's lifecycle changes outside of our own API calls -
 * e.g. Docker's own RestartPolicy restarting a crashed bot, or an OOM kill.
 */
function watchContainerEvents() {
  docker.getEvents({ filters: { type: ['container'], event: ['start', 'die', 'restart', 'oom'] } }, (err, stream) => {
    if (err) {
      console.error('[container-events] failed to attach:', err.message);
      return;
    }

    stream.on('data', (chunk) => {
      let event;
      try {
        event = JSON.parse(chunk.toString());
      } catch {
        return;
      }

      const containerName = event.Actor?.Attributes?.name;
      if (!containerName || !containerName.startsWith('nexus-bot-')) return;
      if (containerName.endsWith('-prestart')) return;

      const bot = Bot.getById(containerName.replace('nexus-bot-', ''));
      if (!bot) return;

      if (event.Action === 'start') {
        Bot.updateStatus(bot.id, 'running');
      } else if (event.Action === 'die') {
        const exitCode = event.Actor?.Attributes?.exitCode;
        Bot.updateStatus(bot.id, exitCode === '0' ? 'stopped' : 'error');
      } else if (event.Action === 'restart') {
        Bot.incrementRestartCount(bot.id);
      } else if (event.Action === 'oom') {
        console.warn(`[container-events] bot ${bot.id} (${bot.name}) was OOM-killed`);
      }
    });

    stream.on('error', (streamErr) => {
      console.error('[container-events] stream error:', streamErr.message);
    });
  });
}

module.exports = { watchContainerEvents };
