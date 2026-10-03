const botNode = require('../botnode/client');

/**
 * The service that actually runs bots. With BOT_NODE_URL set, bots run as
 * isolated Docker containers on the Linux bot node (docker/dockerService.js).
 * Otherwise they run as plain child processes on this machine
 * (process/processService.js), since this Windows VPS can't run Docker.
 * Both expose the same API (startBotContainer, stopBotContainer, getStats, ...).
 */
module.exports = botNode.isRemote
  ? require('../docker/dockerService')
  : require('../process/processService');
