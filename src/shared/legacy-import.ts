// Import JSON : format natif (export Grimoire) ou format libre en français (type braillann.json).
import { CharacterSchema, SCHEMA_VERSION, type Character, uid } from './schema';
import { abilityMod } from './rules';
import { ABILITIES, findAbility, findClass, findSkill, norm, type Ability } from './srd-fr';

type Any = Record<string, any>;

export type ImportResult = { character: Character; format: 'native' | 'legacy'; warnings: string[] };

export function importCharacterJson(raw: unknown): ImportResult {
  if (!raw || typeof raw !== 'object') throw new Error("Le fichier n'est pas un objet JSON.");
  const obj = raw as Any;
  if (obj.format === 'grimoire-dd' && obj.character) {
    return { character: CharacterSchema.parse(obj.character), format: 'native', warnings: [] };
  }
  if (obj.schemaVersion === SCHEMA_VERSION && obj.identity) {
    return { character: CharacterSchema.parse(obj), format: 'native', warnings: [] };
  }
  if (obj.personnage || obj.caracteristiques || obj.combat?.points_de_vie_max != null) {
    return fromLegacy(obj);
  }
  throw new Error('Format de fiche non reconnu.');
}

const toInt = (v: unknown, d = 0) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.trunc(n) : d;
};

/** "3+2" → 5 */
const sumExpr = (v: unknown) =>
  String(v ?? '0')
    .replace(/\s/g, '')
    .split(/(?=[+-])/)
    .reduce((s, p) => s + (parseInt(p, 10) || 0), 0);

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : [];

function fromLegacy(o: Any): ImportResult {
  const warnings: string[] = [];
  const p = o.personnage ?? {};
  const car = o.caracteristiques ?? {};
  const combat = o.combat ?? {};

  const abilities: Record<Ability, number> = { for: 10, dex: 10, con: 10, int: 10, sag: 10, cha: 10 };
  for (const [k, v] of Object.entries(car)) {
    const a = findAbility(k);
    if (!a) continue;
    abilities[a] = toInt(typeof v === 'object' && v ? (v as Any).valeur : v, 10);
  }

  const cls = findClass(p.classe ?? '');
  const level = toInt(p.niveau, 1);
  const classes = p.classe
    ? [{ id: uid(), name: cls?.name ?? p.classe, subclass: p.sous_classe ?? '', level, hitDie: (combat.des_de_vie?.type ?? cls?.hitDie ?? 'd8') as any }]
    : [];

  const savingThrows = asList(o.jets_de_sauvegarde_maitrises)
    .map((s) => findAbility(s))
    .filter((a): a is Ability => !!a);

  const skills: Record<string, { prof: 0 | 1 | 2; bonus: number }> = {};
  for (const s of asList(o.competences_maitrisees)) {
    const k = findSkill(s);
    if (k) skills[k.key] = { prof: 1, bonus: 0 };
    else warnings.push(`Compétence inconnue : ${s}`);
  }
  for (const s of asList(o.competences_expertise)) {
    const k = findSkill(s);
    if (k) skills[k.key] = { prof: 2, bonus: 0 };
  }

  const dexMod = abilityMod(abilities.dex);
  const hpMax = toInt(combat.points_de_vie_max, 1);
  const pb = toInt(o.bonus_maitrise, 0);

  const attacks = (Array.isArray(o.attaques) ? o.attaques : []).map((a: Any) => ({
    id: uid(),
    name: a.nom ?? '',
    ability: 'none',
    proficient: false,
    toHitBonus: sumExpr(a.bonus_attaque),
    damage: a.degats ?? '1d6',
    addAbilityToDamage: false,
    damageBonus: 0,
    damageType: a.type ? cap(a.type) : '',
    notes: a.note ?? '',
  }));
  if (attacks.length) warnings.push("Attaques importées avec un bonus fixe : choisissez la caractéristique dans la vue Édition pour un calcul automatique.");

  const features: Any[] = [];
  const resources: Any[] = [];
  for (const c of Array.isArray(o.capacites) ? o.capacites : []) {
    const desc = [...asList(c.effets), c.note ? `Note : ${c.note}` : ''].filter(Boolean).join('\n');
    features.push({ id: uid(), name: c.nom ?? '', source: cls?.name ?? '', description: desc });
    if (c.utilisations != null) resources.push({ id: uid(), name: c.nom, max: toInt(c.utilisations, 1), used: 0, recharge: 'long' });
  }

  const m = o.maitrises ?? {};
  const inventory = asList(o.equipement).map((line) => {
    const mm = line.match(/^(\d+)\s+(.*)$/);
    return { id: uid(), name: mm ? mm[2] : line, qty: mm ? parseInt(mm[1], 10) : 1, weight: 0, equipped: false, attuned: false, notes: '' };
  });

  const perso = o.personnalite ?? {};
  const ch = CharacterSchema.parse({
    identity: {
      name: p.nom ?? 'Personnage importé',
      player: p.joueur ?? '',
      species: p.espece ?? '',
      background: p.historique ?? '',
      alignment: p.alignement ?? '',
      xp: toInt(p.points_experience, 0),
    },
    classes,
    abilities,
    savingThrows,
    skills,
    overrides: {
      proficiencyBonus: pb && pb !== 2 + Math.floor((Math.max(1, level) - 1) / 4) ? pb : null,
      passivePerception: o.perception_passive_notee != null ? toInt(o.perception_passive_notee) : null,
    },
    combat: {
      ac: toInt(combat.classe_armure, 10),
      initiativeBonus: combat.initiative != null ? toInt(combat.initiative) - dexMod : 0,
      speed: Number(combat.vitesse_m ?? 9),
      hpMax,
      hpCurrent: combat.points_de_vie_actuels != null ? toInt(combat.points_de_vie_actuels) : hpMax,
      hpTemp: 0,
      hitDice: combat.des_de_vie ? [{ die: combat.des_de_vie.type ?? 'd8', total: toInt(combat.des_de_vie.nombre, level), used: 0 }] : [],
      heroicInspiration: typeof o.inspiration === 'boolean' ? (o.inspiration ? 1 : 0) : Math.max(0, toInt(o.inspiration, 0)),
    },
    attacks,
    features,
    resources,
    proficiencies: {
      armor: asList(m.armures),
      weapons: asList(m.armes),
      tools: asList(m.outils_instruments ?? m.outils),
      languages: asList(m.langues),
    },
    inventory,
    coins: o.monnaie ?? {},
    personality: {
      traits: asList(perso.traits).join(', '),
      ideals: asList(perso.ideal ?? perso.ideaux).join('\n'),
      bonds: asList(perso.lien ?? perso.liens).join('\n'),
      flaws: asList(perso.defaut ?? perso.defauts).join('\n'),
      backstory: perso.histoire ?? '',
    },
    allies: (Array.isArray(o.allies) ? o.allies : []).map((a: Any) => ({ name: a.nom ?? String(a), notes: a.classe ?? a.notes ?? '' })),
    notes: asList(o.notes_diverses ?? o.notes).join('\n'),
    toVerify: asList(o.a_verifier),
  });

  // Signale les écarts entre valeurs notées et valeurs calculées.
  for (const [k, v] of Object.entries(car)) {
    const a = findAbility(k);
    if (!a || typeof v !== 'object' || !v) continue;
    const noted = (v as Any).modificateur ?? (v as Any).modificateur_note;
    if (noted != null && toInt(noted) !== abilityMod(abilities[a])) {
      warnings.push(`${k} ${abilities[a]} : modificateur noté ${noted}, calculé ${abilityMod(abilities[a])}.`);
    }
  }
  return { character: ch, format: 'legacy', warnings };
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export { ABILITIES, norm };
