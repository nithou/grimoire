// Différences lisibles entre deux versions d'une fiche, pour le journal des modifications.
import type { Character } from './schema';
import { ABILITY_LABELS, SKILLS, COINS, type Ability } from './srd-fr';

export type Change = { path: string; label: string; before: string; after: string };

const LABELS: Record<string, string> = {
  'identity.name': 'Nom', 'identity.player': 'Joueur', 'identity.species': 'Espèce', 'identity.background': 'Historique',
  'identity.alignment': 'Alignement', 'identity.xp': 'PX', 'identity.size': 'Taille', 'identity.age': 'Âge',
  'identity.appearance': 'Apparence', 'identity.portrait': 'Portrait',
  'combat.ac': 'CA', 'combat.acNote': 'Détail de la CA', 'combat.initiativeBonus': "Bonus d'initiative", 'combat.speed': 'Vitesse',
  'combat.hpMax': 'PV max', 'combat.hpCurrent': 'PV', 'combat.hpTemp': 'PV temporaires', 'combat.conditions': 'États',
  'combat.exhaustion': 'Épuisement', 'combat.heroicInspiration': 'Inspiration',
  'combat.deathSaves.success': 'JdS contre la mort (réussites)', 'combat.deathSaves.failure': 'JdS contre la mort (échecs)',
  'savingThrows': 'Sauvegardes maîtrisées', 'saveBonus': 'Bonus aux JS',
  'overrides.proficiencyBonus': 'Bonus de maîtrise (forcé)', 'overrides.passivePerception': 'Perception passive (forcée)', 'overrides.initiative': 'Initiative (forcée)',
  'spellcasting.ability': "Caractéristique d'incantation",
  'proficiencies.armor': 'Maîtrises d’armures', 'proficiencies.weapons': 'Maîtrises d’armes', 'proficiencies.tools': 'Outils', 'proficiencies.languages': 'Langues',
  'personality.traits': 'Traits', 'personality.ideals': 'Idéaux', 'personality.bonds': 'Liens', 'personality.flaws': 'Défauts', 'personality.backstory': 'Histoire',
  notes: 'Notes', toVerify: 'Points à vérifier', images: 'Images',
};
for (const a of Object.keys(ABILITY_LABELS) as Ability[]) LABELS[`abilities.${a}`] = ABILITY_LABELS[a].long;
for (const c of COINS) LABELS[`coins.${c.key}`] = c.label;

/** Collections d'objets identifiés : libellé de la collection, nom d'un élément et champs suivis. */
const COLLECTIONS: Record<string, { label: string; name: (x: any) => string; fields: Record<string, string> }> = {
  inventory: { label: 'Inventaire', name: (x) => x.name || 'objet', fields: { qty: 'quantité', name: 'nom', equipped: 'équipé', attuned: 'harmonisé', value: 'valeur', notes: 'description', weight: 'poids', containerId: 'contenant' } },
  attacks: { label: 'Attaques', name: (x) => x.name || 'attaque', fields: { name: 'nom', count: 'nombre', damage: 'dégâts', toHitBonus: 'bonus au toucher', ability: 'caractéristique' } },
  resources: { label: 'Ressources', name: (x) => x.name || 'ressource', fields: { used: 'dépensées', max: 'maximum', name: 'nom', description: 'description' } },
  features: { label: 'Aptitudes', name: (x) => x.name || 'aptitude', fields: { name: 'nom', description: 'description', source: 'source' } },
  classes: { label: 'Classes', name: (x) => x.name || 'classe', fields: { level: 'niveau', subclass: 'sous-classe', name: 'nom' } },
  allies: { label: 'Alliés', name: (x) => x.name || 'allié', fields: { name: 'nom', notes: 'notes' } },
  containers: { label: 'Contenants', name: (x) => x.name || 'contenant', fields: { name: 'nom' } },
  'spellcasting.spells': { label: 'Sorts', name: (x) => x.name || 'sort', fields: { prepared: 'préparé', name: 'nom', level: 'niveau' } },
};

const fmt = (v: unknown): string => {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};
const isLongText = (a: unknown, b: unknown) => (typeof a === 'string' && a.length > 60) || (typeof b === 'string' && b.length > 60);

function get(obj: any, path: string) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Liste lisible des différences entre deux versions d'une fiche. */
export function diffCharacters(before: Character | null, after: Character): Change[] {
  if (!before) return [];
  const out: Change[] = [];

  // Champs simples et listes de chaînes
  for (const [path, label] of Object.entries(LABELS)) {
    const a = get(before, path);
    const b = get(after, path);
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (Array.isArray(a) || Array.isArray(b)) {
      const A = (a ?? []) as unknown[];
      const B = (b ?? []) as unknown[];
      const added = B.filter((x) => !A.includes(x));
      const removed = A.filter((x) => !B.includes(x));
      if (path === 'images') {
        out.push({ path, label, before: `${A.length}`, after: `${B.length}` });
        continue;
      }
      out.push({ path, label, before: removed.length ? `− ${fmt(removed)}` : '', after: added.length ? `+ ${fmt(added)}` : '' });
      continue;
    }
    if (path === 'identity.portrait') {
      out.push({ path, label, before: a ? 'image' : '—', after: b ? 'nouvelle image' : '—' });
      continue;
    }
    out.push({ path, label, before: isLongText(a, b) ? '' : fmt(a), after: isLongText(a, b) ? '(texte modifié)' : fmt(b) });
  }

  // Compétences
  for (const s of SKILLS) {
    const a = before.skills[s.key] ?? { prof: 0, bonus: 0 };
    const b = after.skills[s.key] ?? { prof: 0, bonus: 0 };
    const lv = ['—', 'maîtrise', 'expertise'];
    if (a.prof !== b.prof) out.push({ path: `skills.${s.key}.prof`, label: s.label, before: lv[a.prof], after: lv[b.prof] });
    if (a.bonus !== b.bonus) out.push({ path: `skills.${s.key}.bonus`, label: `${s.label} (bonus)`, before: fmt(a.bonus), after: fmt(b.bonus) });
  }

  // Emplacements de sorts
  for (let lvl = 1; lvl <= 9; lvl++) {
    const a = before.spellcasting.slots.find((x) => x.level === lvl);
    const b = after.spellcasting.slots.find((x) => x.level === lvl);
    if ((a?.used ?? 0) !== (b?.used ?? 0)) out.push({ path: `slots.${lvl}.used`, label: `Emplacements niv. ${lvl} dépensés`, before: fmt(a?.used ?? 0), after: fmt(b?.used ?? 0) });
    if ((a?.max ?? 0) !== (b?.max ?? 0)) out.push({ path: `slots.${lvl}.max`, label: `Emplacements niv. ${lvl}`, before: fmt(a?.max ?? 0), after: fmt(b?.max ?? 0) });
  }

  // Dés de vie
  if (JSON.stringify(before.combat.hitDice) !== JSON.stringify(after.combat.hitDice)) {
    const show = (h: Character['combat']['hitDice']) => h.map((d) => `${d.total - d.used}/${d.total}${d.die}`).join(' + ') || '—';
    out.push({ path: 'combat.hitDice', label: 'Dés de vie', before: show(before.combat.hitDice), after: show(after.combat.hitDice) });
  }

  // Collections identifiées
  for (const [path, def] of Object.entries(COLLECTIONS)) {
    const A = (get(before, path) ?? []) as any[];
    const B = (get(after, path) ?? []) as any[];
    const byId = (arr: any[]) => new Map(arr.map((x) => [x.id ?? JSON.stringify(x), x]));
    const mA = byId(A);
    const mB = byId(B);
    for (const [id, b] of mB) {
      const a = mA.get(id);
      if (!a) {
        const qty = path === 'inventory' && b.qty !== 1 ? ` ×${b.qty}` : '';
        out.push({ path: `${path}.${id}`, label: def.label, before: '', after: `+ ${def.name(b)}${qty}` });
        continue;
      }
      for (const [f, fl] of Object.entries(def.fields)) {
        if (JSON.stringify(a[f]) === JSON.stringify(b[f])) continue;
        let va = a[f];
        let vb = b[f];
        if (f === 'containerId') {
          const name = (cid: string, src: Character) => (cid ? src.containers.find((c) => c.id === cid)?.name ?? 'contenant' : 'Sac principal');
          va = name(va, before);
          vb = name(vb, after);
        }
        out.push({ path: `${path}.${id}.${f}`, label: `${def.name(b)} (${fl})`, before: isLongText(va, vb) ? '' : fmt(va), after: isLongText(va, vb) ? '(texte modifié)' : fmt(vb) });
      }
    }
    for (const [id, a] of mA) if (!mB.has(id)) out.push({ path: `${path}.${id}`, label: def.label, before: `− ${def.name(a)}`, after: '' });
  }
  return out;
}

/** Fusionne deux listes de changements successifs (garde la valeur initiale et la valeur finale). */
export function mergeChanges(older: Change[], newer: Change[]): Change[] {
  const map = new Map(older.map((c) => [c.path, { ...c }]));
  for (const c of newer) {
    const prev = map.get(c.path);
    if (prev) {
      // Ajout puis retrait d'un même élément de collection : le changement s'annule.
      if (prev.after.startsWith('+ ') && c.before.startsWith('− ')) map.delete(c.path);
      else map.set(c.path, { ...c, before: prev.before });
    } else map.set(c.path, { ...c });
  }
  return [...map.values()].filter((c) => c.before !== c.after);
}
