const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const multer = require('multer');
const yauzl = require('yauzl');
const archiver = require('archiver');
const Bot = require('../models/Bot');
const requireAuth = require('../middleware/requireAuth');
const { safeJoin } = require('../services/pathSafety');

const router = express.Router();
router.use(requireAuth);

const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '200', 10);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 500 }
});

// Extensions we will never allow to be written/uploaded (execution risk beyond the sandbox scope).
const BLOCKED_EXTENSIONS = new Set(['.exe', '.dll', '.bat', '.cmd', '.ps1', '.msi', '.sys', '.scr']);

function getBotOr404(req, res) {
  const bot = Bot.getByIdForUser(req.params.id, req.user.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return null;
  }
  return bot;
}

function assertAllowedFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error(`Files with extension "${ext}" are not allowed.`);
  }
}

// --- List directory tree ---
router.get('/:id/tree', async (req, res) => {
  const bot = getBotOr404(req, res);
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
    const tree = await walk(bot.folder_path, '');
    res.json({ tree });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read file tree.' });
  }
});

// --- Read a file's contents (text) ---
router.get('/:id/file', async (req, res) => {
  const bot = getBotOr404(req, res);
  if (!bot) return;

  try {
    const target = safeJoin(bot.folder_path, req.query.path);
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
router.put('/:id/file', express.json({ limit: '10mb' }), async (req, res) => {
  const bot = getBotOr404(req, res);
  if (!bot) return;

  try {
    const { path: relPath, content } = req.body || {};
    assertAllowedFile(relPath);
    const target = safeJoin(bot.folder_path, relPath);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, content ?? '', 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Create a new file or folder ---
router.post('/:id/create', express.json(), async (req, res) => {
  const bot = getBotOr404(req, res);
  if (!bot) return;

  try {
    const { path: relPath, type } = req.body || {};
    if (type === 'dir') {
      const target = safeJoin(bot.folder_path, relPath);
      await fsp.mkdir(target, { recursive: true });
    } else {
      assertAllowedFile(relPath);
      const target = safeJoin(bot.folder_path, relPath);
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
router.post('/:id/rename', express.json(), async (req, res) => {
  const bot = getBotOr404(req, res);
  if (!bot) return;

  try {
    const { fromPath, toPath } = req.body || {};
    assertAllowedFile(toPath);
    const from = safeJoin(bot.folder_path, fromPath);
    const to = safeJoin(bot.folder_path, toPath);
    await fsp.mkdir(path.dirname(to), { recursive: true });
    await fsp.rename(from, to);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Delete a file or folder ---
router.delete('/:id/file', express.json(), async (req, res) => {
  const bot = getBotOr404(req, res);
  if (!bot) return;

  try {
    const relPath = req.body?.path ?? req.query.path;
    const target = safeJoin(bot.folder_path, relPath);
    if (target === path.resolve(bot.folder_path)) {
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
router.post('/:id/upload', upload.array('files', 500), async (req, res) => {
  const bot = getBotOr404(req, res);
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
        ? safeJoin(bot.folder_path, path.join(basePath, subDir))
        : safeJoin(bot.folder_path, basePath);
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
router.post('/:id/extract', express.json(), async (req, res) => {
  const bot = getBotOr404(req, res);
  if (!bot) return;

  try {
    const zipPath = safeJoin(bot.folder_path, req.body.path);
    if (path.extname(zipPath).toLowerCase() !== '.zip') {
      return res.status(400).json({ error: 'Not a zip file.' });
    }
    const destDir = req.body.destPath
      ? safeJoin(bot.folder_path, req.body.destPath)
      : path.join(path.dirname(zipPath), path.basename(zipPath, '.zip'));

    await extractZip(zipPath, destDir, bot.folder_path);
    res.json({ ok: true, extractedTo: path.relative(bot.folder_path, destDir).replace(/\\/g, '/') });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

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

// --- Download the whole bot folder as a zip ---
router.get('/:id/download', (req, res) => {
  const bot = getBotOr404(req, res);
  if (!bot) return;

  res.attachment(`${bot.name.replace(/[^a-z0-9_-]+/gi, '_')}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => res.status(500).end(err.message));
  archive.pipe(res);
  archive.directory(bot.folder_path, false);
  archive.finalize();
});

module.exports = router;
