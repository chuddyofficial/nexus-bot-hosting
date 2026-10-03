/**
 * Nexus bot node - runs on the Linux machine that actually hosts bot files and
 * Docker containers. The panel (website, accounts, database) runs elsewhere and
 * talks to this process over HTTPS with a shared token:
 *
 *   /agent/*  - bot folder management + file manager (botnode/client.js proxies here)
 *   anything else - a filtered pass-through to the local Docker socket
 *                   (see dockerGuard.js) so the panel's dockerode calls work remotely
 *
 * It also runs the per-bot SFTP server, since that needs direct access to the files.
 *
 * Start with: node src/botnode/agent.js   (installer/linux/install-node.sh sets this up)
 */
require('dotenv').config();

process.on('unhandledRejection', (err) => console.error('[unhandled rejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaught exception]', err));

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { createFileRouter } = require('../services/fileRoutes');
const { safeJoin } = require('../services/pathSafety');
const { startSftpServer } = require('../sftp/sftpServer');
const { checkRequest, checkCreate, parseDockerUrl } = require('./dockerGuard');

const PORT = parseInt(process.env.AGENT_PORT || '8443', 10);
const TOKEN = (process.env.AGENT_TOKEN || '').trim();
const BOTS_DIR = path.resolve(process.env.BOTS_DIR || '/var/lib/nexus/bots');
const DATA_DIR = path.resolve(process.env.DATA_DIR || '/var/lib/nexus/data');
const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const TLS_CERT = process.env.AGENT_TLS_CERT;
const TLS_KEY = process.env.AGENT_TLS_KEY;
const SFTP_USERS_PATH = path.join(DATA_DIR, 'sftp-users.json');

if (TOKEN.length < 32) {
  console.error('AGENT_TOKEN must be set to a random string of at least 32 characters.');
  process.exit(1);
}
fs.mkdirSync(BOTS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const SEG_RE = /^[A-Za-z0-9-]{1,64}$/;

function isAuthorized(req) {
  const header = req.headers.authorization || '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const expected = Buffer.from(TOKEN);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function botRoot(userId, botId) {
  if (!SEG_RE.test(userId || '') || !SEG_RE.test(botId || '')) return null;
  return path.join(BOTS_DIR, userId, botId);
}

// --- SFTP logins, pushed from the panel (which owns the database) ---

let sftpUsers = new Map();
try {
  const list = JSON.parse(fs.readFileSync(SFTP_USERS_PATH, 'utf8'));
  sftpUsers = new Map(list.map((u) => [u.username, u]));
} catch { /* none yet */ }

// --- /agent API ---

const app = express();

app.get('/agent/info', (req, res) => {
  res.json({ botsDir: BOTS_DIR.replace(/\\/g, '/'), sftpUsers: sftpUsers.size });
});

app.put('/agent/sftp-users', express.json({ limit: '2mb' }), (req, res) => {
  const list = Array.isArray(req.body?.users) ? req.body.users : null;
  if (!list) return res.status(400).json({ error: 'users must be an array.' });
  const clean = list
    .filter((u) => u && typeof u.username === 'string' && typeof u.hash === 'string'
      && SEG_RE.test(u.userId || '') && SEG_RE.test(u.botId || ''))
    .map(({ username, hash, userId, botId }) => ({ username, hash, userId, botId }));
  sftpUsers = new Map(clean.map((u) => [u.username, u]));
  fs.writeFileSync(SFTP_USERS_PATH, JSON.stringify(clean), { mode: 0o600 });
  res.json({ ok: true, count: clean.length });
});

// Create a bot's folder, optionally seeding a starter entry file.
app.post('/agent/bots/:userId/:botId', express.json({ limit: '1mb' }), (req, res) => {
  const root = botRoot(req.params.userId, req.params.botId);
  if (!root) return res.status(400).json({ error: 'Invalid bot path.' });
  try {
    fs.mkdirSync(root, { recursive: true });
    const { entryFile, content } = req.body || {};
    if (entryFile) fs.writeFileSync(safeJoin(root, entryFile), content ?? '', 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/agent/bots/:userId/:botId', (req, res) => {
  const root = botRoot(req.params.userId, req.params.botId);
  if (!root) return res.status(400).json({ error: 'Invalid bot path.' });
  fs.rmSync(root, { recursive: true, force: true });
  res.json({ ok: true });
});

app.get('/agent/bots/:userId/:botId/exists', (req, res) => {
  const root = botRoot(req.params.userId, req.params.botId);
  if (!root) return res.status(400).json({ error: 'Invalid bot path.' });
  try {
    res.json({ exists: fs.existsSync(safeJoin(root, req.query.path)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.use('/agent/bots/:userId/:botId/files', createFileRouter((req, res) => {
  const root = botRoot(req.params.userId, req.params.botId);
  if (!root) {
    res.status(400).json({ error: 'Invalid bot path.' });
    return null;
  }
  // Bots created before this node existed have no folder yet - give them an empty one.
  fs.mkdirSync(root, { recursive: true });
  return { root, downloadName: req.query.name || 'bot' };
}));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Upload too large.' });
  res.status(500).json({ error: 'Internal error' });
});

// --- Filtered Docker API proxy ---

function forwardToDocker(req, res, bodyBuffer) {
  const headers = { ...req.headers, host: 'docker' };
  delete headers.authorization;
  if (bodyBuffer) {
    headers['content-length'] = bodyBuffer.length;
    delete headers['transfer-encoding'];
  }

  const upstream = http.request({ socketPath: DOCKER_SOCKET, path: req.url, method: req.method, headers }, (up) => {
    res.writeHead(up.statusCode, up.headers);
    up.pipe(res);
  });
  upstream.on('error', (err) => {
    if (!res.headersSent) sendJson(res, 502, { message: 'Docker is not reachable on the bot node: ' + err.message });
    else res.destroy();
  });
  res.on('close', () => {
    if (!res.writableFinished) upstream.destroy();
  });

  if (bodyBuffer) upstream.end(bodyBuffer);
  else req.pipe(upstream);
}

function proxyDocker(req, res) {
  const denied = checkRequest(req.method, req.url);
  if (denied) return sendJson(res, 403, { message: denied });

  if (parseDockerUrl(req.url).pathname !== '/containers/create') {
    return forwardToDocker(req, res, null);
  }

  // Container creation: buffer and inspect the spec before Docker sees it.
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > 1024 * 1024) {
      sendJson(res, 413, { message: 'Container spec too large.' });
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => {
    if (res.headersSent) return;
    const buffer = Buffer.concat(chunks);
    let spec;
    try {
      spec = JSON.parse(buffer.toString('utf8'));
    } catch {
      return sendJson(res, 400, { message: 'Invalid JSON container spec.' });
    }
    const err = checkCreate(req.url, spec, BOTS_DIR.replace(/\\/g, '/'));
    if (err) return sendJson(res, 403, { message: err });
    forwardToDocker(req, res, buffer);
  });
}

function handler(req, res) {
  if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized', message: 'Unauthorized' });
  if (req.url.startsWith('/agent/')) return app(req, res);
  return proxyDocker(req, res);
}

const server = TLS_CERT && TLS_KEY
  ? https.createServer({ cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) }, handler)
  : http.createServer(handler);

// Log/event streams are long-lived; don't let Node's defaults cut them off.
server.requestTimeout = 0;
server.headersTimeout = 60 * 1000;
server.keepAliveTimeout = 65 * 1000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Nexus bot node listening on port ${PORT} (${TLS_CERT && TLS_KEY ? 'https' : 'http - INSECURE, set AGENT_TLS_CERT/KEY'})`);
  console.log(`Bot files: ${BOTS_DIR}`);
});

startSftpServer({
  authenticate: async (username, password) => {
    const entry = sftpUsers.get(username);
    if (!entry || !(await bcrypt.compare(password, entry.hash))) return null;
    const root = botRoot(entry.userId, entry.botId);
    if (!root) return null;
    fs.mkdirSync(root, { recursive: true });
    return root;
  }
});
