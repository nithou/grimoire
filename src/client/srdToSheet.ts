import type { SrdFull } from './api';
import type { AttackT, FeatureT, ItemT, SpellT } from '../shared/schema';
import { uid } from '../shared/schema';
import { WEAPON_MASTERIES } from '../shared/srd-fr';

const DMG: Record<string, string> = {
  acid: 'Acide', bludgeoning: 'Contondant', cold: 'Froid', fire: 'Feu', force: 'Force', lightning: 'Foudre',
  necrotic: 'Nécrotique', piercing: 'Perforant', poison: 'Poison', psychic: 'Psychique', radiant: 'Radiant',
  slashing: 'Tranchant', thunder: 'Tonnerre',
  // pluriels français du SRD FR
  contondants: 'Contondant', perforants: 'Perforant', tranchants: 'Tranchant', nécrotiques: 'Nécrotique', psychiques: 'Psychique',
  radiants: 'Radiant', acide: 'Acide', feu: 'Feu', froid: 'Froid', foudre: 'Foudre', tonnerre: 'Tonnerre',
};

/** "2 lb." → 1 (kg) ; "1/4 lb." → 0.13 */
export function lbToKg(s?: string): number {
  if (!s) return 0;
  const m = s.match(/(\d+)(?:\/(\d+))?\s*lb/);
  if (!m) return 0;
  const lb = m[2] ? parseInt(m[1], 10) / parseInt(m[2], 10) : parseInt(m[1], 10);
  return Math.round((lb / 2) * 100) / 100;
}

const ftToM = (s: string) => s.replace(/(\d+)\/(\d+)/, (_, a, b) => `${Math.round(a * 0.3 * 10) / 10}/${Math.round(b * 0.3 * 10) / 10} m`);

export function srdToAttack(e: SrdFull): AttackT {
  const x = e.extra ?? {};
  const [dice, type] = (x.damage ?? '1d4').split(' ');
  const props = x.properties ?? '';
  const propsEn = x.propertiesEn ?? props;
  const ranged = /Ranged/i.test(x.categoryEn ?? x.category ?? '');
  const mastery = WEAPON_MASTERIES.find((m) => m.key === (x.masteryEn ?? x.mastery ?? '').toLowerCase())?.label ?? x.mastery ?? '';
  const range = propsEn.match(/Range (\d+\/\d+)/)?.[1];
  return {
    id: uid(),
    name: e.name,
    ability: /Finesse/i.test(propsEn) ? 'finesse' : ranged ? 'dex' : 'for',
    proficient: true,
    toHitBonus: 0,
    damage: /^\d+d\d+$|^\d+$/.test(dice) ? dice : '1',
    addAbilityToDamage: true,
    damageBonus: 0,
    damageType: DMG[(type ?? '').toLowerCase()] ?? type ?? '',
    mastery,
    range: range ? ftToM(range) : ranged ? '' : 'Contact',
    count: /Thrown|Lancer/i.test(propsEn) ? 1 : null,
    equipped: true,
    notes: props === '—' ? '' : props,
  };
}

export function srdToItem(e: SrdFull): ItemT {
  return {
    id: uid(),
    name: e.name,
    qty: 1,
    weight: lbToKg(e.extra?.weightLb ?? e.extra?.weight ?? e.body.match(/\*\*(?:Weight|Poids)[^*]*\*\*\s*([^\n]+)/)?.[1]),
    equipped: false,
    attuned: false,
    value: e.extra?.cost ?? '',
    containerId: '',
    notes: e.type === 'magic-item' ? e.meta : '',
  };
}

export function srdToSpell(e: SrdFull): SpellT {
  return { id: uid(), name: e.name, level: e.level ?? 0, prepared: (e.level ?? 0) === 0, alwaysPrepared: false, srdName: e.id, notes: '' };
}

export function srdToFeature(e: SrdFull): FeatureT {
  return { id: uid(), name: e.name, source: e.meta || 'Don', description: e.body, kind: 'passive' };
}

export const SRD_TYPE_LABEL: Record<string, string> = {
  spell: 'Sort', 'magic-item': 'Objet magique', feat: 'Don', rule: 'Règle', gear: 'Équipement', tool: 'Outil', weapon: 'Arme', armor: 'Armure',
};
