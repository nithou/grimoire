import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db, now } from './db';

export const COOKIE = 'sid';
const DAY = 24 * 3600 * 1000;
export const PERSISTENT_TTL = 30 * DAY;
export const SESSION_TTL = 8 * 3600 * 1000;
const secureCookie = process.env.COOKIE_SECURE === 'true';

export type SessionUser = { id: number; username: string; is_admin: number };

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export function createSession(reply: FastifyReply, userId: number, persistent: boolean) {
  const token = randomBytes(32).toString('base64url');
  const ttl = persistent ? PERSISTENT_TTL : SESSION_TTL;
  db.prepare('INSERT INTO sessions(token_hash,user_id,persistent,expires_at,created_at) VALUES (?,?,?,?,?)').run(
    hashToken(token), userId, persistent ? 1 : 0, now() + ttl, now(),
  );
  setCookie(reply, token, persistent);
}

function setCookie(reply: FastifyReply, token: string, persistent: boolean) {
  reply.setCookie(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    ...(persistent ? { maxAge: PERSISTENT_TTL / 1000 } : {}),
  });
}

export function destroySession(req: FastifyRequest, reply: FastifyReply) {
  const t = req.cookies[COOKIE];
  if (t) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(t));
  reply.clearCookie(COOKIE, { path: '/' });
}

/** Charge l'utilisateur depuis le cookie et prolonge la session (expiration glissante). */
export function loadUser(req: FastifyRequest, reply: FastifyReply): SessionUser | undefined {
  const t = req.cookies[COOKIE];
  if (!t) return;
  const h = hashToken(t);
  const row = db
    .prepare(
      `SELECT s.persistent, s.expires_at, u.id, u.username, u.is_admin
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .get(h) as (SessionUser & { persistent: number; expires_at: number }) | undefined;
  if (!row) return;
  if (row.expires_at < now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(h);
    return;
  }
  const ttl = row.persistent ? PERSISTENT_TTL : SESSION_TTL;
  // Renouvelle au plus une fois par heure pour éviter d'écrire à chaque requête.
  if (row.expires_at - now() < ttl - 3600 * 1000) {
    db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run(now() + ttl, h);
    if (row.persistent) setCookie(reply, t, true);
  }
  return { id: row.id, username: row.username, is_admin: row.is_admin };
}

export function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
}
