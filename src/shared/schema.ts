import { z } from 'zod';
import { ABILITIES } from './srd-fr';

export const SCHEMA_VERSION = 1;

/** Identifiant court, compatible avec les contextes non sécurisés (pas de crypto.randomUUID). */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const str = z.string().default('');
const int = (d = 0) => z.coerce.number().int().catch(d).default(d);
const num = (d = 0) => z.coerce.number().catch(d).default(d);
const bool = z.boolean().catch(false).default(false);
const id = z.string().default(() => uid());
const strList = z.array(z.string()).catch([]).default([]);

export const AbilityEnum = z.enum(ABILITIES);
export const AttackAbility = z.enum([...ABILITIES, 'none', 'finesse', 'spell']);

const abilityScores = z
  .object(Object.fromEntries(ABILITIES.map((a) => [a, int(10)])) as Record<(typeof ABILITIES)[number], ReturnType<typeof int>>)
  .prefault({});

export const SkillState = z
  .object({
    prof: z.union([z.literal(0), z.literal(1), z.literal(2)]).catch(0).default(0),
    bonus: int(0),
  })
  .prefault({});

export const ClassEntry = z
  .object({
    id,
    name: str,
    subclass: str,
    level: int(1),
    hitDie: z.enum(['d6', 'd8', 'd10', 'd12']).catch('d8').default('d8'),
  })
  .prefault({});

export const HitDicePool = z
  .object({ die: z.enum(['d6', 'd8', 'd10', 'd12']).catch('d8').default('d8'), total: int(1), used: int(0) })
  .prefault({});

export const Attack = z
  .object({
    id,
    name: str,
    ability: AttackAbility.catch('for').default('for'),
    proficient: z.boolean().catch(true).default(true),
    toHitBonus: int(0),
    damage: z.string().default('1d6'),
    addAbilityToDamage: z.boolean().catch(true).default(true),
    damageBonus: int(0),
    damageType: str,
    mastery: str,
    range: str,
    notes: str,
    /** Nombre d'exemplaires (armes de jet, javelines…) ; null = non suivi. */
    count: z.number().int().min(0).nullable().catch(null).default(null),
    /** Arme en main / équipée (les anciennes fiches sont considérées équipées). */
    equipped: z.boolean().catch(true).default(true),
  })
  .prefault({});

export const Spell = z
  .object({
    id,
    name: str,
    level: int(0),
    prepared: bool,
    alwaysPrepared: bool,
    srdName: str,
    notes: str,
    /** Sort à concentration. */
    concentration: bool,
  })
  .prefault({});

export const SpellSlot = z.object({ level: int(1), max: int(0), used: int(0) }).prefault({});

export const Resource = z
  .object({
    id,
    name: str,
    max: int(1),
    used: int(0),
    recharge: z.enum(['short', 'long', 'none']).catch('long').default('long'),
    description: str,
  })
  .prefault({});

export const FEATURE_KINDS = ['action', 'bonus', 'reaction', 'passive', 'other'] as const;
export const FEATURE_CATEGORIES = ['feature', 'feat'] as const;
export const Feature = z
  .object({
    id,
    name: str,
    source: str,
    description: str,
    kind: z.enum(FEATURE_KINDS).catch('other').default('other'),
    /** Aptitude (classe, espèce…) ou don. */
    category: z.enum(FEATURE_CATEGORIES).catch('feature').default('feature'),
    /** Pour un don : Origine, Général, Style de combat, Faveur épique. */
    featType: str,
  })
  .prefault({});

/**
 * Effet activable (Rage, Témérité, Bénédiction…) : appliqué aux valeurs calculées tant qu'il est actif.
 * Les effets actifs prennent fin aux repos.
 */
export const Effect = z
  .object({
    id,
    name: str,
    notes: str,
    active: bool,
    /** Ressource dont une utilisation est dépensée à l'activation ('' = aucune). */
    resourceId: str,
    acBonus: int(0),
    toHitBonus: int(0),
    damageBonus: int(0),
    saveBonus: int(0),
    /** Bonus aux dégâts et avantage aux attaques limités aux attaques utilisant la Force. */
    strOnly: bool,
    advChecks: z.array(AbilityEnum).catch([]).default([]),
    advSaves: z.array(AbilityEnum).catch([]).default([]),
    advAttacks: bool,
    resistances: strList,
  })
  .prefault({});

export const Item = z
  .object({
    id,
    name: str,
    qty: num(1),
    weight: num(0),
    equipped: bool,
    attuned: bool,
    /** Valeur marchande libre, ex. « 25 po ». */
    value: str,
    /** Description de l'objet (anciennement « notes »). */
    notes: str,
    /** Contenant : '' = sac principal, sinon id d'un élément de `containers`. */
    containerId: str,
  })
  .prefault({});

export const CharacterSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).catch(SCHEMA_VERSION).default(SCHEMA_VERSION),
  identity: z
    .object({
      name: z.string().default('Nouveau personnage'),
      player: str,
      species: str,
      background: str,
      alignment: str,
      xp: int(0),
      size: z.string().default('M'),
      age: str,
      appearance: str,
      portrait: str, // id d'upload
    })
    .prefault({}),
  classes: z.array(ClassEntry).catch([]).default([]),
  abilities: abilityScores,
  savingThrows: z.array(AbilityEnum).catch([]).default([]),
  saveBonus: int(0),
  skills: z.record(z.string(), SkillState).catch({}).default({}),
  overrides: z
    .object({
      proficiencyBonus: z.number().int().nullable().catch(null).default(null),
      passivePerception: z.number().int().nullable().catch(null).default(null),
      initiative: z.number().int().nullable().catch(null).default(null),
    })
    .prefault({}),
  combat: z
    .object({
      ac: int(10),
      acNote: str,
      initiativeBonus: int(0),
      speed: num(9),
      hpMax: int(1),
      hpCurrent: int(1),
      hpTemp: int(0),
      hitDice: z.array(HitDicePool).catch([]).default([]),
      deathSaves: z.object({ success: int(0), failure: int(0) }).prefault({}),
      conditions: strList,
      exhaustion: int(0),
      // Compteur de points d'Inspiration (règle maison : cumulable). Les anciens booléens sont convertis.
      heroicInspiration: z.preprocess((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v), int(0)),
      /** Sort (ou effet) sur lequel le personnage se concentre ; '' = aucun. */
      concentration: str,
    })
    .prefault({}),
  /** Résistances, immunités et vulnérabilités permanentes (types de dégâts) et immunités aux états. */
  defenses: z
    .object({ resistances: strList, immunities: strList, vulnerabilities: strList, conditionImmunities: strList })
    .prefault({}),
  /** Sens spéciaux, ex. « Vision dans le noir 18 m ». */
  senses: strList,
  effects: z.array(Effect).catch([]).default([]),
  attacks: z.array(Attack).catch([]).default([]),
  spellcasting: z
    .object({
      ability: AbilityEnum.nullable().catch(null).default(null),
      slots: z.array(SpellSlot).catch([]).default([]),
      spells: z.array(Spell).catch([]).default([]),
    })
    .prefault({}),
  resources: z.array(Resource).catch([]).default([]),
  features: z.array(Feature).catch([]).default([]),
  proficiencies: z
    .object({ armor: strList, weapons: strList, tools: strList, languages: strList })
    .prefault({}),
  inventory: z.array(Item).catch([]).default([]),
  /** Contenants supplémentaires (sacs, coffres…) ; le sac principal est implicite. */
  containers: z.array(z.object({ id, name: z.string().default('Nouveau sac') }).prefault({})).catch([]).default([]),
  coins: z.object({ pc: int(0), pa: int(0), pe: int(0), po: int(0), pp: int(0) }).prefault({}),
  personality: z
    .object({ traits: str, ideals: str, bonds: str, flaws: str, backstory: str })
    .prefault({}),
  allies: z.array(z.object({ id, name: str, notes: str }).prefault({})).catch([]).default([]),
  notes: str,
  toVerify: strList,
  images: strList, // ids d'upload joints à la fiche
});

export type Character = z.infer<typeof CharacterSchema>;
export type AttackT = z.infer<typeof Attack>;
export type SpellT = z.infer<typeof Spell>;
export type ResourceT = z.infer<typeof Resource>;
export type ItemT = z.infer<typeof Item>;
export type FeatureT = z.infer<typeof Feature>;
export type EffectT = z.infer<typeof Effect>;

export function blankCharacter(name?: string): Character {
  const c = CharacterSchema.parse({});
  if (name) c.identity.name = name;
  return c;
}

/** Format d'export : enveloppe versionnée. */
export type ExportFile = { format: 'grimoire-dd'; schemaVersion: number; exportedAt: string; character: Character };
