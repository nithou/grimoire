// Jetons d'API personnels (accès MCP). Stockés hachés ; le jeton en clair n'est montré qu'une fois.
import { createHash, randomBytes } from 'node:crypto';
import { db, now } from './db';
import type { SessionUser } from './auth';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

export function createToken(userId: number, name: string) {
  const token = `grm_${randomBytes(24).toString('base64url')}`;
  const info = db
    .prepare('INSERT INTO api_tokens(user_id,name,token_hash,prefix,created_at) VALUES (?,?,?,?,?)')
    .run(userId, name.slice(0, 60) || 'Jeton', hash(token), token.slice(0, 8), now());
  return { id: Number(info.lastInsertRowid), token };
}

export function listTokens(userId: number) {
  return db.prepare('SELECT id,name,prefix,created_at,last_used_at FROM api_tokens WHERE user_id=? ORDER BY created_at DESC').all(userId);
}

export function revokeToken(userId: number, id: number) {
  return db.prepare('DELETE FROM api_tokens WHERE id=? AND user_id=?').run(id, userId).changes > 0;
}

/** Résout un en-tête « Authorization: Bearer grm_… » en utilisateur. */
export function userFromBearer(header: string | undefined): SessionUser | undefined {
  const m = header?.match(/^Bearer\s+(grm_[A-Za-z0-9_-]+)$/);
  if (!m) return;
  const row = db
    .prepare('SELECT t.id AS tid, u.id, u.username, u.is_admin FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=?')
    .get(hash(m[1])) as (SessionUser & { tid: number }) | undefined;
  if (!row) return;
  db.prepare('UPDATE api_tokens SET last_used_at=? WHERE id=?').run(now(), row.tid);
  return { id: row.id, username: row.username, is_admin: row.is_admin };
}
