import type { FastifyInstance } from 'fastify';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';
import { db, now } from '../db';
import { createSession, destroySession } from '../auth';

const allowRegistration = () => process.env.ALLOW_REGISTRATION !== 'false';
const userCount = () => (db.prepare('SELECT COUNT(*) n FROM users').get() as { n: number }).n;

const Creds = z.object({
  username: z.string().trim().min(2, 'Identifiant trop court').max(40).regex(/^[\p{L}\p{N}_.\- ]+$/u, 'Caractères non autorisés'),
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum').max(200),
  remember: z.boolean().optional().default(false),
});

const limit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

export default async function authRoutes(app: FastifyInstance) {
  app.get('/api/auth/config', async () => ({ registrationOpen: allowRegistration() || userCount() === 0 }));

  app.get('/api/auth/me', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Non connecté' });
    return { user: req.user };
  });

  app.post('/api/auth/register', limit, async (req, reply) => {
    if (!allowRegistration() && userCount() > 0) return reply.code(403).send({ error: 'Les inscriptions sont fermées.' });
    const p = Creds.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0].message });
    const { username, password, remember } = p.data;
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) {
      return reply.code(409).send({ error: 'Cet identifiant est déjà pris.' });
    }
    const isAdmin = userCount() === 0 ? 1 : 0;
    const info = db
      .prepare('INSERT INTO users(username,pw_hash,is_admin,created_at) VALUES (?,?,?,?)')
      .run(username, await hash(password), isAdmin, now());
    createSession(reply, Number(info.lastInsertRowid), remember);
    return { user: { id: Number(info.lastInsertRowid), username, is_admin: isAdmin } };
  });

  app.post('/api/auth/login', limit, async (req, reply) => {
    const p = z.object({ username: z.string(), password: z.string(), remember: z.boolean().optional() }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'Requête invalide' });
    const row = db.prepare('SELECT id, username, pw_hash, is_admin FROM users WHERE username=?').get(p.data.username.trim()) as
      | { id: number; username: string; pw_hash: string; is_admin: number }
      | undefined;
    const ok = row ? await verify(row.pw_hash, p.data.password) : false;
    if (!row || !ok) return reply.code(401).send({ error: 'Identifiant ou mot de passe incorrect.' });
    createSession(reply, row.id, !!p.data.remember);
    return { user: { id: row.id, username: row.username, is_admin: row.is_admin } };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    destroySession(req, reply);
    return { ok: true };
  });

  app.post('/api/auth/password', limit, async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Non connecté' });
    const p = z.object({ current: z.string(), next: z.string().min(8, 'Mot de passe : 8 caractères minimum') }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0].message });
    const row = db.prepare('SELECT pw_hash FROM users WHERE id=?').get(req.user.id) as { pw_hash: string };
    if (!(await verify(row.pw_hash, p.data.current))) return reply.code(401).send({ error: 'Mot de passe actuel incorrect.' });
    db.prepare('UPDATE users SET pw_hash=? WHERE id=?').run(await hash(p.data.next), req.user.id);
    return { ok: true };
  });
}
