import type { Character, AttackT, EffectT } from './schema';
import { ABILITIES, type Ability, SKILLS, type SkillKey, findClass } from './srd-fr';

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
export const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function totalLevel(c: Character): number {
  const l = c.classes.reduce((s, k) => s + (k.level || 0), 0);
  return Math.max(1, Math.min(20, l || 1));
}

export function proficiencyBonus(c: Character): number {
  if (c.overrides.proficiencyBonus != null) return c.overrides.proficiencyBonus;
  return 2 + Math.floor((totalLevel(c) - 1) / 4);
}

export function mod(c: Character, a: Ability): number {
  return abilityMod(c.abilities[a]);
}

/** Pénalité d'Épuisement (règles 2024) : −2 par niveau à tous les tests d20. */
export const exhaustionPenalty = (c: Character) => -2 * Math.max(0, Math.min(6, c.combat.exhaustion));

// ---------- Effets actifs (Rage, Témérité, Bénédiction…) ----------

export const activeEffects = (c: Character): EffectT[] => (c.effects ?? []).filter((e) => e.active);
const sumEffects = (c: Character, f: (e: EffectT) => number) => activeEffects(c).reduce((s, e) => s + (f(e) || 0), 0);

/** CA affichée : valeur de la fiche + bonus des effets actifs. */
export const armorClass = (c: Character) => c.combat.ac + sumEffects(c, (e) => e.acBonus);

/** Avantage apporté par les effets actifs à un test, une sauvegarde ou une attaque. */
export function effectAdvantage(c: Character, kind: 'check' | 'save', ability: Ability): string[];
export function effectAdvantage(c: Character, kind: 'attack', atk: AttackT): string[];
export function effectAdvantage(c: Character, kind: 'check' | 'save' | 'attack', x: Ability | AttackT): string[] {
  return activeEffects(c)
    .filter((e) => {
      if (kind === 'check') return e.advChecks.includes(x as Ability);
      if (kind === 'save') return e.advSaves.includes(x as Ability);
      return e.advAttacks && (!e.strOnly || attackAbility(c, x as AttackT) === 'for');
    })
    .map((e) => e.name || 'effet');
}

export function saveBonus(c: Character, a: Ability): number {
  const prof = c.savingThrows.includes(a) ? proficiencyBonus(c) : 0;
  return mod(c, a) + prof + (c.saveBonus || 0) + sumEffects(c, (e) => e.saveBonus);
}

export function skillBonus(c: Character, key: SkillKey): number {
  const def = SKILLS.find((s) => s.key === key)!;
  const st = c.skills[key] ?? { prof: 0, bonus: 0 };
  return mod(c, def.ability) + proficiencyBonus(c) * st.prof + (st.bonus || 0);
}

export function initiative(c: Character): number {
  if (c.overrides.initiative != null) return c.overrides.initiative;
  return mod(c, 'dex') + (c.combat.initiativeBonus || 0);
}

export function passivePerception(c: Character): number {
  if (c.overrides.passivePerception != null) return c.overrides.passivePerception;
  return 10 + skillBonus(c, 'perception');
}

/** Valeur passive d'une compétence : 10 + bonus (la Perception peut être forcée). */
export function passiveSkill(c: Character, key: SkillKey): number {
  return key === 'perception' ? passivePerception(c) : 10 + skillBonus(c, key);
}

export function speed(c: Character): number {
  return Math.max(0, c.combat.speed - 1.5 * Math.max(0, c.combat.exhaustion));
}

export function spellAbility(c: Character): Ability | null {
  if (c.spellcasting.ability) return c.spellcasting.ability;
  for (const k of c.classes) {
    const info = findClass(k.name);
    if (info?.spellAbility) return info.spellAbility;
  }
  return null;
}

export function spellSaveDC(c: Character): number | null {
  const a = spellAbility(c);
  return a ? 8 + mod(c, a) + proficiencyBonus(c) : null;
}

export function spellAttack(c: Character): number | null {
  const a = spellAbility(c);
  return a ? mod(c, a) + proficiencyBonus(c) : null;
}

export function attackAbility(c: Character, atk: AttackT): Ability | null {
  if (atk.ability === 'none') return null;
  if (atk.ability === 'finesse') return mod(c, 'dex') >= mod(c, 'for') ? 'dex' : 'for';
  if (atk.ability === 'spell') return spellAbility(c);
  return atk.ability;
}

export function attackToHit(c: Character, atk: AttackT): number {
  const a = attackAbility(c, atk);
  return (a ? mod(c, a) : 0) + (atk.proficient ? proficiencyBonus(c) : 0) + (atk.toHitBonus || 0) + sumEffects(c, (e) => e.toHitBonus);
}

export function attackDamageBonus(c: Character, atk: AttackT): number {
  const a = attackAbility(c, atk);
  const fx = sumEffects(c, (e) => (e.strOnly && a !== 'for' ? 0 : e.damageBonus));
  return (atk.addAbilityToDamage && a ? mod(c, a) : 0) + (atk.damageBonus || 0) + fx;
}

export function damageExpression(c: Character, atk: AttackT): string {
  const b = attackDamageBonus(c, atk);
  const base = atk.damage.trim() || '0';
  return b === 0 ? base : `${base}${b > 0 ? '+' : ''}${b}`;
}

/** PV max suggérés (moyenne) : max au niveau 1, puis moyenne arrondie au supérieur. */
export function suggestedHp(c: Character): number {
  const conMod = mod(c, 'con');
  let hp = 0;
  let first = true;
  for (const k of c.classes) {
    const die = parseInt(k.hitDie.slice(1), 10);
    for (let i = 0; i < k.level; i++) {
      hp += (first ? die : die / 2 + 1) + conMod;
      first = false;
    }
  }
  return Math.max(1, hp);
}

/** Dés de vie attendus d'après les classes. */
export function expectedHitDice(c: Character) {
  const pools = new Map<string, number>();
  for (const k of c.classes) pools.set(k.hitDie, (pools.get(k.hitDie) ?? 0) + k.level);
  return [...pools.entries()].map(([die, total]) => ({ die, total }));
}

/** Poids porté en kg (convention française : 1 lb ≈ 0,5 kg). */
export function carriedWeight(c: Character): number {
  return Math.round(c.inventory.reduce((s, i) => s + (i.weight || 0) * (i.qty || 0), 0) * 100) / 100;
}

/** Capacité de charge (2024) : FOR × 15 lb, soit FOR × 7,5 kg. */
export const carryingCapacity = (c: Character) => c.abilities.for * 7.5;

/** Nombre maximal d'objets harmonisés (règles 2024). */
export const MAX_ATTUNED = 3;
export const attunedCount = (c: Character) => c.inventory.filter((i) => i.attuned).length;

// ---------- Défenses ----------

const sameType = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Résistances (fiche + effets actifs), immunités et vulnérabilités aux types de dégâts. */
export function damageDefenses(c: Character) {
  const res = [...c.defenses.resistances];
  for (const e of activeEffects(c)) for (const r of e.resistances) if (!res.some((x) => sameType(x, r))) res.push(r);
  return { resistances: res, immunities: c.defenses.immunities, vulnerabilities: c.defenses.vulnerabilities };
}

/** Dégâts après immunité, résistance (moitié, arrondi inférieur) puis vulnérabilité (double). */
export function adjustDamage(c: Character, amount: number, type: string): { amount: number; note: string } {
  const n = Math.max(0, Math.floor(amount));
  if (!type) return { amount: n, note: '' };
  const d = damageDefenses(c);
  if (d.immunities.some((x) => sameType(x, type))) return { amount: 0, note: `Immunité (${type})` };
  let out = n;
  const notes: string[] = [];
  if (d.resistances.some((x) => sameType(x, type))) { out = Math.floor(out / 2); notes.push(`résistance (${type}) : ${n} → ${out}`); }
  if (d.vulnerabilities.some((x) => sameType(x, type))) { const before = out; out *= 2; notes.push(`vulnérabilité (${type}) : ${before} → ${out}`); }
  return { amount: out, note: notes.join(', ').replace(/^./, (x) => x.toUpperCase()) };
}

/** DD du jet de sauvegarde de Constitution pour maintenir la concentration (2024 : max 30). */
export const concentrationDC = (damage: number) => Math.min(30, Math.max(10, Math.floor(damage / 2)));

// ---------- Mutations de jeu (pures : renvoient une copie) ----------

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function applyDamage(c: Character, amount: number): Character {
  const n = clone(c);
  let dmg = Math.max(0, Math.floor(amount));
  const fromTemp = Math.min(n.combat.hpTemp, dmg);
  n.combat.hpTemp -= fromTemp;
  dmg -= fromTemp;
  n.combat.hpCurrent = Math.max(0, n.combat.hpCurrent - dmg);
  // À 0 PV, le personnage est neutralisé : la concentration prend fin.
  if (n.combat.hpCurrent === 0) n.combat.concentration = '';
  return n;
}

/** Active ou désactive un effet ; l'activation dépense une utilisation de la ressource liée. */
export function toggleEffect(c: Character, id: string): { char: Character; warning?: string } {
  const n = clone(c);
  const e = n.effects.find((x) => x.id === id);
  if (!e) return { char: n };
  if (e.active) {
    e.active = false;
    return { char: n };
  }
  e.active = true;
  const r = e.resourceId ? n.resources.find((x) => x.id === e.resourceId) : undefined;
  if (r) {
    if (r.used >= r.max) return { char: n, warning: `Plus d'utilisation de « ${r.name} ».` };
    r.used += 1;
  }
  return { char: n };
}

/** Les effets actifs et la concentration prennent fin pendant un repos. */
function endEffects(n: Character) {
  for (const e of n.effects) e.active = false;
  n.combat.concentration = '';
}

export function applyHealing(c: Character, amount: number): Character {
  const n = clone(c);
  if (n.combat.hpCurrent === 0 && amount > 0) n.combat.deathSaves = { success: 0, failure: 0 };
  n.combat.hpCurrent = Math.min(n.combat.hpMax, n.combat.hpCurrent + Math.max(0, Math.floor(amount)));
  return n;
}

export function setTempHp(c: Character, amount: number): Character {
  const n = clone(c);
  // Les PV temporaires ne se cumulent pas : on garde le plus élevé.
  n.combat.hpTemp = Math.max(n.combat.hpTemp, Math.max(0, Math.floor(amount)));
  return n;
}

export function shortRest(c: Character): Character {
  const n = clone(c);
  for (const r of n.resources) if (r.recharge === 'short') r.used = 0;
  endEffects(n);
  // Occultiste : emplacements de pacte rechargés au repos court (géré via ressource dédiée si besoin).
  return n;
}

export function longRest(c: Character): Character {
  const n = clone(c);
  n.combat.hpCurrent = n.combat.hpMax;
  n.combat.hpTemp = 0;
  n.combat.deathSaves = { success: 0, failure: 0 };
  for (const h of n.combat.hitDice) h.used = 0; // 5.2 : tous les dés de vie sont récupérés
  for (const s of n.spellcasting.slots) s.used = 0;
  for (const r of n.resources) if (r.recharge !== 'none') r.used = 0;
  n.combat.exhaustion = Math.max(0, n.combat.exhaustion - 1);
  endEffects(n);
  return n;
}

/**
 * Jets de sauvegarde contre la mort (règle de la table) :
 * 3 réussites → le personnage revient avec 1 PV ; 3 échecs → mort, à ressusciter.
 */
export const isDead = (c: Character) => c.combat.deathSaves.failure >= 3;

/** Applique un compteur de réussites/échecs et ses conséquences. */
export function setDeathSaves(c: Character, success: number, failure: number): { char: Character; outcome: string } {
  const n = clone(c);
  n.combat.deathSaves = { success: Math.max(0, Math.min(3, success)), failure: Math.max(0, Math.min(3, failure)) };
  let outcome = '';
  if (n.combat.deathSaves.failure >= 3) {
    n.combat.hpCurrent = 0;
    outcome = 'Trois échecs : le personnage est mort. Il faudra le ressusciter.';
  } else if (n.combat.deathSaves.success >= 3) {
    n.combat.hpCurrent = Math.max(1, n.combat.hpCurrent);
    n.combat.deathSaves = { success: 0, failure: 0 };
    outcome = 'Trois réussites : le personnage revient à lui avec 1 PV.';
  }
  return { char: n, outcome };
}

/** Résout un jet contre la mort (d20 naturel). */
export function resolveDeathSave(c: Character, nat: number): { char: Character; outcome: string } {
  const { success, failure } = c.combat.deathSaves;
  if (nat === 20) {
    const n = clone(c);
    n.combat.hpCurrent = Math.max(1, n.combat.hpCurrent);
    n.combat.deathSaves = { success: 0, failure: 0 };
    return { char: n, outcome: '20 naturel : le personnage reprend connaissance avec 1 PV !' };
  }
  const label = nat === 1 ? '1 naturel : deux échecs.' : nat >= 10 ? 'Réussite.' : 'Échec.';
  const r = nat === 1 ? setDeathSaves(c, success, failure + 2) : nat >= 10 ? setDeathSaves(c, success + 1, failure) : setDeathSaves(c, success, failure + 1);
  return { char: r.char, outcome: `${label} ${r.outcome}`.trim() };
}

/** Résurrection : remet les jets à zéro et rend 1 PV. */
export function resurrect(c: Character): Character {
  const n = clone(c);
  n.combat.deathSaves = { success: 0, failure: 0 };
  n.combat.hpCurrent = Math.max(1, n.combat.hpCurrent);
  return n;
}

// ---------- Expérience (règles 2024) ----------

/** PX cumulés requis pour chaque niveau (index 0 = niveau 1). */
export const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 0; i < XP_THRESHOLDS.length; i++) if (xp >= XP_THRESHOLDS[i]) lvl = i + 1;
  return lvl;
}

/** Progression vers le niveau suivant, basée sur le niveau actuel des classes. */
export function xpProgress(c: Character) {
  const level = totalLevel(c);
  const xp = Math.max(0, c.identity.xp);
  const floor = XP_THRESHOLDS[level - 1];
  const next = level < 20 ? XP_THRESHOLDS[level] : null;
  const ratio = next == null ? 1 : Math.max(0, Math.min(1, (xp - floor) / (next - floor)));
  const xpLevel = levelForXp(xp);
  return { level, xp, floor, next, ratio, xpLevel, canLevelUp: xpLevel > level };
}

export { ABILITIES };
