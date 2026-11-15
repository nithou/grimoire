// Heuristiques pour extraire des valeurs d'un texte OCR de fiche de personnage.
import { ABILITY_LABELS, ABILITIES, CLASSES, SPECIES, SKILLS, norm, type Ability } from './srd-fr';

export type OcrSuggestion = {
  key: string; // identifiant unique
  label: string; // libellé lisible
  path: string; // chemin dans la fiche, ex. "abilities.for"
  value: string | number;
};

const ABILITY_PATTERNS: Record<Ability, string> = {
  for: '(?:for(?:ce)?|str(?:ength)?)',
  dex: '(?:dex(?:t[eé]rit[eé]|terity)?)',
  con: '(?:con(?:stitution)?)',
  int: '(?:int(?:elligence)?)',
  sag: '(?:sag(?:esse)?|wis(?:dom)?)',
  cha: '(?:cha(?:risme|risma)?)',
};

export function parseOcrText(text: string): OcrSuggestion[] {
  const out: OcrSuggestion[] = [];
  const t = text.replace(/\r/g, '');
  const n = norm(t);
  const add = (s: OcrSuggestion) => {
    if (!out.some((o) => o.path === s.path)) out.push(s);
  };

  for (const a of ABILITIES) {
    const re = new RegExp(`\\b${ABILITY_PATTERNS[a]}\\b[^\\d\\n]{0,12}(\\d{1,2})\\b`, 'i');
    const m = n.match(re);
    if (m) {
      const v = parseInt(m[1], 10);
      if (v >= 1 && v <= 30) add({ key: `ab-${a}`, label: ABILITY_LABELS[a].long, path: `abilities.${a}`, value: v });
    }
  }

  const ac = n.match(/\b(?:ca|classe d'armure|armor class|ac)\b[^\d\n]{0,8}(\d{1,2})\b/);
  if (ac) add({ key: 'ac', label: "Classe d'armure", path: 'combat.ac', value: parseInt(ac[1], 10) });

  const hp = n.match(/\b(?:pv|points de vie|hit points|hp)(?: max(?:imum)?)?\b[^\d\n]{0,10}(\d{1,3})\b/);
  if (hp) add({ key: 'hp', label: 'PV max', path: 'combat.hpMax', value: parseInt(hp[1], 10) });

  const spd = n.match(/\b(?:vitesse|speed)\b[^\d\n]{0,6}(\d{1,2}(?:[.,]\d)?)\s*(m|ft|pieds)?/);
  if (spd) {
    let v = parseFloat(spd[1].replace(',', '.'));
    if (spd[2] === 'ft' || spd[2] === 'pieds' || v > 20) v = Math.round((v / 5) * 1.5 * 10) / 10;
    add({ key: 'speed', label: 'Vitesse (m)', path: 'combat.speed', value: v });
  }

  const lvl = n.match(/\b(?:niveau|level|niv\.?)\s*[:\-]?\s*(\d{1,2})\b/);
  if (lvl) add({ key: 'level', label: 'Niveau', path: 'classes.0.level', value: parseInt(lvl[1], 10) });

  const xp = n.match(/\b(?:px|xp|points d'experience|experience points)\b[^\d\n]{0,6}(\d{1,6})\b/);
  if (xp) add({ key: 'xp', label: "Points d'expérience", path: 'identity.xp', value: parseInt(xp[1], 10) });

  for (const c of CLASSES) {
    if (new RegExp(`\\b(${norm(c.name)}|${norm(c.en)})\\b`).test(n)) {
      add({ key: 'class', label: 'Classe', path: 'classes.0.name', value: c.name });
      break;
    }
  }
  for (const s of SPECIES) {
    if (new RegExp(`\\b${norm(s)}\\b`).test(n)) {
      add({ key: 'species', label: 'Espèce', path: 'identity.species', value: s });
      break;
    }
  }

  const name = t.match(/(?:nom du personnage|character name|nom)\s*[:\-]\s*(.+)/i);
  if (name && name[1].trim().length > 1) add({ key: 'name', label: 'Nom', path: 'identity.name', value: name[1].trim() });

  for (const coin of ['pc', 'pa', 'pe', 'po', 'pp'] as const) {
    const re = new RegExp(`(\\d{1,6})\\s*${coin}\\b|\\b${coin}\\s*[:\\-]?\\s*(\\d{1,6})\\b`);
    const m = n.match(re);
    if (m) add({ key: `coin-${coin}`, label: `Monnaie (${coin})`, path: `coins.${coin}`, value: parseInt(m[1] ?? m[2], 10) });
  }

  for (const s of SKILLS) {
    // Une compétence cochée apparaît souvent comme "● Athlétisme" / "[x] Athlétisme" / "X Athlétisme".
    const re = new RegExp(`(?:[●•■☒✓✔x]|\\[x\\]|\\(x\\))\\s*[+\\-]?\\d{0,2}\\s*${norm(s.label)}\\b`);
    if (re.test(n)) add({ key: `skill-${s.key}`, label: `Maîtrise : ${s.label}`, path: `skills.${s.key}.prof`, value: 1 });
  }
  return out;
}

/** Applique une suggestion (chemin pointé) à un objet fiche. Crée les intermédiaires si besoin. */
export function applyPath(obj: any, path: string, value: unknown) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const nextIsIndex = /^\d+$/.test(parts[i + 1]);
    if (cur[k] == null) cur[k] = nextIsIndex ? [] : {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

// ---------- Qualité et nettoyage du texte OCR ----------

/** Score de lisibilité : nombre de « vrais » mots (4+ lettres contenant une voyelle). */
export function scoreOcrText(text: string): number {
  return (text.match(/[\p{L}'’]{4,}/gu) ?? []).filter((w) => /[aeiouyàâéèêëîïôûù]/i.test(w)).length;
}

const isJunkToken = (t: string) => !/[\p{L}\p{N}]/u.test(t) || (/^[\p{L}]$/u.test(t) && !/^[àaÀAyY]$/.test(t));
/** Mots courts légitimes en fin de ligne (phrase coupée par le retour à la ligne). */
const SHORT_OK = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'un', 'et', 'à', 'en', 'tu', 'il', 'on', 'ne', 'se', 'sa', 'ce', 'ou', 'au', 'je', 'me', 'te', 'ta', 'ma', 'son', 'ton', 'mon', 'qui', 'que', 'est', 'par', 'sur', 'pas', 'une', 'dans']);
const hasOddChars = (t: string) => /[^\p{L}\p{N}.,;:!?'’()«»\-–/+]/u.test(t);
const isTrailingJunk = (t: string) => hasOddChars(t) || !/[\p{L}\p{N}]/u.test(t) || (t.replace(/[^\p{L}\p{N}]/gu, '').length <= 2 && !SHORT_OK.has(t.toLowerCase().replace(/[^\p{L}]/gu, '')));

/** Retire les lignes de bruit (décor, doigts, bords de carte) et les symboles parasites en début/fin de ligne. */
export function cleanOcrText(text: string): string {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    while (tokens.length > 2 && (isJunkToken(tokens[0]) || hasOddChars(tokens[0]))) tokens.shift();
    while (tokens.length > 1 && isTrailingJunk(tokens[tokens.length - 1])) tokens.pop();
    const line = tokens.join(' ');
    const letters = (line.match(/\p{L}/gu) ?? []).length;
    if (letters < 3 || letters / Math.max(1, line.replace(/\s/g, '').length) < 0.55) continue;
    const score = scoreOcrText(line);
    if (score < 2 && !(score >= 1 && /\d/.test(line))) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

export type OcrCard = { title: string; description: string; usage?: { max: number; recharge: 'short' | 'long' } };

/**
 * Lecture d'une carte (objet, aptitude, sort) : titre en capitales, usage « 1 / repos long », description.
 */
export function parseCard(text: string): OcrCard | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const usageM = text.match(/(\d+)\s*\/\s*repos\s+(long|court)/i);
  const usage = usageM ? { max: parseInt(usageM[1], 10), recharge: (usageM[2].toLowerCase() === 'court' ? 'short' : 'long') as 'short' | 'long' } : undefined;

  const isCaps = (l: string) => {
    const letters = l.match(/\p{L}/gu) ?? [];
    const upper = l.match(/\p{Lu}/gu) ?? [];
    return letters.length >= 6 && upper.length / letters.length > 0.75;
  };
  const titleLine = lines.find((l) => isCaps(l) && !/usage|d[ée]clench/i.test(l));
  const title = titleLine
    ? titleLine
        .split(/\s+/)
        .filter((w) => /^\p{L}[\p{L}'’-]*$/u.test(w) && (w.length > 2 || /^(DU|DE|LA|LE|D'|L')$/i.test(w)))
        .map((w, i) => (i === 0 ? w[0] + w.slice(1).toLowerCase() : w.toLowerCase()))
        .join(' ')
    : '';

  // Description : à partir de la première ligne de prose (majorité de minuscules, 5+ mots).
  const isProse = (l: string) => l.split(/\s+/).length >= 6 && !/\d+\s*\/\s*repos/i.test(l) && (l.match(/\p{Ll}/gu) ?? []).length > (l.match(/\p{L}/gu) ?? []).length * 0.6;
  const start = lines.findIndex(isProse);
  let description = '';
  if (start >= 0) {
    for (const l of lines.slice(start)) {
      if (!description) description = l;
      else if (/-$/.test(description)) description = description.slice(0, -1) + l;
      else description += ' ' + l;
    }
  }
  if (!title && !description) return null;
  return { title, description, usage };
}
