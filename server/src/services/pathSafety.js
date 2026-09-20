const path = require('path');

/**
 * Resolves a user-supplied relative path against a bot's root folder and
 * guarantees the result stays inside that folder. Throws on any attempt
 * to escape (../, absolute paths, symlink-style tricks via normalize).
 */
function safeJoin(rootDir, relativePath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, '.' + path.sep + String(relativePath || ''));

  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Path escapes bot root directory');
  }
  return target;
}

/** Validates a single filename (no directories, no traversal). */
function safeFilename(name) {
  const base = path.basename(String(name || ''));
  if (!base || base === '.' || base === '..' || /[\\/]/.test(name)) {
    throw new Error('Invalid filename');
  }
  return base;
}

module.exports = { safeJoin, safeFilename };
