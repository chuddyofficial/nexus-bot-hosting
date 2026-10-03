const http = require('http');
const https = require('https');

/**
 * Panel-side connection to a remote Linux "bot node" (botnode/agent.js).
 *
 * When BOT_NODE_URL is set, bot files, Docker containers and SFTP all live on
 * that node instead of this machine: Docker calls go through the node's
 * filtered Docker API proxy, and file-manager requests are forwarded to it.
 * When it's unset, everything runs locally exactly as before.
 */
const NODE_URL = (process.env.BOT_NODE_URL || '').trim().replace(/\/+$/, '');
const NODE_TOKEN = (process.env.BOT_NODE_TOKEN || '').trim();

const isRemote = !!NODE_URL;
const url = isRemote ? new URL(NODE_URL) : null;
const useTls = url ? url.protocol === 'https:' : false;

function decodeCa(value) {
  const v = (value || '').trim();
  if (!v) return undefined;
  if (v.includes('BEGIN CERTIFICATE')) return v.replace(/\\n/g, '\n');
  return Buffer.from(v, 'base64').toString('utf8');
}

if (isRemote) {
  if (!NODE_TOKEN) throw new Error('BOT_NODE_URL is set but BOT_NODE_TOKEN is empty.');
  if (useTls && !process.env.BOT_NODE_CA) {
    throw new Error('BOT_NODE_URL uses https but BOT_NODE_CA is empty (paste the value printed by the Linux node installer).');
  }
  if (!useTls) {
    console.warn('[bot-node] BOT_NODE_URL is plain http - BOT_NODE_TOKEN travels unencrypted. Only do this over a private network.');
  }
}

// The node's certificate is self-signed and pinned via BOT_NODE_CA, so only that
// exact certificate is trusted. The hostname check is skipped because the node
// is usually addressed by IP, and trust comes from the pin rather than the name.
const tlsOptions = useTls ? { ca: decodeCa(process.env.BOT_NODE_CA), checkServerIdentity: () => undefined } : {};
const agent = !isRemote ? null : useTls
  ? new https.Agent({ keepAlive: true, ...tlsOptions })
  : new http.Agent({ keepAlive: true });
const port = url ? (url.port || (useTls ? 443 : 80)) : null;

function authHeaders() {
  return { Authorization: `Bearer ${NODE_TOKEN}` };
}

/** Connection options for dockerode, pointed at the node's Docker proxy. */
function dockerOptions() {
  return {
    protocol: useTls ? 'https' : 'http',
    host: url.hostname,
    port,
    headers: authHeaders(),
    agent,
    ...tlsOptions
  };
}

function rawRequest(method, path, headers = {}) {
  return (useTls ? https : http).request({
    hostname: url.hostname,
    port,
    path,
    method,
    agent,
    headers: { ...headers, ...authHeaders() }
  });
}

/** JSON request to the node's /agent API. Rejects with the node's error message on non-2xx. */
function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = rawRequest(method, path, payload
      ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
      : {});
    req.setTimeout(30000, () => req.destroy(new Error('request timed out')));
    req.on('response', (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { error: text };
        }
        if (res.statusCode >= 400) {
          const err = new Error(data.error || `Bot node responded with ${res.statusCode}`);
          err.statusCode = res.statusCode;
          return reject(err);
        }
        resolve(data);
      });
    });
    req.on('error', (err) => reject(new Error(`Could not reach the bot node: ${err.message}`)));
    req.end(payload || undefined);
  });
}

let infoPromise = null;
/** Node's static info ({ botsDir }), cached after the first successful call. */
function getInfo() {
  if (!infoPromise) {
    infoPromise = call('GET', '/agent/info').catch((err) => {
      infoPromise = null;
      throw err;
    });
  }
  return infoPromise;
}

function botPath(userId, botId) {
  return `/agent/bots/${encodeURIComponent(userId)}/${encodeURIComponent(botId)}`;
}

/**
 * Streams an incoming Express request through to the node and the node's
 * response back to the client. Bodies already parsed by express.json() are
 * re-serialized; anything else (multipart uploads) is piped through untouched.
 */
function proxyRequest(req, res, targetPath) {
  const headers = {};
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];

  let body = null;
  if (req._body) {
    body = Buffer.from(JSON.stringify(req.body ?? {}));
    headers['content-type'] = 'application/json';
    headers['content-length'] = body.length;
  } else if (req.headers['content-length']) {
    headers['content-length'] = req.headers['content-length'];
  } else if (req.headers['transfer-encoding']) {
    headers['transfer-encoding'] = req.headers['transfer-encoding'];
  }

  const upstream = rawRequest(req.method, targetPath, headers);
  upstream.on('response', (up) => {
    const out = {};
    for (const h of ['content-type', 'content-length', 'content-disposition']) {
      if (up.headers[h]) out[h] = up.headers[h];
    }
    res.writeHead(up.statusCode, out);
    up.pipe(res);
  });
  upstream.on('error', (err) => {
    if (!res.headersSent) res.status(502).json({ error: 'Could not reach the bot node: ' + err.message });
    else res.destroy();
  });
  res.on('close', () => {
    if (!res.writableFinished) upstream.destroy();
  });

  if (body) upstream.end(body);
  else req.pipe(upstream);
}

module.exports = {
  isRemote,
  nodeHost: url ? url.host : null,
  dockerOptions,
  call,
  getInfo,
  botPath,
  proxyRequest
};
