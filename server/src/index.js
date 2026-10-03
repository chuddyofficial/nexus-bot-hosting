require('dotenv').config();

// A single request's failure must never take down the whole process - every
// other user's connections would drop with it. Log loudly and keep running;
// the failing request itself still gets a proper error response from Express's
// own error handler when the rejection originated inside a route.
process.on('unhandledRejection', (err) => {
  console.error('[unhandled rejection]', err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaught exception]', err);
});

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const botRoutes = require('./routes/bots');
const fileRoutes = require('./routes/files');
const adminRoutes = require('./routes/admin');
const { startSftpServer } = require('./sftp/sftpServer');
const { attachConsoleSocket } = require('./ws/consoleSocket');
const { runAutoStart } = require('./services/autoStart');
const { watchContainerEvents } = require('./services/containerEvents');
const storage = require('./services/botStorage');
const botNode = require('./botnode/client');
const Bot = require('./models/Bot');

const app = express();
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false // frontend is served separately / via CDN assets for Monaco
}));

const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin, credentials: true }));

app.use(express.json({ limit: '2mb' }));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'nexus-bot-hosting' }));

app.use('/api/auth', authRoutes);
app.use('/api/bots', botRoutes);
app.use('/api/bots', fileRoutes);
app.use('/api/admin', adminRoutes);

// Serve the built React client (production) if present, with SPA fallback for client-side routes.
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Upload too large.' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
const httpServer = http.createServer(app);
attachConsoleSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Nexus Bot Hosting API listening on port ${PORT}`);
});

if (storage.isRemote) {
  // Bots, Docker and SFTP live on the Linux bot node. Its SFTP server checks
  // logins against hashes pushed from here; resync periodically so a node
  // restart or a missed push heals itself.
  console.log(`Bots run on remote bot node ${botNode.nodeHost}`);
  const sync = () => storage.syncSftpUsers().catch((err) => console.error('[sftp-sync]', err.message));
  sync();
  setInterval(sync, 5 * 60 * 1000);
} else {
  startSftpServer({
    authenticate: (username, password) => {
      const bot = Bot.getBySftpUsername(username);
      return bot && Bot.verifySftpPassword(bot, password) ? bot.folder_path : null;
    }
  });
}
watchContainerEvents();
runAutoStart().catch((err) => console.error('[auto-start] unexpected error:', err));
