import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const DATA_DIR = resolve(process.env.DATA_DIR ?? './data');
export const UPLOAD_DIR = join(DATA_DIR, 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

export const DB_PATH = join(DATA_DIR, 'grimoire.sqlite');
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const migrations: string[] = [
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     username TEXT NOT NULL UNIQUE COLLATE NOCASE,
     pw_hash TEXT NOT NULL,
     is_admin INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     persistent INTEGER NOT NULL DEFAULT 0,
     expires_at INTEGER NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE characters (
     id TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     data TEXT NOT NULL,
     version INTEGER NOT NULL DEFAULT 1,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     deleted_at INTEGER
   );
   CREATE INDEX characters_user ON characters(user_id);
   CREATE TABLE uploads (
     id TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
     original_name TEXT,
     width INTEGER, height INTEGER, size INTEGER,
     ocr_text TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE rolls (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
     label TEXT NOT NULL,
     detail TEXT NOT NULL,
     total INTEGER NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX rolls_char ON rolls(character_id, id);`,
  `CREATE TABLE api_tokens (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     token_hash TEXT NOT NULL UNIQUE,
     prefix TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     last_used_at INTEGER
   );
   CREATE INDEX api_tokens_user ON api_tokens(user_id);`,
  `CREATE TABLE character_shares (
     character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     role TEXT NOT NULL DEFAULT 'dm',
     created_at INTEGER NOT NULL,
     PRIMARY KEY (character_id, user_id)
   );
   CREATE INDEX character_shares_user ON character_shares(user_id);
   CREATE TABLE character_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
     user_id INTEGER,
     username TEXT NOT NULL,
     role TEXT NOT NULL,
     source TEXT NOT NULL,
     kind TEXT NOT NULL,
     changes TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX character_log_char ON character_log(character_id, id);`,
];

const current = db.pragma('user_version', { simple: true }) as number;
for (let v = current; v < migrations.length; v++) {
  db.transaction(() => {
    db.exec(migrations[v]);
    db.pragma(`user_version = ${v + 1}`);
  })();
}

export const now = () => Date.now();
