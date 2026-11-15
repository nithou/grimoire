import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as R from '../src/shared/rules';
import { parseDice, roll, rollD20 } from '../src/shared/dice';
import { blankCharacter, CharacterSchema } from '../src/shared/schema';
import { importCharacterJson } from '../src/shared/legacy-import';
import { parseOcrText, applyPath } from '../src/shared/ocr-parse';
import { buildIndex } from '../src/server/srd/build-index';

const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('règles 5.2', () => {
  it('modificateurs', () => {
    expect([1, 8, 9, 10, 11, 17, 18, 20, 30].map(R.abilityMod)).toEqual([-5, -1, -1, 0, 0, 3, 4, 5, 10]);
  });
  it('bonus de maîtrise par niveau', () => {
    const c = blankCharacter();
    const pb = (lvl: number) => {
      c.classes = [{ id: 'x', name: 'Guerrier', subclass: '', level: lvl, hitDie: 'd10' }];
      return R.proficiencyBonus(c);
    };
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(pb)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });
  it('compétences, expertise, perception passive, épuisement', () => {
    const c = blankCharacter();
    c.classes = [{ id: 'x', name: 'Roublard', subclass: '', level: 5, hitDie: 'd8' }];
    c.abilities.dex = 16;
    c.abilities.sag = 12;
    c.skills.discretion = { prof: 2, bonus: 0 };
    c.skills.perception = { prof: 1, bonus: 1 };
    expect(R.skillBonus(c, 'discretion')).toBe(3 + 6);
    expect(R.passivePerception(c)).toBe(10 + 1 + 3 + 1);
    c.combat.exhaustion = 2;
    expect(R.exhaustionPenalty(c)).toBe(-4);
    expect(R.speed(c)).toBe(6);
  });
  it('dégâts, PV temporaires, repos long', () => {
    let c = blankCharacter();
    c.combat.hpMax = 20;
    c.combat.hpCurrent = 20;
    c = R.setTempHp(c, 5);
    c = R.applyDamage(c, 8);
    expect([c.combat.hpTemp, c.combat.hpCurrent]).toEqual([0, 17]);
    c.combat.hitDice = [{ die: 'd8', total: 3, used: 3 }];
    c.combat.exhaustion = 2;
    c = R.longRest(c);
    expect([c.combat.hpCurrent, c.combat.hitDice[0].used, c.combat.exhaustion]).toEqual([20, 0, 1]);
  });
  it('jets contre la mort', () => {
    const c = blankCharacter();
    c.combat.hpCurrent = 0;
    expect(R.resolveDeathSave(c, 20).char.combat.hpCurrent).toBe(1);
    expect(R.resolveDeathSave(c, 1).char.combat.deathSaves.failure).toBe(2);
    expect(R.resolveDeathSave(c, 10).char.combat.deathSaves.success).toBe(1);
  });
  it('3 réussites → 1 PV ; 3 échecs → mort puis résurrection', () => {
    const c = blankCharacter();
    c.combat.hpMax = 20;
    c.combat.hpCurrent = 0;
    c.combat.deathSaves = { success: 2, failure: 1 };
    const up = R.resolveDeathSave(c, 15).char;
    expect(up.combat.hpCurrent).toBe(1);
    expect(up.combat.deathSaves).toEqual({ success: 0, failure: 0 });
    c.combat.deathSaves = { success: 0, failure: 2 };
    const dead = R.resolveDeathSave(c, 5).char;
    expect(R.isDead(dead)).toBe(true);
    expect(dead.combat.hpCurrent).toBe(0);
    const back = R.resurrect(dead);
    expect(R.isDead(back)).toBe(false);
    expect(back.combat.hpCurrent).toBe(1);
  });
  it('expérience : niveaux 2024 et progression', () => {
    expect([0, 299, 300, 2700, 6499, 6500, 355000].map(R.levelForXp)).toEqual([1, 1, 2, 4, 4, 5, 20]);
    const c = blankCharacter();
    c.classes = [{ id: 'x', name: 'Barbare', subclass: '', level: 4, hitDie: 'd12' }];
    c.identity.xp = 4965;
    const p = R.xpProgress(c);
    expect([p.floor, p.next, p.canLevelUp]).toEqual([2700, 6500, false]);
    expect(p.ratio).toBeCloseTo((4965 - 2700) / (6500 - 2700));
    c.identity.xp = 7000;
    expect(R.xpProgress(c).canLevelUp).toBe(true);
  });
});

describe('dés', () => {
  it('analyse les expressions', () => {
    expect(parseDice('2d6+3')).toHaveLength(2);
    expect(parseDice('d20')[0]).toMatchObject({ count: 1, sides: 20 });
    expect(() => parseDice('2d6*3')).toThrow();
    expect(() => parseDice('abc')).toThrow();
  });
  it('lance avec un RNG injecté et double les dés en critique', () => {
    const r = roll('2d6+3', { rng: seq(0, 0.99) });
    expect(r.total).toBe(1 + 6 + 3);
    const c = roll('1d8+2', { crit: true, rng: seq(0.5) });
    expect(c.terms[0].rolls).toHaveLength(2);
    expect(c.total).toBe(5 + 5 + 2);
  });
  it('avantage et désavantage', () => {
    expect(rollD20(3, 'advantage', seq(0.1, 0.9)).nat).toBe(19);
    expect(rollD20(3, 'disadvantage', seq(0.1, 0.9)).total).toBe(3 + 3);
    expect(rollD20(0, 'normal', seq(0.99)).isCrit).toBe(true);
  });
});

describe('import JSON', () => {
  const raw = JSON.parse(readFileSync(resolve(__dirname, '../braillann.json'), 'utf8'));
  it('convertit le format libre braillann.json', () => {
    const { character: c, format, warnings } = importCharacterJson(raw);
    expect(format).toBe('legacy');
    expect(c.identity.name).toBe('Braillânn');
    expect(c.classes[0]).toMatchObject({ name: 'Barbare', level: 4, hitDie: 'd12' });
    expect(R.mod(c, 'for')).toBe(3);
    expect(c.attacks).toHaveLength(3);
    expect(c.attacks[0].toHitBonus).toBe(5);
    expect(c.coins.po).toBe(128);
    expect(c.savingThrows).toEqual(['for', 'con']);
    expect(c.skills.athletisme.prof).toBe(1);
    expect(c.inventory[0]).toMatchObject({ name: 'javelines', qty: 4 });
    expect(c.inventory.find((i) => i.name === 'Serpe gravée')).toMatchObject({ value: '25 po' });
    expect(c.inventory.find((i) => i.name === 'Amulette à nager')).toMatchObject({ notes: 'transcription incertaine', value: '' });
    expect(c.resources[0]).toMatchObject({ name: 'Rage', max: 2 });
    expect(c.toVerify.length).toBe(8);
    expect(R.initiative(c)).toBe(1);
    expect(c.combat.heroicInspiration).toBe(4);
    expect(warnings.some((w) => w.includes('force'))).toBe(true);
  });
  it('aller-retour au format natif', () => {
    const c = importCharacterJson(raw).character;
    const exported = JSON.parse(JSON.stringify({ format: 'grimoire-dd', schemaVersion: 1, character: c }));
    const back = importCharacterJson(exported);
    expect(back.format).toBe('native');
    expect(back.character).toEqual(c);
  });
  it('rejette un format inconnu', () => {
    expect(() => importCharacterJson({ foo: 1 })).toThrow();
  });
});

describe('OCR', () => {
  const text = `Nom : Braillann
Classe : Barbare  Niveau 4  Humain
FORCE 17   DEXTERITE 13   CONSTITUTION 15
INTELLIGENCE 11  SAGESSE 14  CHARISME 10
CA 17   PV max 42   Vitesse 9 m
128 po  5 pa  1 pc`;
  it('extrait les valeurs', () => {
    const s = Object.fromEntries(parseOcrText(text).map((x) => [x.path, x.value]));
    expect(s['abilities.for']).toBe(17);
    expect(s['abilities.dex']).toBe(13);
    expect(s['abilities.cha']).toBe(10);
    expect(s['combat.ac']).toBe(17);
    expect(s['combat.hpMax']).toBe(42);
    expect(s['classes.0.name']).toBe('Barbare');
    expect(s['classes.0.level']).toBe(4);
    expect(s['identity.species']).toBe('Humain');
    expect(s['coins.po']).toBe(128);
    expect(s['identity.name']).toBe('Braillann');
  });
  it('applique les suggestions sur une fiche', () => {
    const raw: any = structuredClone(blankCharacter());
    applyPath(raw, 'classes.0.name', 'Barbare');
    applyPath(raw, 'abilities.for', 17);
    const c = CharacterSchema.parse(raw);
    expect(c.classes[0].name).toBe('Barbare');
    expect(c.classes[0].level).toBe(1);
    expect(c.abilities.for).toBe(17);
  });
});

describe('index SRD', () => {
  const idx = buildIndex(resolve(__dirname, '../srd'));
  it('contient sorts, armes et règles', () => {
    expect(idx.filter((e) => e.type === 'spell').length).toBeGreaterThan(300);
    const fb = idx.find((e) => e.name === 'Fireball')!;
    expect(fb).toMatchObject({ level: 3, type: 'spell' });
    expect(idx.find((e) => e.name === 'Longsword')?.extra?.mastery).toBe('Sap');
    expect(idx.find((e) => e.name === 'Blinded')?.type).toBe('rule');
    expect(new Set(idx.map((e) => e.id)).size).toBe(idx.length);
  });
});

describe('OCR de carte', () => {
  const raw = `TR) BROCHE DU VEILLEUR
MELENCA. VISAGE
2e réaction 1/repos long ÈS
Une broche d'argent en forme de balance, retrouvée
sur le plastron brisé de l'armure qui gardait le
reliquaire. Une fois entre deux repos longs, quand tu
& \\ N as déjà utilisé ta réaction, tu peux en utiliser une
~
seconde avant le début de ton prochain tour.`;
  it('nettoie et lit titre, usage et description', async () => {
    const { cleanOcrText, parseCard, scoreOcrText } = await import('../src/shared/ocr-parse');
    const t = cleanOcrText(raw);
    expect(t).not.toContain('~');
    expect(t).toContain('as déjà utilisé');
    const c = parseCard(t)!;
    expect(c.title).toBe('Broche du veilleur');
    expect(c.usage).toEqual({ max: 1, recharge: 'long' });
    expect(c.description.startsWith("Une broche d'argent")).toBe(true);
    expect(scoreOcrText(t)).toBeGreaterThan(20);
  });
});

describe('index SRD français', () => {
  const idx = buildIndex(resolve(__dirname, '../srd'));
  it('contient les sorts et armes en français', () => {
    const fr = idx.filter((e) => e.lang === 'fr');
    expect(fr.filter((e) => e.type === 'spell').length).toBeGreaterThan(330);
    expect(fr.find((e) => e.name === 'Boule de feu')).toMatchObject({ level: 3, classes: ['Ensorceleur', 'Magicien'] });
    expect(fr.find((e) => e.name === 'Cimeterre')?.extra?.mastery).toBe('Coup double');
    expect(fr.find((e) => e.name === 'Aveuglé')?.type).toBe('rule');
  });
});

describe('Inspiration', () => {
  it('convertit les anciens booléens en compteur', () => {
    expect(CharacterSchema.parse({ combat: { heroicInspiration: true } }).combat.heroicInspiration).toBe(1);
    expect(CharacterSchema.parse({ combat: { heroicInspiration: false } }).combat.heroicInspiration).toBe(0);
    expect(CharacterSchema.parse({ combat: { heroicInspiration: 3 } }).combat.heroicInspiration).toBe(3);
    expect(blankCharacter().combat.heroicInspiration).toBe(0);
  });
});

describe('Contenants', () => {
  it('les anciennes fiches sont rangées dans le sac principal', () => {
    const c = CharacterSchema.parse({ inventory: [{ name: 'Corde' }] });
    expect(c.containers).toEqual([]);
    expect(c.inventory[0].containerId).toBe('');
    const d = CharacterSchema.parse({ containers: [{ id: 'b1', name: 'Sac sans fond' }], inventory: [{ name: 'Gemme', containerId: 'b1' }] });
    expect(d.inventory[0].containerId).toBe('b1');
    expect(d.containers[0].name).toBe('Sac sans fond');
  });
});

describe('MCP (JSON-RPC)', () => {
  it('initialise, liste les outils et refuse les méthodes inconnues', async () => {
    process.env.DATA_DIR = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'grimoire-test-'));
    const { handleRpc } = await import('../src/server/mcp');
    const user = { id: 999, username: 'test', is_admin: 0 };
    const init = handleRpc(user, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }) as any;
    expect(init.result.protocolVersion).toBe('2025-03-26');
    expect(init.result.capabilities.tools).toBeTruthy();
    const list = handleRpc(user, { jsonrpc: '2.0', id: 2, method: 'tools/list' }) as any;
    expect(list.result.tools.map((t: any) => t.name)).toContain('roll_check');
    expect(handleRpc(user, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    expect((handleRpc(user, { jsonrpc: '2.0', id: 3, method: 'foo' }) as any).error.code).toBe(-32601);
    const dice = handleRpc(user, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'roll_dice', arguments: { expression: '2d6+3' } } }) as any;
    expect(dice.result.isError).toBe(false);
    expect(dice.result.structuredContent.total).toBeGreaterThanOrEqual(5);
    const missing = handleRpc(user, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_character', arguments: { character_id: 'nope' } } }) as any;
    expect(missing.result.isError).toBe(true);
  });
});

describe('Journal des modifications (diff)', () => {
  it('décrit les changements de stats, PV, inventaire et ressources', async () => {
    const { diffCharacters, mergeChanges } = await import('../src/shared/diff');
    const a = blankCharacter('Test');
    a.combat.hpMax = 30;
    a.combat.hpCurrent = 30;
    a.inventory = [{ id: 'i1', name: 'Corde', qty: 1, weight: 0, equipped: false, attuned: false, value: '', notes: '', containerId: '' }];
    a.resources = [{ id: 'r1', name: 'Rage', max: 3, used: 0, recharge: 'long', description: '' }];
    const b = structuredClone(a);
    b.combat.hpCurrent = 22;
    b.abilities.for = 18;
    b.inventory[0].qty = 3;
    b.inventory.push({ id: 'i2', name: 'Potion de soins', qty: 2, weight: 0, equipped: false, attuned: false, value: '50 po', notes: '', containerId: '' });
    b.resources[0].used = 1;
    b.notes = 'x'.repeat(200);
    const ch = diffCharacters(a, b);
    const find = (label: string) => ch.find((c) => c.label === label);
    expect(find('PV')).toMatchObject({ before: '30', after: '22' });
    expect(find('Force')).toMatchObject({ before: '10', after: '18' });
    expect(find('Corde (quantité)')).toMatchObject({ before: '1', after: '3' });
    expect(ch.find((c) => c.after === '+ Potion de soins ×2')).toBeTruthy();
    expect(find('Rage (dépensées)')).toMatchObject({ before: '0', after: '1' });
    expect(find('Notes')?.after).toBe('(texte modifié)');
    expect(diffCharacters(a, a)).toEqual([]);

    // Fusion : 30 → 25 puis 25 → 30 s'annule ; 30 → 25 puis 25 → 20 devient 30 → 20
    const m1 = mergeChanges([{ path: 'combat.hpCurrent', label: 'PV', before: '30', after: '25' }], [{ path: 'combat.hpCurrent', label: 'PV', before: '25', after: '30' }]);
    expect(m1).toEqual([]);
    const m2 = mergeChanges([{ path: 'combat.hpCurrent', label: 'PV', before: '30', after: '25' }], [{ path: 'combat.hpCurrent', label: 'PV', before: '25', after: '20' }]);
    expect(m2[0]).toMatchObject({ before: '30', after: '20' });
  });
});
