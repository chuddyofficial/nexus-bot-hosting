const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const multer = require('multer');
const yauzl = require('yauzl');
const archiver = require('archiver');
const { safeJoin } = require('./pathSafety');

const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '200', 10);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 500 }
});

// Extensions we will never allow to be written/uploaded (execution risk beyond the sandbox scope).
const BLOCKED_EXTENSIONS = new Set(['.exe', '.dll', '.bat', '.cmd', '.ps1', '.msi', '.sys', '.scr']);

function assertAllowedFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error(`Files with extension "${ext}" are not allowed.`);
  }
}

/**
 * Builds the file-manager routes (tree, read/write, create, rename, delete,
 * upload, zip extract, download) for a single bot folder. resolveBot(req, res)
 * returns { root, downloadName } for the request's bot, or sends an error
 * response itself and returns null. Used directly by the panel when bots run
 * locally, and by the Linux bot node (botnode/agent.js) when they run remotely.
 */
function createFileRouter(resolveBot) {
  const router = express.Router({ mergeParams: true });

  // --- List directory tree ---
  router.get('/tree', async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;

    async function walk(dir, relBase) {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      const result = [];
      for (const entry of entries) {
        const rel = path.join(relBase, entry.name).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          result.push({ type: 'dir', name: entry.name, path: rel, children: await walk(path.join(dir, entry.name), rel) });
        } else {
          const stat = await fsp.stat(path.join(dir, entry.name));
          result.push({ type: 'file', name: entry.name, path: rel, size: stat.size });
        }
      }
      return result.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    }

    try {
      const tree = await walk(bot.root, '');
      res.json({ tree });
    } catch (err) {
      res.status(500).json({ error: 'Failed to read file tree.' });
    }
  });

  // --- Read a file's contents (text) ---
  router.get('/file', async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;

    try {
      const target = safeJoin(bot.root, req.query.path);
      const stat = await fsp.stat(target);
      if (!stat.isFile()) return res.status(400).json({ error: 'Not a file.' });
      if (stat.size > 5 * 1024 * 1024) return res.status(413).json({ error: 'File too large to edit in browser (5MB limit).' });

      const content = await fsp.readFile(target, 'utf8');
      res.json({ content, size: stat.size });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Write/save a file's contents (text) ---
  router.put('/file', express.json({ limit: '10mb' }), async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;

    try {
      const { path: relPath, content } = req.body || {};
      assertAllowedFile(relPath);
      const target = safeJoin(bot.root, relPath);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, content ?? '', 'utf8');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Create a new file or folder ---
  router.post('/create', express.json(), async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;

    try {
      const { path: relPath, type } = req.body || {};
      if (type === 'dir') {
        const target = safeJoin(bot.root, relPath);
        await fsp.mkdir(target, { recursive: true });
      } else {
        assertAllowedFile(relPath);
        const target = safeJoin(bot.root, relPath);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        if (fs.existsSync(target)) return res.status(409).json({ error: 'File already exists.' });
        await fsp.writeFile(target, '', 'utf8');
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Rename / move a file or folder ---
  router.post('/rename', express.json(), async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;

    try {
      const { fromPath, toPath } = req.body || {};
      assertAllowedFile(toPath);
      const from = safeJoin(bot.root, fromPath);
      const to = safeJoin(bot.root, toPath);
      await fsp.mkdir(path.dirname(to), { recursive: true });
      await fsp.rename(from, to);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Delete a file or folder ---
  router.delete('/file', express.json(), async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;

    try {
      const relPath = req.body?.path ?? req.query.path;
      const target = safeJoin(bot.root, relPath);
      if (target === path.resolve(bot.root)) {
        return res.status(400).json({ error: 'Cannot delete the bot root folder.' });
      }
      await fsp.rm(target, { recursive: true, force: true });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Upload one or more files (including .zip) into a target directory ---
  // Supports drag-and-drop folder uploads: pass a JSON array in req.body.relativePaths
  // (same order as the files field) to preserve subfolder structure; otherwise files
  // are flattened into the target directory using their bare filename.
  router.post('/upload', upload.array('files', 500), async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;

    try {
      const basePath = req.body.path || '';
      let relativePaths = null;
      if (req.body.relativePaths) {
        try {
          relativePaths = JSON.parse(req.body.relativePaths);
        } catch {
          return res.status(400).json({ error: 'Invalid relativePaths.' });
        }
      }

      const saved = [];
      for (let i = 0; i < (req.files || []).length; i++) {
        const file = req.files[i];
        const relPath = relativePaths && relativePaths[i] ? relativePaths[i] : file.originalname;
        const cleanRel = String(relPath).replace(/\\/g, '/').replace(/^\/+/, '');
        const filename = path.basename(cleanRel);
        const subDir = path.dirname(cleanRel);

        const ext = path.extname(filename).toLowerCase();
        if (ext !== '.zip') assertAllowedFile(filename);

        const targetDir = subDir && subDir !== '.'
          ? safeJoin(bot.root, path.join(basePath, subDir))
          : safeJoin(bot.root, basePath);
        await fsp.mkdir(targetDir, { recursive: true });

        const dest = path.join(targetDir, filename);
        await fsp.writeFile(dest, file.buffer);
        saved.push(cleanRel);
      }
      res.json({ ok: true, saved });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Extract a .zip already on disk into a sibling folder (or in place) ---
  router.post('/extract', express.json(), async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;

    try {
      const zipPath = safeJoin(bot.root, req.body.path);
      if (path.extname(zipPath).toLowerCase() !== '.zip') {
        return res.status(400).json({ error: 'Not a zip file.' });
      }
      const destDir = req.body.destPath
        ? safeJoin(bot.root, req.body.destPath)
        : path.join(path.dirname(zipPath), path.basename(zipPath, '.zip'));

      await extractZip(zipPath, destDir, bot.root);
      res.json({ ok: true, extractedTo: path.relative(bot.root, destDir).replace(/\\/g, '/') });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Download the whole bot folder as a zip ---
  router.get('/download', (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;

    res.attachment(`${String(bot.downloadName || 'bot').replace(/[^a-z0-9_-]+/gi, '_')}.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => res.status(500).end(err.message));
    archive.pipe(res);
    archive.directory(bot.root, false);
    archive.finalize();
  });

  return router;
}

function extractZip(zipPath, destDir, botRoot) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        try {
          // Guard against zip-slip: re-validate every entry path against the bot root.
          const entryTarget = safeJoin(botRoot, path.join(path.relative(botRoot, destDir), entry.fileName));
          if (/\/$/.test(entry.fileName)) {
            fs.mkdirSync(entryTarget, { recursive: true });
            zipfile.readEntry();
          } else {
            const ext = path.extname(entry.fileName).toLowerCase();
            if (BLOCKED_EXTENSIONS.has(ext)) {
              zipfile.readEntry();
              return;
            }
            fs.mkdirSync(path.dirname(entryTarget), { recursive: true });
            zipfile.openReadStream(entry, (err2, readStream) => {
              if (err2) return reject(err2);
              const writeStream = fs.createWriteStream(entryTarget);
              readStream.pipe(writeStream);
              writeStream.on('finish', () => zipfile.readEntry());
              writeStream.on('error', reject);
            });
          }
        } catch (e) {
          reject(e);
        }
      });
      zipfile.on('end', resolve);
      zipfile.on('error', reject);
    });
  });
}

module.exports = { createFileRouter };
