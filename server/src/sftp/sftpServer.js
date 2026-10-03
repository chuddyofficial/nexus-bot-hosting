const fs = require('fs');
const path = require('path');
const { Server, utils: sshUtils } = require('ssh2');
const { safeJoin } = require('../services/pathSafety');

const SFTP_PORT = parseInt(process.env.SFTP_PORT || '2222', 10);
const DATA_DIR = path.resolve(__dirname, '..', '..', process.env.DATA_DIR || 'data');
const HOST_KEY_PATH = path.join(DATA_DIR, 'sftp_host_key');

function ensureHostKey() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(HOST_KEY_PATH)) {
    const { generateKeyPairSync } = require('crypto');
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' }
    });
    fs.writeFileSync(HOST_KEY_PATH, privateKey, { mode: 0o600 });
  }
  return fs.readFileSync(HOST_KEY_PATH);
}

// Maps ssh2's numeric SFTP status codes.
const STATUS_CODE = sshUtils.sftp.STATUS_CODE;

function attachSftpSubsystem(connection, botRoot) {
  connection.on('session', (accept) => {
    const session = accept();
    session.on('sftp', (accept2) => {
      const sftp = accept2();
      const openHandles = new Map();
      let handleCounter = 0;

      function resolvePath(reqPath) {
        // SFTP paths are POSIX-style and rooted at "/" for this bot's chroot.
        const rel = reqPath.replace(/^\/+/, '');
        return safeJoin(botRoot, rel);
      }

      function toSftpPath(absPath) {
        const rel = path.relative(botRoot, absPath).replace(/\\/g, '/');
        return '/' + rel;
      }

      sftp.on('REALPATH', (reqid, reqPath) => {
        try {
          const resolved = resolvePath(reqPath);
          sftp.name(reqid, [{ filename: toSftpPath(resolved), longname: toSftpPath(resolved), attrs: {} }]);
        } catch {
          sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
        }
      });

      sftp.on('OPENDIR', (reqid, reqPath) => {
        try {
          const dirPath = resolvePath(reqPath);
          const stat = fs.statSync(dirPath);
          if (!stat.isDirectory()) return sftp.status(reqid, STATUS_CODE.FAILURE);
          const handle = Buffer.from(String(handleCounter++));
          openHandles.set(handle.toString(), { type: 'dir', path: dirPath, entries: null, offset: 0 });
          sftp.handle(reqid, handle);
        } catch {
          sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
        }
      });

      sftp.on('READDIR', (reqid, handleBuf) => {
        const h = openHandles.get(handleBuf.toString());
        if (!h || h.type !== 'dir') return sftp.status(reqid, STATUS_CODE.FAILURE);
        try {
          if (h.entries === null) {
            h.entries = fs.readdirSync(h.path, { withFileTypes: true });
          }
          if (h.offset >= h.entries.length) {
            return sftp.status(reqid, STATUS_CODE.EOF);
          }
          const batch = h.entries.slice(h.offset, h.offset + 100);
          h.offset += batch.length;
          const names = batch.map((entry) => {
            const full = path.join(h.path, entry.name);
            let size = 0;
            let mtime = Math.floor(Date.now() / 1000);
            try {
              const st = fs.statSync(full);
              size = st.size;
              mtime = Math.floor(st.mtimeMs / 1000);
            } catch { /* skip unreadable entries */ }
            const isDir = entry.isDirectory();
            return {
              filename: entry.name,
              longname: `${isDir ? 'd' : '-'}rwxr-xr-x 1 user user ${size} ${entry.name}`,
              attrs: { mode: isDir ? 0o40755 : 0o100644, size, mtime, atime: mtime }
            };
          });
          sftp.name(reqid, names);
        } catch {
          sftp.status(reqid, STATUS_CODE.FAILURE);
        }
      });

      sftp.on('CLOSE', (reqid, handleBuf) => {
        const h = openHandles.get(handleBuf.toString());
        if (h && h.fd !== undefined) {
          try { fs.closeSync(h.fd); } catch { /* already closed */ }
        }
        openHandles.delete(handleBuf.toString());
        sftp.status(reqid, STATUS_CODE.OK);
      });

      sftp.on('OPEN', (reqid, reqPath, flags) => {
        try {
          const filePath = resolvePath(reqPath);
          const write = !!(flags & sshUtils.sftp.OPEN_MODE.WRITE);
          const create = !!(flags & sshUtils.sftp.OPEN_MODE.CREAT);
          const trunc = !!(flags & sshUtils.sftp.OPEN_MODE.TRUNC);

          let nodeFlags = 'r';
          if (write && create && trunc) nodeFlags = 'w';
          else if (write && create) nodeFlags = 'a';
          else if (write) nodeFlags = 'r+';

          const fd = fs.openSync(filePath, nodeFlags);
          const handle = Buffer.from(String(handleCounter++));
          openHandles.set(handle.toString(), { type: 'file', fd, path: filePath });
          sftp.handle(reqid, handle);
        } catch {
          sftp.status(reqid, STATUS_CODE.FAILURE);
        }
      });

      sftp.on('READ', (reqid, handleBuf, offset, length) => {
        const h = openHandles.get(handleBuf.toString());
        if (!h || h.type !== 'file') return sftp.status(reqid, STATUS_CODE.FAILURE);
        try {
          const buffer = Buffer.alloc(length);
          const bytesRead = fs.readSync(h.fd, buffer, 0, length, offset);
          if (bytesRead === 0) return sftp.status(reqid, STATUS_CODE.EOF);
          sftp.data(reqid, buffer.slice(0, bytesRead));
        } catch {
          sftp.status(reqid, STATUS_CODE.FAILURE);
        }
      });

      sftp.on('WRITE', (reqid, handleBuf, offset, data) => {
        const h = openHandles.get(handleBuf.toString());
        if (!h || h.type !== 'file') return sftp.status(reqid, STATUS_CODE.FAILURE);
        try {
          fs.writeSync(h.fd, data, 0, data.length, offset);
          sftp.status(reqid, STATUS_CODE.OK);
        } catch {
          sftp.status(reqid, STATUS_CODE.FAILURE);
        }
      });

      sftp.on('LSTAT', handleStat);
      sftp.on('STAT', handleStat);
      function handleStat(reqid, reqPath) {
        try {
          const target = resolvePath(reqPath);
          const st = fs.statSync(target);
          sftp.attrs(reqid, {
            mode: st.isDirectory() ? 0o40755 : 0o100644,
            size: st.size,
            uid: 0,
            gid: 0,
            atime: Math.floor(st.atimeMs / 1000),
            mtime: Math.floor(st.mtimeMs / 1000)
          });
        } catch {
          sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
        }
      }

      sftp.on('FSTAT', (reqid, handleBuf) => {
        const h = openHandles.get(handleBuf.toString());
        if (!h) return sftp.status(reqid, STATUS_CODE.FAILURE);
        try {
          const st = fs.fstatSync(h.fd ?? fs.openSync(h.path, 'r'));
          sftp.attrs(reqid, {
            mode: st.isDirectory() ? 0o40755 : 0o100644,
            size: st.size,
            uid: 0,
            gid: 0,
            atime: Math.floor(st.atimeMs / 1000),
            mtime: Math.floor(st.mtimeMs / 1000)
          });
        } catch {
          sftp.status(reqid, STATUS_CODE.FAILURE);
        }
      });

      sftp.on('REMOVE', (reqid, reqPath) => {
        try {
          fs.unlinkSync(resolvePath(reqPath));
          sftp.status(reqid, STATUS_CODE.OK);
        } catch {
          sftp.status(reqid, STATUS_CODE.FAILURE);
        }
      });

      sftp.on('RMDIR', (reqid, reqPath) => {
        try {
          fs.rmdirSync(resolvePath(reqPath));
          sftp.status(reqid, STATUS_CODE.OK);
        } catch {
          sftp.status(reqid, STATUS_CODE.FAILURE);
        }
      });

      sftp.on('MKDIR', (reqid, reqPath) => {
        try {
          fs.mkdirSync(resolvePath(reqPath), { recursive: true });
          sftp.status(reqid, STATUS_CODE.OK);
        } catch {
          sftp.status(reqid, STATUS_CODE.FAILURE);
        }
      });

      sftp.on('RENAME', (reqid, oldPath, newPath) => {
        try {
          fs.renameSync(resolvePath(oldPath), resolvePath(newPath));
          sftp.status(reqid, STATUS_CODE.OK);
        } catch {
          sftp.status(reqid, STATUS_CODE.FAILURE);
        }
      });

      sftp.on('SETSTAT', (reqid) => sftp.status(reqid, STATUS_CODE.OK));
      sftp.on('FSETSTAT', (reqid) => sftp.status(reqid, STATUS_CODE.OK));
    });
  });
}

/**
 * Starts the per-bot SFTP server. authenticate(username, password) returns (or
 * resolves to) the absolute folder that login is chrooted to, or null to reject.
 */
function startSftpServer({ authenticate }) {
  const hostKey = ensureHostKey();

  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    let botRoot = null;

    client.on('authentication', (ctx) => {
      if (ctx.method !== 'password') return ctx.reject(['password']);

      Promise.resolve()
        .then(() => authenticate(ctx.username, ctx.password))
        .then((root) => {
          if (!root) return ctx.reject(['password']);
          botRoot = path.resolve(root);
          ctx.accept();
        })
        .catch(() => ctx.reject(['password']));
    });

    client.on('ready', () => {
      if (!botRoot) return client.end();
      attachSftpSubsystem(client, botRoot);
    });

    client.on('error', () => { /* connection-level errors are non-fatal */ });
  });

  server.listen(SFTP_PORT, '0.0.0.0', () => {
    console.log(`SFTP server listening on port ${SFTP_PORT}`);
  });

  server.on('error', (err) => {
    console.error('SFTP server error:', err.message);
  });

  return server;
}

module.exports = { startSftpServer };
