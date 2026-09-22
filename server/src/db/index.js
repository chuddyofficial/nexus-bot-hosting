const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.resolve(__dirname, '..', '..', process.env.DATA_DIR || 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'platform.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  verify_token TEXT,
  reset_token TEXT,
  reset_token_expires INTEGER,
  is_admin INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  bot_limit_override INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  runtime TEXT NOT NULL CHECK (runtime IN ('python', 'node')),
  status TEXT NOT NULL DEFAULT 'stopped',
  container_id TEXT,
  container_name TEXT NOT NULL,
  folder_path TEXT NOT NULL,
  entry_file TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots(user_id);
`);

// Migrate existing DBs (created before these columns existed) without losing data.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('users', 'username', 'username TEXT');
ensureColumn('users', 'is_admin', 'is_admin INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'disabled', 'disabled INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'bot_limit_override', 'bot_limit_override INTEGER');

db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;`);

module.exports = db;
