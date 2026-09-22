const Docker = require('dockerode');
const path = require('path');

const docker = new Docker(
  process.env.DOCKER_SOCKET ? { socketPath: process.env.DOCKER_SOCKET } : undefined
);

const IMAGES = {
  python: 'python:3.12-slim',
  node: 'node:20-slim'
};

const DEFAULT_CPU_LIMIT = parseFloat(process.env.BOT_CPU_LIMIT || '0.5');
const DEFAULT_MEMORY_LIMIT_MB = parseInt(process.env.BOT_MEMORY_LIMIT_MB || '256', 10);
const MAX_CPU_LIMIT = parseFloat(process.env.BOT_MAX_CPU_LIMIT || '2');
const MAX_MEMORY_LIMIT_MB = parseInt(process.env.BOT_MAX_MEMORY_LIMIT_MB || '1024', 10);

const RESTART_POLICY_MAP = {
  never: { Name: 'no' },
  'on-crash': { Name: 'on-failure', MaximumRetryCount: 10 },
  always: { Name: 'unless-stopped' }
};

function shellCommand(runtime, command) {
  const shell = runtime === 'python' ? ['/bin/sh', '-c'] : ['/bin/sh', '-c'];
  return [...shell, command];
}

function entryCommand(bot) {
  if (bot.start_command && bot.start_command.trim()) {
    return shellCommand(bot.runtime, bot.start_command.trim());
  }
  const runner = bot.runtime === 'python' ? 'python' : 'node';
  return [runner, bot.entry_file];
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

function clamp(value, fallback, max) {
  const n = value == null ? fallback : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function buildEnv(bot, envVarsObj) {
  const env = ['PYTHONUNBUFFERED=1', `NEXUS_BOT_ID=${bot.id}`];
  for (const [key, value] of Object.entries(envVarsObj || {})) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      env.push(`${key}=${value}`);
    }
  }
  return env;
}

/**
 * Runs the bot's pre-start hook (if any) as a one-off container using the same
 * image/mount, capturing combined output. Resolves with { ok, output }.
 */
async function runPreStartHook({ bot, hostFolderPath, image, env }) {
  if (!bot.pre_start_hook || !bot.pre_start_hook.trim()) {
    return { ok: true, output: '' };
  }

  const hookContainerName = `${bot.container_name}-prestart`;
  await removeContainerIfExists(hookContainerName);

  const container = await docker.createContainer({
    Image: image,
    name: hookContainerName,
    Cmd: shellCommand(bot.runtime, bot.pre_start_hook.trim()),
    WorkingDir: '/app',
    Tty: false,
    HostConfig: {
      Binds: [`${path.resolve(hostFolderPath)}:/app`],
      NanoCpus: Math.round(clamp(bot.cpu_limit, DEFAULT_CPU_LIMIT, MAX_CPU_LIMIT) * 1e9),
      Memory: clamp(bot.memory_limit_mb, DEFAULT_MEMORY_LIMIT_MB, MAX_MEMORY_LIMIT_MB) * 1024 * 1024,
      PidsLimit: 128,
      NetworkMode: 'bridge',
      SecurityOpt: ['no-new-privileges']
    },
    Env: env
  });

  await container.start();
  const waitResult = await Promise.race([
    container.wait(),
    new Promise((resolve) => setTimeout(() => resolve({ StatusCode: -1, timedOut: true }), 5 * 60 * 1000))
  ]);

  const logsBuffer = await container.logs({ stdout: true, stderr: true, timestamps: false }).catch(() => Buffer.alloc(0));
  const output = demuxLogs(logsBuffer);
  await removeContainerIfExists(hookContainerName);

  if (waitResult.timedOut) {
    return { ok: false, output: output + '\n[pre-start hook timed out after 5 minutes]' };
  }
  return { ok: waitResult.StatusCode === 0, output };
}

/**
 * Creates (or recreates) and starts a container for a bot.
 * The bot's folder is bind-mounted read/write so file-manager edits
 * are reflected immediately and any files the bot writes (e.g. its
 * SQLite db) persist back to the host.
 */
async function startBotContainer({ bot, hostFolderPath, envVars }) {
  await removeContainerIfExists(bot.container_name);

  const image = await ensureImage(bot.runtime);
  const env = buildEnv(bot, envVars);

  const hookResult = await runPreStartHook({ bot, hostFolderPath, image, env });
  if (!hookResult.ok) {
    const err = new Error('Pre-start hook failed. ' + (hookResult.output || '').slice(-1000));
    err.hookOutput = hookResult.output;
    throw err;
  }

  const cmd = entryCommand(bot);
  const restartPolicy = RESTART_POLICY_MAP[bot.restart_policy] || RESTART_POLICY_MAP.never;

  const container = await docker.createContainer({
    Image: image,
    name: bot.container_name,
    Cmd: cmd,
    WorkingDir: '/app',
    Tty: false,
    HostConfig: {
      Binds: [`${path.resolve(hostFolderPath)}:/app`],
      NanoCpus: Math.round(clamp(bot.cpu_limit, DEFAULT_CPU_LIMIT, MAX_CPU_LIMIT) * 1e9),
      Memory: clamp(bot.memory_limit_mb, DEFAULT_MEMORY_LIMIT_MB, MAX_MEMORY_LIMIT_MB) * 1024 * 1024,
      MemorySwap: clamp(bot.memory_limit_mb, DEFAULT_MEMORY_LIMIT_MB, MAX_MEMORY_LIMIT_MB) * 1024 * 1024,
      PidsLimit: 128,
      NetworkMode: 'bridge',
      RestartPolicy: restartPolicy,
      ReadonlyRootfs: false,
      SecurityOpt: ['no-new-privileges']
    },
    Env: env
  });

  await container.start();
  return { containerId: container.id, hookOutput: hookResult.output };
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

async function getContainerInfo(containerName) {
  try {
    const container = docker.getContainer(containerName);
    return await container.inspect();
  } catch (err) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

/** Single-shot CPU%/memory snapshot via Docker's stats endpoint (stream: false). */
async function getStats(containerName) {
  try {
    const container = docker.getContainer(containerName);
    const stats = await container.stats({ stream: false });

    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const onlineCpus = stats.cpu_stats.online_cpus || (stats.cpu_stats.cpu_usage.percpu_usage || []).length || 1;
    const cpuPercent = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * onlineCpus * 100 : 0;

    const memUsage = stats.memory_stats.usage || 0;
    const memLimit = stats.memory_stats.limit || 1;

    return {
      cpuPercent: Math.round(cpuPercent * 10) / 10,
      memoryUsedMb: Math.round((memUsage / (1024 * 1024)) * 10) / 10,
      memoryLimitMb: Math.round(memLimit / (1024 * 1024))
    };
  } catch (err) {
    if (err.statusCode === 404) return null;
    return null;
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

/** Attaches a live follow stream to a container's logs, invoking onData(text) per chunk. */
function streamLogs(containerName, onData) {
  const container = docker.getContainer(containerName);
  let destroyed = false;
  let logStream = null;

  container.logs(
    { stdout: true, stderr: true, follow: true, tail: 100, timestamps: true },
    (err, stream) => {
      if (err || !stream || destroyed) return;
      logStream = stream;
      stream.on('data', (chunk) => onData(demuxLogs(chunk)));
    }
  );

  return {
    destroy: () => {
      destroyed = true;
      if (logStream) logStream.destroy();
    }
  };
}

module.exports = {
  docker,
  MAX_CPU_LIMIT,
  MAX_MEMORY_LIMIT_MB,
  DEFAULT_CPU_LIMIT,
  DEFAULT_MEMORY_LIMIT_MB,
  startBotContainer,
  stopBotContainer,
  removeContainerIfExists,
  getContainerStatus,
  getContainerInfo,
  getStats,
  getLogs,
  streamLogs
};
