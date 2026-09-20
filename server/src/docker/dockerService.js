const Docker = require('dockerode');
const path = require('path');

const docker = new Docker(
  process.env.DOCKER_SOCKET ? { socketPath: process.env.DOCKER_SOCKET } : undefined
);

const IMAGES = {
  python: 'python:3.12-slim',
  node: 'node:20-slim'
};

const CPU_LIMIT = parseFloat(process.env.BOT_CPU_LIMIT || '0.5');
const MEMORY_LIMIT_MB = parseInt(process.env.BOT_MEMORY_LIMIT_MB || '256', 10);

function entryCommand(runtime, entryFile) {
  if (runtime === 'python') {
    return ['python', entryFile];
  }
  return ['node', entryFile];
}

async function ensureImage(runtime) {
  const image = IMAGES[runtime];
  const images = await docker.listImages({ filters: { reference: [image] } });
  if (images.length === 0) {
    await new Promise((resolve, reject) => {
      docker.pull(image, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err2) => (err2 ? reject(err2) : resolve()));
      });
    });
  }
  return image;
}

/**
 * Creates (or recreates) and starts a container for a bot.
 * The bot's folder is bind-mounted read/write so file-manager edits
 * are reflected immediately and any files the bot writes (e.g. its
 * SQLite db) persist back to the host.
 */
async function startBotContainer({ bot, hostFolderPath }) {
  await removeContainerIfExists(bot.container_name);

  const image = await ensureImage(bot.runtime);
  const cmd = entryCommand(bot.runtime, bot.entry_file);

  const container = await docker.createContainer({
    Image: image,
    name: bot.container_name,
    Cmd: cmd,
    WorkingDir: '/app',
    Tty: false,
    HostConfig: {
      Binds: [`${path.resolve(hostFolderPath)}:/app`],
      NanoCpus: Math.round(CPU_LIMIT * 1e9),
      Memory: MEMORY_LIMIT_MB * 1024 * 1024,
      MemorySwap: MEMORY_LIMIT_MB * 1024 * 1024,
      PidsLimit: 128,
      NetworkMode: 'bridge',
      RestartPolicy: { Name: 'no' },
      ReadonlyRootfs: false,
      SecurityOpt: ['no-new-privileges']
    },
    Env: [
      'PYTHONUNBUFFERED=1',
      `NEXUS_BOT_ID=${bot.id}`
    ]
  });

  await container.start();
  return container.id;
}

async function stopBotContainer(containerName) {
  try {
    const container = docker.getContainer(containerName);
    await container.stop({ t: 5 });
  } catch (err) {
    if (err.statusCode !== 404 && err.statusCode !== 304) throw err;
  }
}

async function removeContainerIfExists(containerName) {
  try {
    const container = docker.getContainer(containerName);
    await container.remove({ force: true });
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
}

async function getContainerStatus(containerName) {
  try {
    const container = docker.getContainer(containerName);
    const info = await container.inspect();
    return info.State.Running ? 'running' : (info.State.Status || 'stopped');
  } catch (err) {
    if (err.statusCode === 404) return 'stopped';
    throw err;
  }
}

async function getLogs(containerName, tailLines = 200) {
  try {
    const container = docker.getContainer(containerName);
    const buffer = await container.logs({
      stdout: true,
      stderr: true,
      tail: tailLines,
      timestamps: true
    });
    return demuxLogs(buffer);
  } catch (err) {
    if (err.statusCode === 404) return '';
    throw err;
  }
}

/** Docker multiplexes stdout/stderr with an 8-byte header per frame when not using a TTY. */
function demuxLogs(buffer) {
  let output = '';
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    output += buffer.slice(start, Math.min(end, buffer.length)).toString('utf8');
    offset = end;
  }
  return output || buffer.toString('utf8');
}

function streamLogs(containerName, onData) {
  const container = docker.getContainer(containerName);
  return container.logs(
    { stdout: true, stderr: true, follow: true, tail: 50, timestamps: true },
    (err, stream) => {
      if (err || !stream) return;
      stream.on('data', (chunk) => onData(demuxLogs(chunk)));
    }
  );
}

module.exports = {
  docker,
  startBotContainer,
  stopBotContainer,
  removeContainerIfExists,
  getContainerStatus,
  getLogs,
  streamLogs
};
