// Construit srd/index.json à partir des fichiers markdown du SRD 5.2.1 vendorisés dans ./srd
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildIndexFr } from './build-index-fr';
import { join, resolve } from 'node:path';

export type SrdEntry = {
  id: string;
  type: 'spell' | 'magic-item' | 'feat' | 'rule' | 'gear' | 'tool' | 'weapon' | 'armor';
  name: string;
  meta: string;
  level?: number;
  classes?: string[];
  body: string;
  extra?: Record<string, string>;
  lang?: 'en' | 'fr';
};

const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();

/** Convertit les tableaux HTML en lignes "| a | b |" lisibles par le rendu client. */
export function htmlTablesToPipes(md: string): string {
  return md.replace(/<table>[\s\S]*?<\/table>/g, (tbl) => {
    const rows = [...tbl.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => {
      const cells = [...r[1].matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => stripTags(c[2]));
      return `| ${cells.join(' | ')} |`;
    });
    return '\n' + rows.join('\n') + '\n';
  });
}

type Section = { level: number; title: string; lines: string[]; parentH2: string; parentH3: string };

function sections(md: string): Section[] {
  const out: Section[] = [];
  let h2 = '';
  let h3 = '';
  let cur: Section | null = null;
  for (const line of md.replace(/^﻿/, '').split('\n')) {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      const level = m[1].length;
      const title = m[2].trim();
      if (level === 2) (h2 = title), (h3 = '');
      if (level === 3) h3 = title;
      cur = { level, title, lines: [], parentH2: h2, parentH3: h3 };
      out.push(cur);
    } else if (cur) cur.lines.push(line);
  }
  return out;
}

const firstNonEmpty = (lines: string[]) => lines.find((l) => l.trim() !== '')?.trim() ?? '';
const body = (lines: string[]) => htmlTablesToPipes(lines.join('\n')).trim();
const italic = (l: string) => (/^_.*_$/.test(l) ? l.slice(1, -1) : '');

function appendTo(e: SrdEntry | undefined, s: Section) {
  if (!e) return;
  e.body += `\n\n${'#'.repeat(Math.max(4, s.level))} ${s.title}\n${body(s.lines)}`;
}

function parseSpells(md: string): SrdEntry[] {
  const out: SrdEntry[] = [];
  let started = false;
  for (const s of sections(md)) {
    if (s.level === 2 && s.title === 'Spell Descriptions') {
      started = true;
      continue;
    }
    if (!started) continue;
    const meta = italic(firstNonEmpty(s.lines));
    const m = meta.match(/^(?:Level (\d) (\w+)|(\w+) Cantrip) \((.+)\)$/);
    if (s.level === 4 && m) {
      const lines = [...s.lines];
      lines.splice(lines.findIndex((l) => l.trim() !== ''), 1);
      out.push({
        id: `spell-${slug(s.title)}`,
        type: 'spell',
        name: s.title,
        meta,
        level: m[1] ? parseInt(m[1], 10) : 0,
        classes: m[4].split(',').map((x) => x.trim()),
        body: body(lines),
        extra: { school: m[2] ?? m[3] },
      });
    } else appendTo(out[out.length - 1], s);
  }
  return out;
}

function parseMagicItems(md: string): SrdEntry[] {
  const out: SrdEntry[] = [];
  let started = false;
  for (const s of sections(md)) {
    if (s.level === 2) {
      started = s.title.startsWith('Magic Items A');
      continue;
    }
    if (!started) continue;
    const meta = italic(firstNonEmpty(s.lines));
    if (s.level === 4 && meta) {
      const lines = [...s.lines];
      lines.splice(lines.findIndex((l) => l.trim() !== ''), 1);
      out.push({ id: `mi-${slug(s.title)}`, type: 'magic-item', name: s.title, meta, body: body(lines) });
    } else appendTo(out[out.length - 1], s);
  }
  return out;
}

function parseFeats(md: string): SrdEntry[] {
  return sections(md)
    .filter((s) => s.level === 4)
    .map((s) => {
      const meta = italic(firstNonEmpty(s.lines));
      const lines = [...s.lines];
      if (meta) lines.splice(lines.findIndex((l) => l.trim() !== ''), 1);
      return { id: `feat-${slug(s.title)}`, type: 'feat' as const, name: s.title, meta: meta || s.parentH3, body: body(lines) };
    });
}

function parseGlossary(md: string): SrdEntry[] {
  const out: SrdEntry[] = [];
  for (const s of sections(md)) {
    if (s.parentH2 !== 'Rules Definitions') continue;
    if (s.level === 4) {
      const tag = s.title.match(/\[(.+)\]$/)?.[1] ?? '';
      out.push({ id: `rule-${slug(s.title)}`, type: 'rule', name: s.title.replace(/\s*\[.+\]$/, ''), meta: tag, body: body(s.lines) });
    } else if (s.level > 4) appendTo(out[out.length - 1], s);
  }
  return out;
}

function parseEquipment(md: string): SrdEntry[] {
  const out: SrdEntry[] = [];
  for (const s of sections(md)) {
    if (s.level !== 4) continue;
    if (s.parentH2 !== 'Adventuring Gear' && s.parentH2 !== 'Tools') continue;
    const m = s.title.match(/^(.*?)\s*\(([^)]+)\)$/);
    const name = m ? m[1] : s.title;
    const cost = m ? m[2] : '';
    if (s.parentH2 === 'Tools' && !m) {
      // "#### Artisan's Tools" : sous-sections décrites en gras dans le corps
      const txt = s.lines.join('\n');
      for (const tm of txt.matchAll(/^\*\*([^*]+?)\s*\(([^)]+)\)\.?\*\*\s*([\s\S]*?)(?=^\*\*[^*]+\(|\Z)/gm)) {
        out.push({ id: `tool-${slug(tm[1])}`, type: 'tool', name: tm[1], meta: tm[2], body: tm[3].trim(), extra: { cost: tm[2] } });
      }
      continue;
    }
    out.push({ id: `gear-${slug(name)}`, type: s.parentH2 === 'Tools' ? 'tool' : 'gear', name, meta: cost, body: body(s.lines), extra: { cost } });
  }

  // Tableaux d'armes et d'armures
  const tables = [...md.matchAll(/<table>([\s\S]*?)<\/table>/g)].map((m) => m[1]);
  for (const tbl of tables) {
    const header = [...tbl.matchAll(/<th>([\s\S]*?)<\/th>/g)].map((m) => stripTags(m[1]));
    const isWeapon = header[0] === 'Name' && header.includes('Mastery');
    const isArmor = header[0] === 'Armor' && header.includes('Armor Class (AC)');
    if (!isWeapon && !isArmor) continue;
    let category = '';
    for (const r of tbl.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cat = r[1].match(/<th colspan="\d+">([\s\S]*?)<\/th>/);
      if (cat) {
        category = stripTags(cat[1]);
        continue;
      }
      const cells = [...r[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => stripTags(c[1]));
      if (cells.length < 6) continue;
      if (isWeapon) {
        const [name, damage, properties, mastery, weight, cost] = cells;
        out.push({
          id: `weapon-${slug(name)}`,
          type: 'weapon',
          name,
          meta: `${category} — ${damage}`,
          body: `**Dégâts :** ${damage}\n**Propriétés :** ${properties}\n**Botte (Mastery) :** ${mastery}\n**Poids :** ${weight}\n**Coût :** ${cost}`,
          extra: { damage, properties, mastery, weight, cost, category },
        });
      } else {
        const [name, ac, strength, stealth, weight, cost] = cells;
        out.push({
          id: `armor-${slug(name)}`,
          type: 'armor',
          name,
          meta: `${category} — CA ${ac}`,
          body: `**CA :** ${ac}\n**Force :** ${strength}\n**Discrétion :** ${stealth}\n**Poids :** ${weight}\n**Coût :** ${cost}`,
          extra: { ac, strength, stealth, weight, cost, category },
        });
      }
    }
  }
  return out;
}

export function buildIndex(dir: string): SrdEntry[] {
  const read = (f: string) => readFileSync(join(dir, f), 'utf8');
  const all = [
    ...parseSpells(read('spells.md')),
    ...parseMagicItems(read('magic-items.md')),
    ...parseFeats(read('feats.md')),
    ...parseGlossary(read('rules-glossary.md')),
    ...parseEquipment(read('equipment.md')),
  ].map((e): SrdEntry => ({ ...e, lang: 'en' }));
  const frPath = join(dir, 'fr', 'srd-fr.md');
  if (existsSync(frPath)) all.push(...buildIndexFr(readFileSync(frPath, 'utf8'), all));
  // dédoublonne les id
  const seen = new Map<string, number>();
  for (const e of all) {
    const n = seen.get(e.id) ?? 0;
    seen.set(e.id, n + 1);
    if (n) e.id = `${e.id}-${n + 1}`;
  }
  return all;
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('build-index.ts')) {
  const dir = resolve(process.cwd(), 'srd');
  const idx = buildIndex(dir);
  writeFileSync(join(dir, 'index.json'), JSON.stringify(idx));
  const counts = idx.reduce<Record<string, number>>((a, e) => ((a[`${e.lang}:${e.type}`] = (a[`${e.lang}:${e.type}`] ?? 0) + 1), a), {});
  console.log('Index SRD :', counts);
}
