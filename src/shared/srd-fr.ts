// Listes de référence en français, basées sur le SRD 5.2.1 (règles 2024).

export const ABILITIES = ['for', 'dex', 'con', 'int', 'sag', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_LABELS: Record<Ability, { short: string; long: string; en: string }> = {
  for: { short: 'FOR', long: 'Force', en: 'Strength' },
  dex: { short: 'DEX', long: 'Dextérité', en: 'Dexterity' },
  con: { short: 'CON', long: 'Constitution', en: 'Constitution' },
  int: { short: 'INT', long: 'Intelligence', en: 'Intelligence' },
  sag: { short: 'SAG', long: 'Sagesse', en: 'Wisdom' },
  cha: { short: 'CHA', long: 'Charisme', en: 'Charisma' },
};

export const SKILLS = [
  { key: 'acrobaties', label: 'Acrobaties', ability: 'dex', en: 'Acrobatics' },
  { key: 'arcanes', label: 'Arcanes', ability: 'int', en: 'Arcana' },
  { key: 'athletisme', label: 'Athlétisme', ability: 'for', en: 'Athletics' },
  { key: 'discretion', label: 'Discrétion', ability: 'dex', en: 'Stealth' },
  { key: 'dressage', label: 'Dressage', ability: 'sag', en: 'Animal Handling' },
  { key: 'escamotage', label: 'Escamotage', ability: 'dex', en: 'Sleight of Hand' },
  { key: 'histoire', label: 'Histoire', ability: 'int', en: 'History' },
  { key: 'intimidation', label: 'Intimidation', ability: 'cha', en: 'Intimidation' },
  { key: 'investigation', label: 'Investigation', ability: 'int', en: 'Investigation' },
  { key: 'medecine', label: 'Médecine', ability: 'sag', en: 'Medicine' },
  { key: 'nature', label: 'Nature', ability: 'int', en: 'Nature' },
  { key: 'perception', label: 'Perception', ability: 'sag', en: 'Perception' },
  { key: 'perspicacite', label: 'Perspicacité', ability: 'sag', en: 'Insight' },
  { key: 'persuasion', label: 'Persuasion', ability: 'cha', en: 'Persuasion' },
  { key: 'religion', label: 'Religion', ability: 'int', en: 'Religion' },
  { key: 'representation', label: 'Représentation', ability: 'cha', en: 'Performance' },
  { key: 'survie', label: 'Survie', ability: 'sag', en: 'Survival' },
  { key: 'tromperie', label: 'Tromperie', ability: 'cha', en: 'Deception' },
] as const satisfies readonly { key: string; label: string; ability: Ability; en: string }[];
export type SkillKey = (typeof SKILLS)[number]['key'];
export const SKILL_KEYS = SKILLS.map((s) => s.key) as SkillKey[];

export type ClassInfo = {
  name: string;
  en: string;
  hitDie: 'd6' | 'd8' | 'd10' | 'd12';
  saves: [Ability, Ability];
  spellAbility?: Ability;
  srdSubclass: string;
};

export const CLASSES: ClassInfo[] = [
  { name: 'Barbare', en: 'Barbarian', hitDie: 'd12', saves: ['for', 'con'], srdSubclass: 'Voie du Berserker' },
  { name: 'Barde', en: 'Bard', hitDie: 'd8', saves: ['dex', 'cha'], spellAbility: 'cha', srdSubclass: 'Collège du Savoir' },
  { name: 'Clerc', en: 'Cleric', hitDie: 'd8', saves: ['sag', 'cha'], spellAbility: 'sag', srdSubclass: 'Domaine de la Vie' },
  { name: 'Druide', en: 'Druid', hitDie: 'd8', saves: ['int', 'sag'], spellAbility: 'sag', srdSubclass: 'Cercle de la Terre' },
  { name: 'Ensorceleur', en: 'Sorcerer', hitDie: 'd6', saves: ['con', 'cha'], spellAbility: 'cha', srdSubclass: 'Sorcellerie draconique' },
  { name: 'Guerrier', en: 'Fighter', hitDie: 'd10', saves: ['for', 'con'], srdSubclass: 'Champion' },
  { name: 'Magicien', en: 'Wizard', hitDie: 'd6', saves: ['int', 'sag'], spellAbility: 'int', srdSubclass: 'Évocateur' },
  { name: 'Moine', en: 'Monk', hitDie: 'd8', saves: ['for', 'dex'], srdSubclass: 'Guerrier de la Paume' },
  { name: 'Occultiste', en: 'Warlock', hitDie: 'd8', saves: ['sag', 'cha'], spellAbility: 'cha', srdSubclass: 'Protecteur Fiélon' },
  { name: 'Paladin', en: 'Paladin', hitDie: 'd10', saves: ['sag', 'cha'], spellAbility: 'cha', srdSubclass: 'Serment de dévotion' },
  { name: 'Rôdeur', en: 'Ranger', hitDie: 'd10', saves: ['for', 'dex'], spellAbility: 'sag', srdSubclass: 'Chasseur' },
  { name: 'Roublard', en: 'Rogue', hitDie: 'd8', saves: ['dex', 'int'], srdSubclass: 'Voleur' },
];

export const SPECIES = [
  'Drakéide', 'Elfe', 'Gnome', 'Goliath', 'Halfelin', 'Humain', 'Nain', 'Orc', 'Tieffelin',
];

export const BACKGROUNDS = ['Acolyte', 'Criminel', 'Sage', 'Soldat'];

export const ALIGNMENTS = [
  'Loyal Bon', 'Neutre Bon', 'Chaotique Bon',
  'Loyal Neutre', 'Neutre', 'Chaotique Neutre',
  'Loyal Mauvais', 'Neutre Mauvais', 'Chaotique Mauvais',
];

export const CONDITIONS = [
  'À terre', 'Agrippé', 'Assourdi', 'Aveuglé', 'Charmé', 'Effrayé', 'Empoisonné',
  'Entravé', 'Étourdi', 'Inconscient', 'Invisible', 'Neutralisé', 'Paralysé', 'Pétrifié',
];

export const DAMAGE_TYPES = [
  'Acide', 'Contondant', 'Feu', 'Force', 'Foudre', 'Froid', 'Nécrotique',
  'Perforant', 'Poison', 'Psychique', 'Radiant', 'Tonnerre', 'Tranchant',
];

export const WEAPON_MASTERIES = [
  { key: 'cleave', label: 'Enchaînement (Cleave)' },
  { key: 'graze', label: 'Écorchure (Graze)' },
  { key: 'nick', label: 'Coup double (Nick)' },
  { key: 'push', label: 'Poussée (Push)' },
  { key: 'sap', label: 'Sape (Sap)' },
  { key: 'slow', label: 'Ralentissement (Slow)' },
  { key: 'topple', label: 'Renversement (Topple)' },
  { key: 'vex', label: 'Ouverture (Vex)' },
];

export const FEATURE_KIND_LABELS: Record<'action' | 'bonus' | 'reaction' | 'passive' | 'other', string> = {
  action: 'Action', bonus: 'Bonus', reaction: 'Réaction', passive: 'Passive', other: 'Autre',
};

export const COINS = [
  { key: 'pc', label: 'pc', long: 'Pièces de cuivre' },
  { key: 'pa', label: 'pa', long: "Pièces d'argent" },
  { key: 'pe', label: 'pe', long: "Pièces d'électrum" },
  { key: 'po', label: 'po', long: "Pièces d'or" },
  { key: 'pp', label: 'pp', long: 'Pièces de platine' },
] as const;
export type CoinKey = (typeof COINS)[number]['key'];

/** Normalise une chaîne pour comparaison (minuscules, sans accents). */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .trim();
}

export function findClass(name: string): ClassInfo | undefined {
  const n = norm(name);
  return CLASSES.find((c) => norm(c.name) === n || norm(c.en) === n);
}

export function findSkill(label: string) {
  const n = norm(label);
  return SKILLS.find((s) => norm(s.label) === n || norm(s.en) === n || s.key === n);
}

export function findAbility(label: string): Ability | undefined {
  const n = norm(label);
  return ABILITIES.find(
    (a) => a === n || norm(ABILITY_LABELS[a].long) === n || norm(ABILITY_LABELS[a].en) === n || norm(ABILITY_LABELS[a].short) === n,
  );
}
