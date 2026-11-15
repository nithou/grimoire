import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SrdEntry } from '../srd/build-index';
import { norm } from '../../shared/srd-fr';

const SRD_DIR = resolve(process.env.SRD_DIR ?? './srd');
let entries: (SrdEntry & { _n: string; _b: string })[] = [];

export function loadSrd() {
  const p = resolve(SRD_DIR, 'index.json');
  if (!existsSync(p)) return 0;
  const raw = JSON.parse(readFileSync(p, 'utf8')) as SrdEntry[];
  entries = raw.map((e) => ({ ...e, _n: norm(e.name), _b: norm(e.body) }));
  return entries.length;
}

const strip = ({ _n, _b, body, ...rest }: SrdEntry & { _n: string; _b: string }) => rest;

export type SrdQuery = { q?: string; type?: string; level?: number | null; cls?: string; limit?: number; lang?: string };

/** Recherche dans l'index SRD (partagée par l'API HTTP et le serveur MCP). */
export function searchSrd(q: SrdQuery) {
  const lang = q.lang === 'en' || q.lang === 'all' ? q.lang : 'fr';
  const nq = norm(q.q ?? '');
  const types = q.type ? q.type.split(',') : null;
  const level = q.level ?? null;
  const limit = Math.min(200, q.limit || 50);
  const scored: { e: (typeof entries)[number]; s: number }[] = [];
  for (const e of entries) {
    if (lang !== 'all' && (e.lang ?? 'en') !== lang) continue;
    if (types && !types.includes(e.type)) continue;
    if (level != null && e.level !== level) continue;
    if (q.cls && !e.classes?.includes(q.cls)) continue;
    let s = 0;
    if (!nq) s = 1;
    else if (e._n === nq) s = 100;
    else if (e._n.startsWith(nq)) s = 50;
    else if (e._n.includes(nq)) s = 25;
    else if (nq.length >= 3 && e._b.includes(nq)) s = 5;
    if (s) scored.push({ e, s });
  }
  scored.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name));
  return { total: scored.length, results: scored.slice(0, limit).map((x) => x.e) };
}

export function getSrdEntry(id: string): SrdEntry | undefined {
  const e = entries.find((x) => x.id === id);
  if (!e) return;
  const { _n, _b, ...rest } = e;
  return rest;
}

export default async function srdRoutes(app: FastifyInstance) {
  app.get('/api/srd', async (req) => {
    const q = req.query as { q?: string; type?: string; level?: string; cls?: string; limit?: string; lang?: string };
    const r = searchSrd({
      q: q.q, type: q.type, cls: q.cls, lang: q.lang,
      level: q.level != null && q.level !== '' ? parseInt(q.level, 10) : null,
      limit: parseInt(q.limit ?? '50', 10) || 50,
    });
    return { total: r.total, results: r.results.map(strip) };
  });

  app.get<{ Params: { id: string } }>('/api/srd/:id', async (req, reply) => {
    const e = getSrdEntry(req.params.id);
    if (!e) return reply.code(404).send({ error: 'Entrée introuvable' });
    return e;
  });
}
