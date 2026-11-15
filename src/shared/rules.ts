import type { Character, AttackT } from './schema';
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

export function saveBonus(c: Character, a: Ability): number {
  const prof = c.savingThrows.includes(a) ? proficiencyBonus(c) : 0;
  return mod(c, a) + prof + (c.saveBonus || 0);
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
  return (a ? mod(c, a) : 0) + (atk.proficient ? proficiencyBonus(c) : 0) + (atk.toHitBonus || 0);
}

export function attackDamageBonus(c: Character, atk: AttackT): number {
  const a = attackAbility(c, atk);
  return (atk.addAbilityToDamage && a ? mod(c, a) : 0) + (atk.damageBonus || 0);
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

// ---------- Mutations de jeu (pures : renvoient une copie) ----------

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function applyDamage(c: Character, amount: number): Character {
  const n = clone(c);
  let dmg = Math.max(0, Math.floor(amount));
  const fromTemp = Math.min(n.combat.hpTemp, dmg);
  n.combat.hpTemp -= fromTemp;
  dmg -= fromTemp;
  n.combat.hpCurrent = Math.max(0, n.combat.hpCurrent - dmg);
  return n;
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
  return n;
}

/** Résout un jet contre la mort (d20 naturel). */
export function resolveDeathSave(c: Character, nat: number): { char: Character; outcome: string } {
  const n = clone(c);
  const ds = n.combat.deathSaves;
  let outcome: string;
  if (nat === 20) {
    n.combat.hpCurrent = 1;
    n.combat.deathSaves = { success: 0, failure: 0 };
    outcome = '20 naturel : vous reprenez connaissance avec 1 PV !';
  } else if (nat === 1) {
    ds.failure = Math.min(3, ds.failure + 2);
    outcome = '1 naturel : deux échecs.';
  } else if (nat >= 10) {
    ds.success = Math.min(3, ds.success + 1);
    outcome = 'Réussite.';
  } else {
    ds.failure = Math.min(3, ds.failure + 1);
    outcome = 'Échec.';
  }
  if (nat !== 20) {
    if (ds.success >= 3) outcome += ' Trois réussites : vous êtes stabilisé.';
    if (ds.failure >= 3) outcome += ' Trois échecs : votre personnage meurt.';
  }
  return { char: n, outcome };
}

export { ABILITIES };
