// Accès aux fiches (propriétaire ou Maître du Donjon) et journal des modifications.
import { db, now } from './db';
import type { SessionUser } from './auth';
import { CharacterSchema, type Character } from '../shared/schema';
import { diffCharacters, mergeChanges, type Change } from '../shared/diff';

export type CharRow = { id: string; user_id: number; name: string; data: string; version: number; created_at: number; updated_at: number; deleted_at: number | null };
export type Role = 'owner' | 'dm';
export type Source = 'web' | 'mcp';

/** Fiche accessible par l'utilisateur, avec son rôle. `ownerOnly` exclut les MJ. */
export function accessRow(userId: number, id: string, opts: { ownerOnly?: boolean; includeDeleted?: boolean } = {}): { row: CharRow; role: Role } | undefined {
  const row = db.prepare('SELECT * FROM characters WHERE id=?').get(id) as CharRow | undefined;
  if (!row || (!opts.includeDeleted && row.deleted_at)) return;
  if (row.user_id === userId) return { row, role: 'owner' };
  if (opts.ownerOnly || row.deleted_at) return;
  const share = db.prepare('SELECT role FROM character_shares WHERE character_id=? AND user_id=?').get(id, userId) as { role: Role } | undefined;
  return share ? { row, role: 'dm' } : undefined;
}

/** Fiches visibles par l'utilisateur : les siennes puis celles dont il est MJ. */
export function visibleRows(userId: number) {
  const own = db.prepare('SELECT * FROM characters WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC').all(userId) as CharRow[];
  const shared = db
    .prepare(
      `SELECT c.*, u.username AS owner_name FROM character_shares s
       JOIN characters c ON c.id = s.character_id JOIN users u ON u.id = c.user_id
       WHERE s.user_id=? AND c.deleted_at IS NULL ORDER BY c.updated_at DESC`,
    )
    .all(userId) as (CharRow & { owner_name: string })[];
  return { own, shared };
}

const COALESCE_MS = 2 * 60 * 1000;

/**
 * Inscrit un événement au journal. Pour les modifications (kind « update »), les enregistrements
 * successifs du même auteur, depuis la même origine, dans un court délai, sont regroupés.
 */
export function logChange(characterId: string, user: SessionUser, role: Role, source: Source, kind: string, changes: Change[]) {
  const t = now();
  if (kind === 'update') {
    if (!changes.length) return;
    const last = db
      .prepare('SELECT * FROM character_log WHERE character_id=? ORDER BY id DESC LIMIT 1')
      .get(characterId) as { id: number; user_id: number; source: string; kind: string; changes: string; updated_at: number } | undefined;
    if (last && last.kind === 'update' && last.user_id === user.id && last.source === source && t - last.updated_at < COALESCE_MS) {
      const merged = mergeChanges(JSON.parse(last.changes), changes);
      if (merged.length) db.prepare('UPDATE character_log SET changes=?, updated_at=? WHERE id=?').run(JSON.stringify(merged), t, last.id);
      else db.prepare('DELETE FROM character_log WHERE id=?').run(last.id);
      return;
    }
  }
  db.prepare('INSERT INTO character_log(character_id,user_id,username,role,source,kind,changes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(
    characterId, user.id, user.username, role, source, kind, JSON.stringify(changes.slice(0, 60)), t, t,
  );
}

/** Enregistre une nouvelle version de la fiche et journalise la différence. */
export function saveCharacter(row: CharRow, next: Character, user: SessionUser, role: Role, source: Source) {
  const before = CharacterSchema.parse(JSON.parse(row.data));
  const t = now();
  db.prepare('UPDATE characters SET data=?, name=?, version=version+1, updated_at=? WHERE id=?').run(JSON.stringify(next), next.identity.name || 'Sans nom', t, row.id);
  logChange(row.id, user, role, source, 'update', diffCharacters(before, next));
  return { version: row.version + 1, updated_at: t };
}

export function readLog(characterId: string, limit = 200) {
  return (db.prepare('SELECT id,username,role,source,kind,changes,created_at,updated_at FROM character_log WHERE character_id=? ORDER BY id DESC LIMIT ?').all(characterId, limit) as any[]).map((r) => ({
    ...r,
    changes: JSON.parse(r.changes),
  }));
}
