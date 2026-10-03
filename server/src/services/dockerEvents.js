const { docker } = require('../docker/dockerService');
const Bot = require('../models/Bot');

/**
 * Used when bots run on a remote Linux bot node. Subscribes to the Docker event stream and keeps bot status/restart_count in
 * sync when a container's lifecycle changes outside of our own API calls -
 * e.g. Docker's own RestartPolicy restarting a crashed bot, or an OOM kill.
 * Re-attaches automatically if the stream drops (e.g. the bot node restarts).
 */
const RECONNECT_MS = 10 * 1000;

function watchDockerEvents() {
  let retried = false;
  const retry = () => {
    if (retried) return;
    retried = true;
    setTimeout(watchDockerEvents, RECONNECT_MS);
  };

  docker.getEvents({ filters: { type: ['container'], event: ['start', 'die', 'restart', 'oom'] } }, (err, stream) => {
    if (err) {
      console.error('[container-events] failed to attach:', err.message);
      retry();
      return;
    }
    stream.on('end', retry);
    stream.on('close', retry);

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
      retry();
    });
  });
}

module.exports = { watchDockerEvents };
