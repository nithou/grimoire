// Index du SRD 5.2.1 en français, à partir de srd/fr/srd-fr.md (généré depuis le PDF officiel
// par scripts/srd-pdf-to-md.mjs). Armes et armures sont traduites depuis les tableaux anglais,
// plus fiables que le tableau français éclaté sur deux colonnes dans le PDF.
import type { SrdEntry } from './build-index';

const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

type Section = { level: number; title: string; lines: string[] };

function sections(md: string): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const line of md.split('\n')) {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      cur = { level: m[1].length, title: m[2].trim(), lines: [] };
      out.push(cur);
    } else if (cur) cur.lines.push(line);
  }
  return out;
}

/** Extrait une ligne de méta en italique en tête de section : "_Évocation du 3e niveau (…)_ suite…" */
function splitMeta(lines: string[]): { meta: string; body: string } {
  const i = lines.findIndex((l) => l.trim() !== '');
  if (i < 0) return { meta: '', body: '' };
  const m = lines[i].trim().match(/^_([^_]+)_\s*(.*)$/);
  if (!m) return { meta: '', body: lines.join('\n').trim() };
  const rest = [m[2], ...lines.slice(i + 1)].join('\n').trim();
  return { meta: m[1].trim(), body: rest };
}

/** Sections comprises entre deux titres (exclus). */
function between(all: Section[], start: (s: Section) => boolean, end: (s: Section) => boolean): Section[] {
  const i = all.findIndex(start);
  if (i < 0) return [];
  const j = all.findIndex((s, k) => k > i && end(s));
  return all.slice(i + 1, j < 0 ? undefined : j);
}

function appendTo(e: SrdEntry | undefined, s: Section) {
  if (!e) return;
  e.body += `\n\n${'#'.repeat(Math.max(4, s.level))} ${s.title}\n${s.lines.join('\n').trim()}`;
}

function parseSpellsFr(secs: Section[]): SrdEntry[] {
  const out: SrdEntry[] = [];
  for (const s of secs) {
    const { meta, body } = splitMeta(s.lines);
    const isSpell = s.level === 4 && /(niveau|mineur)/i.test(meta) && /\(.+\)$/.test(meta);
    if (!isSpell) {
      appendTo(out[out.length - 1], s);
      continue;
    }
    const lvl = meta.match(/(\d)\s*(?:er|e)\s+niveau/);
    const classes = meta.match(/\(([^()]+)\)\s*$/)?.[1].split(',').map((c) => c.trim()) ?? [];
    out.push({
      id: `fr-spell-${slug(s.title)}`,
      type: 'spell',
      name: s.title,
      meta,
      level: lvl ? parseInt(lvl[1], 10) : 0,
      classes,
      body,
      extra: { school: meta.split(/\s/)[0] },
    });
  }
  return out;
}

function parseMetaEntries(secs: Section[], type: SrdEntry['type'], prefix: string): SrdEntry[] {
  const out: SrdEntry[] = [];
  for (const s of secs) {
    const { meta, body } = splitMeta(s.lines);
    if (s.level === 4 && meta) out.push({ id: `${prefix}-${slug(s.title)}`, type, name: s.title, meta, body });
    else appendTo(out[out.length - 1], s);
  }
  return out;
}

function parseRulesFr(secs: Section[]): SrdEntry[] {
  const out: SrdEntry[] = [];
  for (const s of secs) {
    if (s.level === 4) {
      const tag = s.title.match(/\[(.+)\]$/)?.[1] ?? '';
      const name = s.title.replace(/\s*\[.+\]$/, '');
      out.push({ id: `fr-rule-${slug(s.title)}`, type: 'rule', name, meta: tag, body: s.lines.join('\n').trim() });
    } else if (s.level > 4) appendTo(out[out.length - 1], s);
  }
  return out;
}

function parseGearFr(secs: Section[]): SrdEntry[] {
  const out: SrdEntry[] = [];
  for (const s of secs) {
    if (s.level !== 4) {
      appendTo(out[out.length - 1], s);
      continue;
    }
    const m = s.title.match(/^(.*?)\s*\(([^)]+)\)$/);
    const name = m ? m[1] : s.title;
    const cost = m ? m[2] : '';
    out.push({ id: `fr-gear-${slug(name)}`, type: 'gear', name, meta: cost, body: s.lines.join('\n').trim(), extra: { cost } });
  }
  return out;
}

// ---------- Traductions armes / armures ----------
export const WEAPONS_FR: Record<string, string> = {
  Club: 'Gourdin', Dagger: 'Dague', Greatclub: 'Massue', Handaxe: 'Hachette', Javelin: 'Javeline', 'Light Hammer': 'Marteau léger',
  Mace: 'Masse d’armes', Quarterstaff: 'Bâton de combat', Sickle: 'Serpe', Spear: 'Lance', Dart: 'Fléchette', 'Light Crossbow': 'Arbalète légère',
  Shortbow: 'Arc court', Sling: 'Fronde', Battleaxe: 'Hache d’armes', Flail: 'Fléau d’armes', Glaive: 'Coutille', Greataxe: 'Hache à deux mains',
  Greatsword: 'Épée à deux mains', Halberd: 'Hallebarde', Lance: 'Lance d’arçon', Longsword: 'Épée longue', Maul: 'Maillet d’armes',
  Morningstar: 'Morgenstern', Pike: 'Pique', Rapier: 'Rapière', Scimitar: 'Cimeterre', Shortsword: 'Épée courte', Trident: 'Trident',
  Warhammer: 'Marteau de guerre', 'War Pick': 'Pic de guerre', Whip: 'Fouet', Blowgun: 'Sarbacane', 'Hand Crossbow': 'Arbalète de poing',
  'Heavy Crossbow': 'Arbalète lourde', Longbow: 'Arc long', Musket: 'Mousquet', Pistol: 'Pistolet',
};
export const ARMOR_FR: Record<string, string> = {
  'Padded Armor': 'Armure matelassée', 'Leather Armor': 'Armure de cuir', 'Studded Leather Armor': 'Armure de cuir clouté',
  'Hide Armor': 'Armure de peaux', 'Chain Shirt': 'Chemise de mailles', 'Scale Mail': 'Armure d’écailles', Breastplate: 'Cuirasse',
  'Half Plate Armor': 'Demi-plate', 'Ring Mail': 'Broigne', 'Chain Mail': 'Cotte de mailles', 'Splint Armor': 'Clibanion',
  'Plate Armor': 'Harnois', Shield: 'Bouclier',
};
const DMG_FR: Record<string, string> = {
  Acid: 'acide', Bludgeoning: 'contondants', Cold: 'froid', Fire: 'feu', Force: 'force', Lightning: 'foudre', Necrotic: 'nécrotiques',
  Piercing: 'perforants', Poison: 'poison', Psychic: 'psychiques', Radiant: 'radiants', Slashing: 'tranchants', Thunder: 'tonnerre',
};
const PROP_FR: [RegExp, string][] = [
  [/Ammunition/g, 'Munitions'], [/Finesse/g, 'Finesse'], [/Heavy/g, 'Lourde'], [/Light/g, 'Légère'], [/Loading/g, 'Chargement'],
  [/Reach/g, 'Allonge'], [/Thrown/g, 'Lancer'], [/Two-Handed/g, 'Deux mains'], [/Versatile/g, 'Polyvalente'], [/Range/g, 'portée'],
  [/Arrow/g, 'flèches'], [/Bolt/g, 'carreaux'], [/Bullet, Firearm/g, 'balles'], [/Bullet, Sling/g, 'billes'], [/Needle/g, 'dards'],
  [/\(unless mounted\)/g, '(sauf à cheval)'],
];
const MASTERY_FR: Record<string, string> = { Cleave: 'Enchaînement', Graze: 'Écorchure', Nick: 'Coup double', Push: 'Poussée', Sap: 'Sape', Slow: 'Ralentissement', Topple: 'Renversement', Vex: 'Ouverture' };
const CAT_FR: Record<string, string> = {
  'Simple Melee Weapons': 'Armes courantes de corps à corps', 'Simple Ranged Weapons': 'Armes courantes à distance',
  'Martial Melee Weapons': 'Armes de guerre de corps à corps', 'Martial Ranged Weapons': 'Armes de guerre à distance',
};
const ftToM = (s: string) => s.replace(/(\d+)\/(\d+)/g, (_, a, b) => `${fmtNum(a * 0.3)}/${fmtNum(b * 0.3)}`);
const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const costFr = (c: string) => c.replace('GP', 'po').replace('SP', 'pa').replace('CP', 'pc');
const weightFr = (w: string) => {
  const m = w.match(/(\d+)(?:\/(\d+))?\s*lb/);
  if (!m) return w;
  const lb = m[2] ? +m[1] / +m[2] : +m[1];
  return `${fmtNum(lb / 2)} kg`;
};

export function translateArms(en: SrdEntry[]): SrdEntry[] {
  const out: SrdEntry[] = [];
  for (const e of en) {
    const x = e.extra ?? {};
    if (e.type === 'weapon' && WEAPONS_FR[e.name]) {
      const [dice, type] = (x.damage ?? '').split(' ');
      const damage = `${dice} ${DMG_FR[type] ?? type ?? ''}`.trim();
      let props = x.properties ?? '';
      for (const [re, fr] of PROP_FR) props = props.replace(re, fr);
      props = ftToM(props).replace(/;/g, ' ;');
      const mastery = MASTERY_FR[x.mastery ?? ''] ?? x.mastery ?? '';
      const category = CAT_FR[x.category ?? ''] ?? x.category ?? '';
      out.push({
        id: `fr-${e.id}`,
        type: 'weapon',
        name: WEAPONS_FR[e.name],
        meta: `${category} — ${damage}`,
        body: `**Dégâts :** ${damage}\n**Propriétés :** ${props}\n**Botte d’arme :** ${mastery}\n**Poids :** ${weightFr(x.weight ?? '')}\n**Prix :** ${costFr(x.cost ?? '')}`,
        extra: { ...x, damage, damageEn: x.damage ?? '', properties: props, propertiesEn: x.properties ?? '', mastery, masteryEn: x.mastery ?? '', weight: weightFr(x.weight ?? ''), weightLb: x.weight ?? '', cost: costFr(x.cost ?? ''), category, categoryEn: x.category ?? '', en: e.name },
      });
    } else if (e.type === 'armor' && ARMOR_FR[e.name]) {
      const ac = (x.ac ?? '').replace('Dex modifier', 'modificateur de Dex');
      out.push({
        id: `fr-${e.id}`,
        type: 'armor',
        name: ARMOR_FR[e.name],
        meta: `CA ${ac}`,
        body: `**CA :** ${ac}\n**Force :** ${x.strength === '—' ? '—' : (x.strength ?? '').replace('Str', 'For')}\n**Discrétion :** ${x.stealth === 'Disadvantage' ? 'Désavantage' : x.stealth}\n**Poids :** ${weightFr(x.weight ?? '')}\n**Prix :** ${costFr(x.cost ?? '')}`,
        extra: { ...x, ac, weight: weightFr(x.weight ?? ''), weightLb: x.weight ?? '', cost: costFr(x.cost ?? ''), en: e.name },
      });
    }
  }
  return out;
}

export function buildIndexFr(md: string, en: SrdEntry[]): SrdEntry[] {
  const all = sections(md);
  const h = (lvl: number, title: string) => (s: Section) => s.level === lvl && s.title.startsWith(title);
  const nextChapter = (s: Section) => s.level === 1;
  const nextH2 = (s: Section) => s.level <= 2;
  const entries = [
    ...parseSpellsFr(between(all, h(2, 'Description des sorts'), nextChapter)),
    ...parseMetaEntries(between(all, h(2, 'Objets magiques de A à Z'), nextChapter), 'magic-item', 'fr-mi'),
    ...parseMetaEntries(between(all, h(1, 'Dons'), nextChapter), 'feat', 'fr-feat'),
    ...parseRulesFr(between(all, h(2, 'Définitions des règles'), nextChapter)),
    ...parseGearFr(between(all, h(2, 'Matériel d’aventurier'), nextH2)),
    ...translateArms(en),
  ];
  return entries.map((e) => ({ ...e, lang: 'fr' as const }));
}
