import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db, now } from '../db';
import { CharacterSchema, SCHEMA_VERSION, uid, blankCharacter, type Character } from '../../shared/schema';
import { totalLevel } from '../../shared/rules';

type Row = { id: string; user_id: number; name: string; data: string; version: number; created_at: number; updated_at: number; deleted_at: number | null };

function getOwned(userId: number, id: string, reply: FastifyReply, includeDeleted = false): Row | undefined {
  const row = db.prepare('SELECT * FROM characters WHERE id=? AND user_id=?').get(id, userId) as Row | undefined;
  if (!row || (!includeDeleted && row.deleted_at)) {
    reply.code(404).send({ error: 'Fiche introuvable' });
    return;
  }
  return row;
}

function summary(row: Row) {
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
  };
}

function insert(userId: number, c: Character) {
  const id = uid() + uid().slice(0, 4);
  const t = now();
  db.prepare('INSERT INTO characters(id,user_id,name,data,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').run(
    id, userId, c.identity.name || 'Sans nom', JSON.stringify(c), t, t,
  );
  return id;
}

export default async function characterRoutes(app: FastifyInstance) {
  app.get('/api/characters', async (req) => {
    const rows = db.prepare('SELECT * FROM characters WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC').all(req.user!.id) as Row[];
    return rows.map(summary);
  });

  app.get('/api/characters/trash', async (req) => {
    const rows = db.prepare('SELECT * FROM characters WHERE user_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC').all(req.user!.id) as Row[];
    return rows.map(summary);
  });

  app.post('/api/characters', { bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    const body = (req.body ?? {}) as { character?: unknown; name?: string };
    const parsed = body.character ? CharacterSchema.safeParse(body.character) : { success: true as const, data: blankCharacter(body.name) };
    if (!parsed.success) return reply.code(400).send({ error: 'Fiche invalide', details: parsed.error.issues.slice(0, 5) });
    const id = insert(req.user!.id, parsed.data);
    return { id };
  });

  app.get<{ Params: { id: string } }>('/api/characters/:id', async (req, reply) => {
    const row = getOwned(req.user!.id, req.params.id, reply);
    if (!row) return;
    return { id: row.id, version: row.version, updated_at: row.updated_at, data: CharacterSchema.parse(JSON.parse(row.data)) };
  });

  app.put<{ Params: { id: string } }>('/api/characters/:id', { bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    const row = getOwned(req.user!.id, req.params.id, reply);
    if (!row) return;
    const p = z.object({ version: z.number().int(), data: z.unknown() }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'Requête invalide' });
    if (p.data.version !== row.version) {
      return reply.code(409).send({ error: 'La fiche a été modifiée ailleurs.', version: row.version });
    }
    const c = CharacterSchema.safeParse(p.data.data);
    if (!c.success) return reply.code(400).send({ error: 'Fiche invalide', details: c.error.issues.slice(0, 5) });
    const t = now();
    db.prepare('UPDATE characters SET data=?, name=?, version=version+1, updated_at=? WHERE id=?').run(
      JSON.stringify(c.data), c.data.identity.name || 'Sans nom', t, row.id,
    );
    return { version: row.version + 1, updated_at: t };
  });

  app.delete<{ Params: { id: string } }>('/api/characters/:id', async (req, reply) => {
    const row = getOwned(req.user!.id, req.params.id, reply);
    if (!row) return;
    db.prepare('UPDATE characters SET deleted_at=? WHERE id=?').run(now(), row.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/characters/:id/restore', async (req, reply) => {
    const row = getOwned(req.user!.id, req.params.id, reply, true);
    if (!row) return;
    db.prepare('UPDATE characters SET deleted_at=NULL WHERE id=?').run(row.id);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/characters/:id/purge', async (req, reply) => {
    const row = getOwned(req.user!.id, req.params.id, reply, true);
    if (!row) return;
    if (!row.deleted_at) return reply.code(400).send({ error: "Mettez d'abord la fiche à la corbeille." });
    db.prepare('DELETE FROM characters WHERE id=?').run(row.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/characters/:id/duplicate', async (req, reply) => {
    const row = getOwned(req.user!.id, req.params.id, reply);
    if (!row) return;
    const c = CharacterSchema.parse(JSON.parse(row.data));
    c.identity.name = `${c.identity.name} (copie)`;
    return { id: insert(req.user!.id, c) };
  });

  app.get<{ Params: { id: string } }>('/api/characters/:id/export', async (req, reply) => {
    const row = getOwned(req.user!.id, req.params.id, reply);
    if (!row) return;
    const character = CharacterSchema.parse(JSON.parse(row.data));
    const file = { format: 'grimoire-dd', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), character };
    const fname = (row.name || 'personnage').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\-]+/g, '_');
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${fname}.json"`);
    return JSON.stringify(file, null, 2);
  });

  // ---- Journal des lancers ----
  app.get<{ Params: { id: string } }>('/api/characters/:id/rolls', async (req, reply) => {
    const row = getOwned(req.user!.id, req.params.id, reply);
    if (!row) return;
    return db.prepare('SELECT id,label,detail,total,created_at FROM rolls WHERE character_id=? ORDER BY id DESC LIMIT 100').all(row.id);
  });

  app.post<{ Params: { id: string } }>('/api/characters/:id/rolls', async (req, reply) => {
    const row = getOwned(req.user!.id, req.params.id, reply);
    if (!row) return;
    const p = z.object({ label: z.string().max(200), detail: z.string().max(500), total: z.number().int() }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'Requête invalide' });
    const info = db.prepare('INSERT INTO rolls(character_id,label,detail,total,created_at) VALUES (?,?,?,?,?)').run(row.id, p.data.label, p.data.detail, p.data.total, now());
    db.prepare('DELETE FROM rolls WHERE character_id=? AND id <= (SELECT id FROM rolls WHERE character_id=? ORDER BY id DESC LIMIT 1 OFFSET 100)').run(row.id, row.id);
    return { id: Number(info.lastInsertRowid) };
  });

  app.delete<{ Params: { id: string } }>('/api/characters/:id/rolls', async (req, reply) => {
    const row = getOwned(req.user!.id, req.params.id, reply);
    if (!row) return;
    db.prepare('DELETE FROM rolls WHERE character_id=?').run(row.id);
    return { ok: true };
  });
}
