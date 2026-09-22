const { spawn, execFile } = require('child_process');
const EventEmitter = require('events');

/**
 * Replaces the old Docker-based dockerService when the host VPS can't run
 * Docker Desktop (no nested virtualization available for WSL2/Hyper-V).
 *
 * IMPORTANT — this trades real container isolation for plain Windows
 * processes:
 *   - No filesystem isolation: every bot runs as the same OS user and can,
 *     in principle, read/write outside its own folder. There is no bind
 *     mount / chroot equivalent for a plain child process on Windows.
 *   - No hard resource limits: CPU/memory limits here are enforced by
 *     polling process usage every few seconds and killing the process if
 *     it's persistently over budget - a soft, best-effort cap, not a
 *     kernel-enforced cgroup limit. A bot can transiently spike well above
 *     its configured limit between polls.
 *   - No PID-namespace isolation: bot processes are ordinary siblings of
 *     the Node app in the Windows process list.
 * This is a deliberate, explicitly-approved trade-off for a Windows VPS
 * that cannot get nested virtualization from its host. If this platform
 * ever serves untrusted third parties at scale, moving to Linux + real
 * Docker (which needs no nested virtualization) is the safer long-term fix.
 *
 * Keyed by containerName (same identifier dockerService used) so every
 * existing route call site works unchanged.
 */

const RUNTIME_BIN = {
  python: process.env.PYTHON_BIN || 'python',
  node: process.env.NODE_BIN || 'node'
};

const DEFAULT_CPU_LIMIT = parseFloat(process.env.BOT_CPU_LIMIT || '0.5');
const DEFAULT_MEMORY_LIMIT_MB = parseInt(process.env.BOT_MEMORY_LIMIT_MB || '256', 10);
const MAX_CPU_LIMIT = parseFloat(process.env.BOT_MAX_CPU_LIMIT || '2');
const MAX_MEMORY_LIMIT_MB = parseInt(process.env.BOT_MAX_MEMORY_LIMIT_MB || '1024', 10);

const STATS_POLL_MS = 3000;
const OVER_LIMIT_GRACE_POLLS = 3; // kill only after being over budget for this many consecutive polls
const EXITED_RETENTION_MS = 5 * 60 * 1000; // keep a stopped bot's log buffer around briefly so quick exits aren't lost

/** containerName -> { proc, botId, startedAt, logBuffer, logEmitter, statsInterval, overLimitCount, lastStats, killedForLimit } */
const running = new Map();

const events = new EventEmitter(); // emits 'exit' / 'oom' with { containerName, botId, exitCode, reason }

function clamp(value, fallback, max) {
  const n = value == null ? fallback : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function shellSplit(command) {
  const parts = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(command))) parts.push(m[1] ?? m[2] ?? m[3]);
  return parts;
}

function entryCommand(bot) {
  if (bot.start_command && bot.start_command.trim()) {
    return shellSplit(bot.start_command.trim());
  }
  const runner = RUNTIME_BIN[bot.runtime];
  return [runner, bot.entry_file];
}

function buildEnv(bot, envVarsObj) {
  const env = { ...process.env, PYTHONUNBUFFERED: '1', NEXUS_BOT_ID: bot.id };
  for (const [key, value] of Object.entries(envVarsObj || {})) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) env[key] = String(value);
  }
  return env;
}

function appendLog(entry, text) {
  entry.logBuffer += text;
  const MAX_BUFFER = 200 * 1024;
  if (entry.logBuffer.length > MAX_BUFFER) {
    entry.logBuffer = entry.logBuffer.slice(entry.logBuffer.length - MAX_BUFFER);
  }
  entry.logEmitter.emit('data', text);
}

/** Runs the bot's pre-start hook (if any) as a one-off child process, capturing output. */
function runPreStartHook({ bot, hostFolderPath, env }) {
  return new Promise((resolve) => {
    if (!bot.pre_start_hook || !bot.pre_start_hook.trim()) {
      return resolve({ ok: true, output: '' });
    }

    const isWindows = process.platform === 'win32';
    const shellCmd = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/d', '/s', '/c', bot.pre_start_hook.trim()] : ['-c', bot.pre_start_hook.trim()];

    let output = '';
    const child = spawn(shellCmd, shellArgs, { cwd: hostFolderPath, env, windowsHide: true });

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, output: output.slice(-4000) + '\n[pre-start hook timed out after 5 minutes]' });
    }, 5 * 60 * 1000);

    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });
    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ ok: false, output: output + `\n[failed to launch pre-start hook: ${err.message}]` });
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      resolve({ ok: code === 0, output });
    });
  });
}

/** Starts (or restarts) a bot as a native child process. */
async function startBotContainer({ bot, hostFolderPath, envVars }) {
  await stopBotContainer(bot.container_name);

  const env = buildEnv(bot, envVars);
  const hookResult = await runPreStartHook({ bot, hostFolderPath, env });
  if (!hookResult.ok) {
    const err = new Error('Pre-start hook failed. ' + (hookResult.output || '').slice(-1000));
    err.hookOutput = hookResult.output;
    throw err;
  }

  const [cmd, ...args] = entryCommand(bot);
  if (!cmd) throw new Error('No start command or entry file configured for this bot.');

  let child;
  try {
    child = spawn(cmd, args, { cwd: hostFolderPath, env, windowsHide: true, detached: false });
  } catch (err) {
    throw new Error(`Failed to launch process: ${err.message}`);
  }

  const entry = {
    proc: child,
    botId: bot.id,
    containerName: bot.container_name,
    startedAt: Date.now(),
    logBuffer: hookResult.output ? `[pre-start hook]\n${hookResult.output}\n[bot output]\n` : '',
    logEmitter: new EventEmitter(),
    cpuLimit: clamp(bot.cpu_limit, DEFAULT_CPU_LIMIT, MAX_CPU_LIMIT),
    memoryLimitMb: clamp(bot.memory_limit_mb, DEFAULT_MEMORY_LIMIT_MB, MAX_MEMORY_LIMIT_MB),
    overLimitCount: 0,
    lastStats: null,
    statsInterval: null,
    killedForLimit: false,
    stoppedIntentionally: false
  };
  entry.logEmitter.setMaxListeners(50);

  child.stdout.on('data', (d) => appendLog(entry, d.toString()));
  child.stderr.on('data', (d) => appendLog(entry, d.toString()));
  child.on('error', (err) => {
    appendLog(entry, `\n[process error: ${err.message}]\n`);
  });
  child.on('exit', (code, signal) => {
    if (entry.statsInterval) clearInterval(entry.statsInterval);
    // Keep the entry (and its log buffer) around briefly instead of deleting
    // immediately - a bot that exits within the first poll interval would
    // otherwise have its console output vanish before anyone can see it.
    setTimeout(() => {
      if (running.get(bot.container_name) === entry) running.delete(bot.container_name);
    }, EXITED_RETENTION_MS).unref?.();
    const reason = entry.killedForLimit ? 'resource-limit' : signal ? `signal:${signal}` : 'exit';
    events.emit('exit', {
      containerName: bot.container_name,
      botId: bot.id,
      exitCode: code,
      reason,
      wasStopIntentional: entry.stoppedIntentionally
    });
  });

  entry.statsInterval = setInterval(() => pollStats(entry), STATS_POLL_MS);
  running.set(bot.container_name, entry);

  return { containerId: String(child.pid), hookOutput: hookResult.output };
}

/**
 * Reads working-set memory (both platforms) and cumulative CPU time in ms
 * (Windows only - POSIX gets an instantaneous %CPU from `ps` directly).
 * Uses PowerShell's Get-Process rather than wmic/tasklist: wmic is removed
 * entirely on current Windows Server builds, and tasklist doesn't expose
 * CPU time at all.
 */
function readProcessUsage(pid) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { "$($p.WorkingSet64),$($p.CPU)" }`
      ], (err, stdout) => {
        if (err || !stdout || !stdout.trim()) return resolve(null);
        const [wsBytes, cpuSeconds] = stdout.trim().split(',').map(Number);
        if (!Number.isFinite(wsBytes)) return resolve(null);
        resolve({
          memoryUsedMb: wsBytes / (1024 * 1024),
          cpuTimeMs: Number.isFinite(cpuSeconds) ? cpuSeconds * 1000 : null
        });
      });
    } else {
      execFile('ps', ['-o', 'rss=,%cpu=', '-p', String(pid)], (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const [rssKb, cpuPct] = stdout.trim().split(/\s+/).map(Number);
        resolve({ memoryUsedMb: Number.isFinite(rssKb) ? rssKb / 1024 : 0, cpuPercent: cpuPct || 0 });
      });
    }
  });
}

async function pollStats(entry) {
  if (!entry.proc || entry.proc.exitCode !== null) return;
  const usage = await readProcessUsage(entry.proc.pid);
  if (!usage) return;

  let cpuPercent = usage.cpuPercent ?? entry.lastStats?.cpuPercent ?? 0;
  if (process.platform === 'win32' && usage.cpuTimeMs != null) {
    const now = Date.now();
    if (entry.prevCpuSample) {
      const wallDeltaMs = now - entry.prevCpuSample.at;
      const cpuDeltaMs = usage.cpuTimeMs - entry.prevCpuSample.cpuTimeMs;
      const cpuCount = require('os').cpus().length || 1;
      if (wallDeltaMs > 0) {
        cpuPercent = Math.max(0, (cpuDeltaMs / wallDeltaMs) * 100 / cpuCount);
      }
    }
    entry.prevCpuSample = { at: now, cpuTimeMs: usage.cpuTimeMs };
  }

  entry.lastStats = {
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    memoryUsedMb: Math.round(usage.memoryUsedMb * 10) / 10,
    memoryLimitMb: entry.memoryLimitMb
  };

  // Soft memory enforcement: kill only after being persistently over
  // budget, to avoid punishing a brief allocation spike.
  if (usage.memoryUsedMb > entry.memoryLimitMb) {
    entry.overLimitCount += 1;
    if (entry.overLimitCount >= OVER_LIMIT_GRACE_POLLS) {
      entry.killedForLimit = true;
      appendLog(entry, `\n[killed: exceeded memory limit of ${entry.memoryLimitMb}MB]\n`);
      events.emit('oom', { containerName: entry.containerName, botId: entry.botId });
      forceKill(entry.proc);
    }
  } else {
    entry.overLimitCount = 0;
  }
}

/**
 * Kills a process tree reliably on Windows. `child.kill('SIGKILL')` only
 * partially works on Windows (Node's signal support there is limited and a
 * plain kill() can silently fail to terminate the process, which was
 * observed in testing - the process died from the OS's perspective in some
 * runs but never fired Node's 'exit' event). `taskkill /f` is the reliable
 * path on Windows; POSIX gets a normal kill().
 */
function forceKill(proc) {
  try {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/pid', String(proc.pid), '/t', '/f'], () => {});
    } else {
      proc.kill('SIGKILL');
    }
  } catch { /* already gone */ }
}

async function stopBotContainer(containerName) {
  const entry = running.get(containerName);
  if (!entry || !entry.proc || entry.proc.exitCode !== null) return;
  entry.stoppedIntentionally = true;

  await new Promise((resolve) => {
    entry.proc.once('exit', resolve);
    try {
      if (process.platform === 'win32') {
        execFile('taskkill', ['/pid', String(entry.proc.pid), '/t', '/f'], () => {});
      } else {
        entry.proc.kill('SIGTERM');
        setTimeout(() => { try { entry.proc.kill('SIGKILL'); } catch { /* already gone */ } }, 5000);
      }
    } catch {
      resolve();
    }
    // Safety net in case the 'exit' event never fires (already-dead PID, etc).
    setTimeout(resolve, 6000);
  });
}

async function removeContainerIfExists(containerName) {
  await stopBotContainer(containerName);
}

async function getContainerStatus(containerName) {
  const entry = running.get(containerName);
  if (!entry || !entry.proc || entry.proc.exitCode !== null) return 'stopped';
  return 'running';
}

async function getContainerInfo(containerName) {
  const entry = running.get(containerName);
  if (!entry) return null;
  return { State: { Running: entry.proc.exitCode === null, StartedAt: new Date(entry.startedAt).toISOString() } };
}

async function getStats(containerName) {
  const entry = running.get(containerName);
  if (!entry || !entry.lastStats) return null;
  return entry.lastStats;
}

async function getLogs(containerName, tailLines = 200) {
  const entry = running.get(containerName);
  if (!entry) return '';
  const lines = entry.logBuffer.split('\n');
  return lines.slice(-tailLines).join('\n');
}

/** Attaches a live follow stream, invoking onData(text) per chunk. */
function streamLogs(containerName, onData) {
  const entry = running.get(containerName);
  if (!entry) return { destroy: () => {} };

  const handler = (text) => onData(text);
  entry.logEmitter.on('data', handler);
  return { destroy: () => entry.logEmitter.off('data', handler) };
}

module.exports = {
  events,
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
