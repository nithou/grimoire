import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
// @ts-expect-error pas de types publiés
import heicConvert from 'heic-convert';
import { db, now, UPLOAD_DIR } from '../db';
import { uid } from '../../shared/schema';
import { runOcr, tesseractAvailable } from '../ocr';
import { parseCard, parseOcrText } from '../../shared/ocr-parse';

const MAX = 25 * 1024 * 1024;

/** Détecte un conteneur HEIF/HEIC par sa signature ("ftyp" + marque). */
export function isHeif(buf: Buffer): boolean {
  if (buf.length < 12 || buf.toString('ascii', 4, 8) !== 'ftyp') return false;
  const brand = buf.toString('ascii', 8, 12);
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand);
}

export async function normalizeImage(input: Buffer): Promise<{ full: Buffer; thumb: Buffer; width: number; height: number }> {
  let buf = input;
  if (isHeif(buf)) buf = Buffer.from(await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.92 }));
  const base = sharp(buf, { failOn: 'none' }).rotate();
  const full = await base.clone().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
  const thumb = await base.clone().resize({ width: 360, height: 360, fit: 'cover' }).jpeg({ quality: 75 }).toBuffer();
  return { full: full.data, thumb, width: full.info.width, height: full.info.height };
}

type UploadRow = { id: string; user_id: number; character_id: string | null; original_name: string; width: number; height: number; size: number; ocr_text: string | null; created_at: number };
const fileFor = (u: { user_id: number; id: string }, thumb = false) => join(UPLOAD_DIR, String(u.user_id), `${u.id}${thumb ? '_t' : ''}.jpg`);

export default async function uploadRoutes(app: FastifyInstance) {
  app.post('/api/uploads', async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX } });
    if (!file) return reply.code(400).send({ error: 'Aucun fichier' });
    const buf = await file.toBuffer().catch(() => null);
    if (!buf) return reply.code(413).send({ error: 'Fichier trop volumineux (25 Mo max)' });
    const characterField = file.fields.characterId as { value?: string } | undefined;
    const characterId = characterField?.value || null;
    if (characterId && !db.prepare('SELECT 1 FROM characters WHERE id=? AND user_id=?').get(characterId, req.user!.id)) {
      return reply.code(404).send({ error: 'Fiche introuvable' });
    }
    let img;
    try {
      img = await normalizeImage(buf);
    } catch (e) {
      req.log.warn(e);
      return reply.code(415).send({ error: "Format d'image non pris en charge (HEIC, JPEG, PNG, WebP acceptés)." });
    }
    const id = uid() + uid().slice(0, 4);
    const row = { id, user_id: req.user!.id };
    mkdirSync(join(UPLOAD_DIR, String(row.user_id)), { recursive: true });
    await writeFile(fileFor(row), img.full);
    await writeFile(fileFor(row, true), img.thumb);
    db.prepare('INSERT INTO uploads(id,user_id,character_id,original_name,width,height,size,created_at) VALUES (?,?,?,?,?,?,?,?)').run(
      id, row.user_id, characterId, file.filename?.slice(0, 200) ?? '', img.width, img.height, img.full.length, now(),
    );
    return { id, width: img.width, height: img.height };
  });

  app.get('/api/uploads', async (req) => {
    const q = req.query as { characterId?: string };
    const rows = q.characterId
      ? db.prepare('SELECT id,character_id,original_name,width,height,created_at FROM uploads WHERE user_id=? AND character_id=? ORDER BY created_at DESC').all(req.user!.id, q.characterId)
      : db.prepare('SELECT id,character_id,original_name,width,height,created_at FROM uploads WHERE user_id=? ORDER BY created_at DESC').all(req.user!.id);
    return rows;
  });

  app.get<{ Params: { id: string }; Querystring: { thumb?: string } }>('/api/uploads/:id', async (req, reply) => {
    const row = db.prepare('SELECT * FROM uploads WHERE id=? AND user_id=?').get(req.params.id, req.user!.id) as UploadRow | undefined;
    const path = row && fileFor(row, req.query.thumb === '1');
    if (!row || !path || !existsSync(path)) return reply.code(404).send({ error: 'Image introuvable' });
    reply.header('Content-Type', 'image/jpeg').header('Cache-Control', 'private, max-age=31536000, immutable');
    return reply.send(createReadStream(path));
  });

  app.patch<{ Params: { id: string } }>('/api/uploads/:id', async (req, reply) => {
    const body = req.body as { characterId?: string | null };
    const row = db.prepare('SELECT * FROM uploads WHERE id=? AND user_id=?').get(req.params.id, req.user!.id) as UploadRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Image introuvable' });
    if (body.characterId && !db.prepare('SELECT 1 FROM characters WHERE id=? AND user_id=?').get(body.characterId, req.user!.id)) {
      return reply.code(404).send({ error: 'Fiche introuvable' });
    }
    db.prepare('UPDATE uploads SET character_id=? WHERE id=?').run(body.characterId ?? null, row.id);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/uploads/:id', async (req, reply) => {
    const row = db.prepare('SELECT * FROM uploads WHERE id=? AND user_id=?').get(req.params.id, req.user!.id) as UploadRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Image introuvable' });
    for (const p of [fileFor(row), fileFor(row, true)]) if (existsSync(p)) unlinkSync(p);
    db.prepare('DELETE FROM uploads WHERE id=?').run(row.id);
    return { ok: true };
  });

  // ---- OCR ----
  app.get('/api/ocr/status', async () => ({ available: await tesseractAvailable() }));

  app.post<{ Params: { id: string } }>('/api/uploads/:id/ocr', async (req, reply) => {
    const row = db.prepare('SELECT * FROM uploads WHERE id=? AND user_id=?').get(req.params.id, req.user!.id) as UploadRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Image introuvable' });
    const force = (req.body as { force?: boolean } | undefined)?.force;
    let text = row.ocr_text;
    if (text == null || force) {
      try {
        text = await runOcr(fileFor(row));
      } catch (e) {
        req.log.error(e);
        return reply.code(503).send({ error: `OCR indisponible : ${(e as Error).message}` });
      }
      db.prepare('UPDATE uploads SET ocr_text=? WHERE id=?').run(text, row.id);
    }
    return { text, suggestions: parseOcrText(text), card: parseCard(text) };
  });
}
