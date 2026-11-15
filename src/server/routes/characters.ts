import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db, now } from '../db';
import { CharacterSchema, SCHEMA_VERSION, uid, blankCharacter, type Character } from '../../shared/schema';
import { totalLevel } from '../../shared/rules';
import { accessRow, logChange, readLog, saveCharacter, visibleRows, type CharRow, type Role } from '../access';

/** Fiche accessible (propriétaire ou MJ selon `ownerOnly`), sinon 404. */
function access(req: FastifyRequest, reply: FastifyReply, id: string, opts: { ownerOnly?: boolean; includeDeleted?: boolean } = {}) {
  const a = accessRow(req.user!.id, id, opts);
  if (!a) {
    reply.code(404).send({ error: 'Fiche introuvable' });
    return;
  }
  return a;
}

function summary(row: CharRow & { owner_name?: string }, role: Role = 'owner') {
  const c = JSON.parse(row.data) as Character;
  return {
    id: row.id,
    name: row.name,
    species: c.identity?.species ?? '',
    classes: (c.classes ?? []).map((k) => `${k.name}${k.subclass ? ` (${k.subclass})` : ''} ${k.level}`).join(' / '),
    level: totalLevel(c),
    portrait: c.identity?.portrait || null,
    hp: `${c.combat?.hpCurrent ?? 0}/${c.combat?.hpMax ?? 0}`,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    role,
    owner: row.owner_name ?? null,
  };
}

function insert(req: FastifyRequest, c: Character, kind = 'create') {
  const id = uid() + uid().slice(0, 4);
  const t = now();
  db.prepare('INSERT INTO characters(id,user_id,name,data,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').run(
    id, req.user!.id, c.identity.name || 'Sans nom', JSON.stringify(c), t, t,
  );
  logChange(id, req.user!, 'owner', 'web', kind, []);
  return id;
}

export default async function characterRoutes(app: FastifyInstance) {
  app.get('/api/characters', async (req) => {
    const { own, shared } = visibleRows(req.user!.id);
    return [...own.map((r) => summary(r, 'owner')), ...shared.map((r) => summary(r, 'dm'))];
  });

  app.get('/api/characters/trash', async (req) => {
    const rows = db.prepare('SELECT * FROM characters WHERE user_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC').all(req.user!.id) as CharRow[];
    return rows.map((r) => summary(r));
  });

  app.post('/api/characters', { bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    const body = (req.body ?? {}) as { character?: unknown; name?: string };
    const parsed = body.character ? CharacterSchema.safeParse(body.character) : { success: true as const, data: blankCharacter(body.name) };
    if (!parsed.success) return reply.code(400).send({ error: 'Fiche invalide', details: parsed.error.issues.slice(0, 5) });
    return { id: insert(req, parsed.data, body.character ? 'import' : 'create') };
  });

  app.get<{ Params: { id: string } }>('/api/characters/:id', async (req, reply) => {
    const a = access(req, reply, req.params.id);
    if (!a) return;
    const owner = a.role === 'dm' ? (db.prepare('SELECT username FROM users WHERE id=?').get(a.row.user_id) as { username: string }).username : req.user!.username;
    return { id: a.row.id, version: a.row.version, updated_at: a.row.updated_at, role: a.role, owner, data: CharacterSchema.parse(JSON.parse(a.row.data)) };
  });

  app.put<{ Params: { id: string } }>('/api/characters/:id', { bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    const a = access(req, reply, req.params.id);
    if (!a) return;
    const p = z.object({ version: z.number().int(), data: z.unknown() }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'Requête invalide' });
    if (p.data.version !== a.row.version) {
      return reply.code(409).send({ error: 'La fiche a été modifiée ailleurs.', version: a.row.version });
    }
    const c = CharacterSchema.safeParse(p.data.data);
    if (!c.success) return reply.code(400).send({ error: 'Fiche invalide', details: c.error.issues.slice(0, 5) });
    return saveCharacter(a.row, c.data, req.user!, a.role, 'web');
  });

  app.delete<{ Params: { id: string } }>('/api/characters/:id', async (req, reply) => {
    const a = access(req, reply, req.params.id, { ownerOnly: true });
    if (!a) return;
    db.prepare('UPDATE characters SET deleted_at=? WHERE id=?').run(now(), a.row.id);
    logChange(a.row.id, req.user!, 'owner', 'web', 'trash', []);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/characters/:id/restore', async (req, reply) => {
    const a = access(req, reply, req.params.id, { ownerOnly: true, includeDeleted: true });
    if (!a) return;
    db.prepare('UPDATE characters SET deleted_at=NULL WHERE id=?').run(a.row.id);
    logChange(a.row.id, req.user!, 'owner', 'web', 'restore', []);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/characters/:id/purge', async (req, reply) => {
    const a = access(req, reply, req.params.id, { ownerOnly: true, includeDeleted: true });
    if (!a) return;
    if (!a.row.deleted_at) return reply.code(400).send({ error: "Mettez d'abord la fiche à la corbeille." });
    db.prepare('DELETE FROM characters WHERE id=?').run(a.row.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/characters/:id/duplicate', async (req, reply) => {
    const a = access(req, reply, req.params.id, { ownerOnly: true });
    if (!a) return;
    const c = CharacterSchema.parse(JSON.parse(a.row.data));
    c.identity.name = `${c.identity.name} (copie)`;
    return { id: insert(req, c, 'duplicate') };
  });

  app.get<{ Params: { id: string } }>('/api/characters/:id/export', async (req, reply) => {
    const a = access(req, reply, req.params.id);
    if (!a) return;
    const character = CharacterSchema.parse(JSON.parse(a.row.data));
    const file = { format: 'grimoire-dd', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), character };
    const fname = (a.row.name || 'personnage').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\-]+/g, '_');
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${fname}.json"`);
    return JSON.stringify(file, null, 2);
  });

  // ---- Journal des modifications ----
  app.get<{ Params: { id: string } }>('/api/characters/:id/log', async (req, reply) => {
    const a = access(req, reply, req.params.id);
    if (!a) return;
    return readLog(a.row.id);
  });

  // ---- Maîtres du Donjon (partage en édition) ----
  app.get<{ Params: { id: string } }>('/api/characters/:id/shares', async (req, reply) => {
    const a = access(req, reply, req.params.id);
    if (!a) return;
    return db
      .prepare('SELECT u.id, u.username, s.role, s.created_at FROM character_shares s JOIN users u ON u.id=s.user_id WHERE s.character_id=? ORDER BY s.created_at')
      .all(a.row.id);
  });

  app.post<{ Params: { id: string } }>('/api/characters/:id/shares', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const a = access(req, reply, req.params.id, { ownerOnly: true });
    if (!a) return;
    const p = z.object({ username: z.string().trim().min(1).max(40) }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'Identifiant requis' });
    const u = db.prepare('SELECT id, username FROM users WHERE username=?').get(p.data.username) as { id: number; username: string } | undefined;
    if (!u) return reply.code(404).send({ error: `Aucun compte « ${p.data.username} ».` });
    if (u.id === req.user!.id) return reply.code(400).send({ error: 'Vous êtes déjà propriétaire de cette fiche.' });
    db.prepare('INSERT OR IGNORE INTO character_shares(character_id,user_id,role,created_at) VALUES (?,?,?,?)').run(a.row.id, u.id, 'dm', now());
    logChange(a.row.id, req.user!, 'owner', 'web', 'share', [{ path: 'shares', label: 'Maître du Donjon', before: '', after: `+ ${u.username}` }]);
    return { id: u.id, username: u.username };
  });

  app.delete<{ Params: { id: string; userId: string } }>('/api/characters/:id/shares/:userId', async (req, reply) => {
    const uid = Number(req.params.userId);
    // Le propriétaire retire un MJ ; un MJ peut aussi se retirer lui-même.
    const a = access(req, reply, req.params.id, { ownerOnly: uid !== req.user!.id });
    if (!a) return;
    const u = db.prepare('SELECT username FROM users WHERE id=?').get(uid) as { username: string } | undefined;
    const r = db.prepare('DELETE FROM character_shares WHERE character_id=? AND user_id=?').run(a.row.id, uid);
    if (!r.changes) return reply.code(404).send({ error: 'Partage introuvable' });
    logChange(a.row.id, req.user!, a.role, 'web', 'unshare', [{ path: 'shares', label: 'Maître du Donjon', before: `− ${u?.username ?? uid}`, after: '' }]);
    return { ok: true };
  });

  // ---- Journal des lancers ----
  app.get<{ Params: { id: string } }>('/api/characters/:id/rolls', async (req, reply) => {
    const a = access(req, reply, req.params.id);
    if (!a) return;
    return db.prepare('SELECT id,label,detail,total,created_at FROM rolls WHERE character_id=? ORDER BY id DESC LIMIT 100').all(a.row.id);
  });

  app.post<{ Params: { id: string } }>('/api/characters/:id/rolls', async (req, reply) => {
    const a = access(req, reply, req.params.id);
    if (!a) return;
    const p = z.object({ label: z.string().max(200), detail: z.string().max(500), total: z.number().int() }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'Requête invalide' });
    const label = a.role === 'dm' ? `[MJ ${req.user!.username}] ${p.data.label}`.slice(0, 200) : p.data.label;
    const info = db.prepare('INSERT INTO rolls(character_id,label,detail,total,created_at) VALUES (?,?,?,?,?)').run(a.row.id, label, p.data.detail, p.data.total, now());
    db.prepare('DELETE FROM rolls WHERE character_id=? AND id <= (SELECT id FROM rolls WHERE character_id=? ORDER BY id DESC LIMIT 1 OFFSET 100)').run(a.row.id, a.row.id);
    return { id: Number(info.lastInsertRowid) };
  });

  app.delete<{ Params: { id: string } }>('/api/characters/:id/rolls', async (req, reply) => {
    const a = access(req, reply, req.params.id);
    if (!a) return;
    db.prepare('DELETE FROM rolls WHERE character_id=?').run(a.row.id);
    return { ok: true };
  });
}
