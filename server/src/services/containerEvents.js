const botNode = require('../botnode/client');

/**
 * Keeps bot status/restart_count in sync with the active bot runtime:
 * Docker's event stream on the Linux bot node (dockerEvents.js), or this
 * machine's child-process exit events (processEvents.js).
 */
function watchContainerEvents() {
  if (botNode.isRemote) require('./dockerEvents').watchDockerEvents();
  else require('./processEvents').watchProcessEvents();
}

module.exports = { watchContainerEvents };
