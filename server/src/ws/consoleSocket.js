const { WebSocketServer } = require('ws');
const { URL } = require('url');
const { verifyToken } = require('../services/authService');
const User = require('../models/User');
const Bot = require('../models/Bot');
const dockerService = require('../docker/dockerService');

/**
 * Attaches a live-console WebSocket endpoint at /ws/console to the given HTTP server.
 * Clients connect with ?token=<jwt>&botId=<id>; the server verifies ownership (or
 * admin) before streaming that bot's Docker container logs in real time.
 */
function attachConsoleSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname !== '/ws/console') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const token = searchParams.get('token');
    const botId = searchParams.get('botId');

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      ws.close(4001, 'Invalid or expired token');
      return;
    }

    const user = User.getUserById(payload.sub);
    if (!user || user.disabled) {
      ws.close(4001, 'Not authenticated');
      return;
    }

    const bot = user.is_admin ? Bot.getById(botId) : Bot.getByIdForUser(botId, user.id);
    if (!bot) {
      ws.close(4004, 'Bot not found');
      return;
    }

    let stream = null;
    let closed = false;

    ws.send(JSON.stringify({ type: 'connected', botId: bot.id }));

    dockerService.getLogs(bot.container_name, 200)
      .then((backlog) => {
        if (closed) return;
        if (backlog) ws.send(JSON.stringify({ type: 'log', data: backlog }));
        if (closed) return;
        stream = dockerService.streamLogs(bot.container_name, (chunk) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'log', data: chunk }));
          }
        });
      })
      .catch(() => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'Could not attach to container logs.' }));
        }
      });

    const statusInterval = setInterval(async () => {
      try {
        const status = await dockerService.getContainerStatus(bot.container_name);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'status', status }));
        }
      } catch { /* ignore transient errors */ }
    }, 5000);

    ws.on('close', () => {
      closed = true;
      clearInterval(statusInterval);
      if (stream) stream.destroy();
    });

    ws.on('error', () => {
      closed = true;
      clearInterval(statusInterval);
      if (stream) stream.destroy();
    });
  });

  return wss;
}

module.exports = { attachConsoleSocket };
