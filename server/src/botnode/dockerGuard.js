const path = require('path');
const { IMAGES } = require('../docker/images');

/**
 * Allowlist for Docker API calls proxied through the bot node. Raw Docker API
 * access is root-equivalent on the host, so even a holder of the node token can
 * only touch nexus-bot-* containers, pull the bot runtime images, and create
 * containers shaped exactly like the panel's own (bind-mounting only a bot
 * folder under BOTS_DIR, no privileged flags, no extra mounts/devices/caps).
 */

const ALLOWED_IMAGES = new Set(Object.values(IMAGES));
const SEG = '[A-Za-z0-9-]{1,64}';
const CONTAINER = `nexus-bot-${SEG}`;

const RULES = [
  ['GET', /^\/_ping$/],
  ['HEAD', /^\/_ping$/],
  ['GET', /^\/version$/],
  ['GET', /^\/images\/json$/],
  ['POST', /^\/images\/create$/],
  ['GET', /^\/events$/],
  ['POST', /^\/containers\/create$/],
  ['GET', new RegExp(`^/containers/${CONTAINER}/(json|logs|stats)$`)],
  ['POST', new RegExp(`^/containers/${CONTAINER}/(start|stop|wait|kill|restart)$`)],
  ['DELETE', new RegExp(`^/containers/${CONTAINER}$`)]
];

const ALLOWED_CREATE_KEYS = new Set(['name', 'Image', 'Cmd', 'WorkingDir', 'Tty', 'HostConfig', 'Env']);
const ALLOWED_HOSTCONFIG_KEYS = new Set([
  'Binds', 'NanoCpus', 'Memory', 'MemorySwap', 'PidsLimit', 'NetworkMode',
  'RestartPolicy', 'ReadonlyRootfs', 'SecurityOpt'
]);
const ALLOWED_RESTART = new Set(['no', 'on-failure', 'unless-stopped', '']);

/** Splits a proxied URL into its version-less path and query. */
function parseDockerUrl(rawUrl) {
  const u = new URL(rawUrl, 'http://docker');
  return { pathname: u.pathname.replace(/^\/v\d+(\.\d+)?(?=\/)/, ''), query: u.searchParams };
}

/** Returns an error string if the method/path isn't allowed, else null. */
function checkRequest(method, rawUrl) {
  const { pathname, query } = parseDockerUrl(rawUrl);
  if (!RULES.some(([m, re]) => m === method && re.test(pathname))) {
    return `Docker call not allowed through the bot node: ${method} ${pathname}`;
  }
  if (pathname === '/images/create') {
    const from = query.get('fromImage') || '';
    const ref = from.includes(':') ? from : `${from}:${query.get('tag') || 'latest'}`;
    if (!ALLOWED_IMAGES.has(ref)) return `Image not allowed: ${ref}`;
  }
  return null;
}

function isPositiveNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** Validates a /containers/create request. Returns an error string, or null if OK. */
function checkCreate(rawUrl, body, botsDir) {
  const { query } = parseDockerUrl(rawUrl);
  const name = query.get('name') || '';
  const match = /^nexus-bot-([A-Za-z0-9-]{1,64}?)(-prestart)?$/.exec(name);
  if (!match) return 'Container name must be nexus-bot-<botId>.';
  const botId = match[1];

  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid container spec.';
  for (const key of Object.keys(body)) {
    if (!ALLOWED_CREATE_KEYS.has(key)) return `Container option not allowed: ${key}`;
  }
  if (body.name !== undefined && body.name !== name) return 'Container name mismatch.';
  if (!ALLOWED_IMAGES.has(body.Image)) return `Image not allowed: ${body.Image}`;
  if (body.WorkingDir !== '/app') return 'WorkingDir must be /app.';
  if (!Array.isArray(body.Cmd) || !body.Cmd.every((c) => typeof c === 'string')) return 'Cmd must be a list of strings.';
  if (body.Env !== undefined && (!Array.isArray(body.Env) || !body.Env.every((e) => typeof e === 'string'))) {
    return 'Env must be a list of strings.';
  }

  const hc = body.HostConfig;
  if (!hc || typeof hc !== 'object') return 'HostConfig is required.';
  for (const key of Object.keys(hc)) {
    if (!ALLOWED_HOSTCONFIG_KEYS.has(key)) return `HostConfig option not allowed: ${key}`;
  }

  // Exactly one bind: <BOTS_DIR>/<userId>/<thisBotId>:/app
  if (!Array.isArray(hc.Binds) || hc.Binds.length !== 1 || typeof hc.Binds[0] !== 'string') {
    return 'Exactly one bind mount is required.';
  }
  const bindRe = new RegExp(`^(.+)/(${SEG})/(${SEG}):/app$`);
  const bind = bindRe.exec(hc.Binds[0]);
  if (!bind || path.posix.normalize(bind[1]) !== path.posix.normalize(botsDir) || bind[3] !== botId) {
    return 'Bind mount must be this bot\'s own folder.';
  }

  if (hc.NetworkMode !== 'bridge') return 'NetworkMode must be bridge.';
  if (!Array.isArray(hc.SecurityOpt) || hc.SecurityOpt.length !== 1 || hc.SecurityOpt[0] !== 'no-new-privileges') {
    return 'SecurityOpt must be [no-new-privileges].';
  }
  for (const key of ['NanoCpus', 'Memory', 'PidsLimit']) {
    if (!isPositiveNumber(hc[key])) return `${key} must be a positive number.`;
  }
  if (hc.MemorySwap !== undefined && !isPositiveNumber(hc.MemorySwap)) return 'MemorySwap must be a positive number.';
  if (hc.PidsLimit > 4096) return 'PidsLimit too high.';
  if (hc.RestartPolicy !== undefined && !ALLOWED_RESTART.has(hc.RestartPolicy?.Name)) return 'RestartPolicy not allowed.';
  if (hc.ReadonlyRootfs !== undefined && typeof hc.ReadonlyRootfs !== 'boolean') return 'ReadonlyRootfs must be boolean.';

  return null;
}

module.exports = { checkRequest, checkCreate, parseDockerUrl };
