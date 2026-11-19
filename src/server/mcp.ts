// Serveur MCP minimaliste (Model Context Protocol) : JSON-RPC 2.0 sur HTTP (POST /mcp),
// réponses JSON directes (transport « Streamable HTTP » sans flux SSE ni session).
// Authentification : jeton personnel « Authorization: Bearer grm_… » → accès aux seules fiches de l'utilisateur.
import type { FastifyInstance } from 'fastify';
import { db, now } from './db';
import { userFromBearer } from './tokens';
import type { SessionUser } from './auth';
import { CharacterSchema, blankCharacter, uid, type Character } from '../shared/schema';
import * as R from '../shared/rules';
import { roll, rollD20, describeRoll, type D20Mode } from '../shared/dice';
import { ABILITIES, ABILITY_LABELS, SKILLS, findAbility, findSkill, norm } from '../shared/srd-fr';
import { searchSrd, getSrdEntry } from './routes/srd';
import { accessRow, logChange, saveCharacter, visibleRows, type Role } from './access';

const SERVER_INFO = { name: 'grimoire', title: 'Grimoire — fiches D&D 5.2', version: '1.0.0' };
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS =
  "Grimoire gère les fiches de personnage D&D 5.2 (règles 2024, en français) de l'utilisateur. " +
  "Commencez par list_characters puis get_character pour obtenir l'id et l'état complet (valeurs calculées incluses). " +
  'Les lancers (roll_dice, roll_check) sont enregistrés dans le journal de la fiche. update_character applique un patch JSON partiel (les tableaux sont remplacés).';

// ---------------------------------------------------------------------------
// Accès aux fiches de l'utilisateur
type Row = { id: string; user_id: number; name: string; data: string; version: number; created_at: number; updated_at: number; deleted_at: number | null };

class ToolError extends Error {}

// Fiche chargée pour l'appel en cours (l'utilisateur courant est mémorisé pour journaliser les modifications).
type Loaded = { row: Row; c: Character; role: Role; user: SessionUser };
const ctx = new WeakMap<Row, Loaded>();

function load(user: SessionUser, id: unknown): { row: Row; c: Character } {
  if (typeof id !== 'string' || !id) throw new ToolError('character_id requis');
  const a = accessRow(user.id, id);
  if (!a) throw new ToolError(`Fiche introuvable : ${id}`);
  const row = a.row as Row;
  const c = CharacterSchema.parse(JSON.parse(row.data));
  ctx.set(row, { row, c, role: a.role, user });
  return { row, c };
}

function save(row: Row, c: Character) {
  const parsed = CharacterSchema.parse(c);
  const l = ctx.get(row);
  if (!l) throw new ToolError('Fiche non chargée');
  saveCharacter(row as any, parsed, l.user, l.role, 'mcp');
  return parsed;
}

function logRoll(characterId: string, label: string, detail: string, total: number) {
  db.prepare('INSERT INTO rolls(character_id,label,detail,total,created_at) VALUES (?,?,?,?,?)').run(characterId, `🤖 ${label}`.slice(0, 200), detail.slice(0, 500), total, now());
}

/** Vue synthétique avec toutes les valeurs dérivées, pratique pour une IA. */
function summarize(id: string, c: Character) {
  const boxes = [{ id: '', name: 'Sac principal' }, ...c.containers];
  return {
    id,
    nom: c.identity.name,
    espece: c.identity.species,
    historique: c.identity.background,
    classes: c.classes.map((k) => ({ classe: k.name, sous_classe: k.subclass, niveau: k.level, de_de_vie: k.hitDie })),
    niveau: R.totalLevel(c),
    experience: R.xpProgress(c),
    bonus_maitrise: R.proficiencyBonus(c),
    caracteristiques: Object.fromEntries(ABILITIES.map((a) => [ABILITY_LABELS[a].long, { valeur: c.abilities[a], mod: R.mod(c, a), sauvegarde: R.saveBonus(c, a), sauvegarde_maitrisee: c.savingThrows.includes(a) }])),
    competences: Object.fromEntries(SKILLS.map((s) => [s.label, { bonus: R.skillBonus(c, s.key), maitrise: ['non', 'maîtrise', 'expertise'][c.skills[s.key]?.prof ?? 0] }])),
    perception_passive: R.passivePerception(c),
    perspicacite_passive: R.passiveSkill(c, 'perspicacite'),
    investigation_passive: R.passiveSkill(c, 'investigation'),
    sens: c.senses,
    defenses: { ...R.damageDefenses(c), immunites_etats: c.defenses.conditionImmunities },
    effets: c.effects.map((e) => ({ id: e.id, nom: e.name, actif: e.active, rappel: e.notes })),
    concentration: c.combat.concentration || null,
    combat: {
      ca: R.armorClass(c), ca_base: c.combat.ac, initiative: R.initiative(c), vitesse_m: R.speed(c),
      pv: c.combat.hpCurrent, pv_max: c.combat.hpMax, pv_temp: c.combat.hpTemp,
      des_de_vie: c.combat.hitDice, jets_contre_la_mort: c.combat.deathSaves, mort: R.isDead(c),
      etats: c.combat.conditions, epuisement: c.combat.exhaustion, inspiration: c.combat.heroicInspiration,
    },
    attaques: c.attacks.map((a) => ({ id: a.id, nom: a.name, toucher: R.attackToHit(c, a), degats: R.damageExpression(c, a), type: a.damageType, nombre: a.count, botte: a.mastery })),
    sorts: { dd: R.spellSaveDC(c), attaque: R.spellAttack(c), emplacements: c.spellcasting.slots, connus: c.spellcasting.spells.map((s) => ({ nom: s.name, niveau: s.level, prepare: s.prepared || s.alwaysPrepared })) },
    ressources: c.resources.map((r) => ({ id: r.id, nom: r.name, restant: r.max - r.used, max: r.max, recharge: r.recharge, description: r.description })),
    monnaie: c.coins,
    inventaire: boxes.map((b) => ({ contenant: b.name, contenant_id: b.id, objets: c.inventory.filter((i) => i.containerId === b.id).map((i) => ({ id: i.id, nom: i.name, qte: i.qty, valeur: i.value, description: i.notes, equipe: i.equipped })) })),
    aptitudes: c.features.filter((f) => f.category !== 'feat').map((f) => ({ nom: f.name, source: f.source })),
    dons: c.features.filter((f) => f.category === 'feat').map((f) => ({ nom: f.name, type: f.featType, source: f.source })),
    a_verifier: c.toVerify,
  };
}

/** Fusion profonde (objets fusionnés, tableaux et scalaires remplacés). */
function deepMerge(target: any, patch: any): any {
  if (Array.isArray(patch) || patch === null || typeof patch !== 'object') return patch;
  const out = { ...(target && typeof target === 'object' && !Array.isArray(target) ? target : {}) };
  for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(out[k], v);
  return out;
}

// ---------------------------------------------------------------------------
// Outils
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly?: boolean;
  run: (user: SessionUser, args: any) => unknown;
};

const modeSchema = { type: 'string', enum: ['normal', 'advantage', 'disadvantage'], description: 'Avantage / désavantage (défaut : normal)' };
const charId = { type: 'string', description: 'Identifiant de la fiche (voir list_characters)' };

const TOOLS: Tool[] = [
  {
    name: 'list_characters',
    title: 'Lister les personnages',
    description: "Liste les fiches de l'utilisateur et celles dont il est Maître du Donjon (id, nom, classes, niveau, PV, rôle).",
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    run: (user) => {
      const { own, shared } = visibleRows(user.id);
      const fmtRow = (r: { id: string; data: string }, role: string, owner?: string) => {
        const c = CharacterSchema.parse(JSON.parse(r.data));
        return { id: r.id, nom: c.identity.name, classes: c.classes.map((k) => `${k.name} ${k.level}`).join(' / '), niveau: R.totalLevel(c), pv: `${c.combat.hpCurrent}/${c.combat.hpMax}`, role, ...(owner ? { proprietaire: owner } : {}) };
      };
      return [...own.map((r) => fmtRow(r, 'propriétaire')), ...shared.map((r) => fmtRow(r, 'maître du donjon', r.owner_name))];
    },
  },
  {
    name: 'get_character',
    title: 'Lire une fiche',
    description: 'Renvoie la fiche avec les valeurs calculées (modificateurs, compétences, attaques, inventaire par contenant…). raw=true ajoute le JSON brut complet (format modifiable via update_character).',
    inputSchema: { type: 'object', properties: { character_id: charId, raw: { type: 'boolean' } }, required: ['character_id'] },
    readOnly: true,
    run: (user, a) => {
      const { row, c } = load(user, a.character_id);
      return a.raw ? { resume: summarize(row.id, c), brut: c } : summarize(row.id, c);
    },
  },
  {
    name: 'create_character',
    title: 'Créer une fiche',
    description: 'Crée une fiche vierge (name) ou à partir d’un objet fiche complet ou partiel au format Grimoire (character).',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, character: { type: 'object' } } },
    run: (user, a) => {
      const base = blankCharacter(a.name);
      const c = CharacterSchema.parse(a.character ? deepMerge(base, a.character) : base);
      const id = uid() + uid().slice(0, 4);
      db.prepare('INSERT INTO characters(id,user_id,name,data,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').run(id, user.id, c.identity.name || 'Sans nom', JSON.stringify(c), now(), now());
      logChange(id, user, 'owner', 'mcp', 'create', []);
      return { id, nom: c.identity.name };
    },
  },
  {
    name: 'update_character',
    title: 'Modifier une fiche',
    description:
      "Applique un patch JSON partiel à la fiche (format brut, voir get_character raw=true). Les objets sont fusionnés, les tableaux remplacés. " +
      'Exemples : {"identity":{"xp":7000}}, {"abilities":{"for":18}}, {"combat":{"conditions":["Empoisonné"]}}, {"notes":"…"}.',
    inputSchema: { type: 'object', properties: { character_id: charId, patch: { type: 'object' } }, required: ['character_id', 'patch'] },
    run: (user, a) => {
      const { row, c } = load(user, a.character_id);
      if (!a.patch || typeof a.patch !== 'object') throw new ToolError('patch doit être un objet');
      const merged = CharacterSchema.safeParse(deepMerge(c, a.patch));
      if (!merged.success) throw new ToolError(`Patch invalide : ${merged.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join(' ; ')}`);
      return summarize(row.id, save(row, merged.data));
    },
  },
  {
    name: 'roll_dice',
    title: 'Lancer des dés',
    description: 'Lance une expression de dés (ex. « 2d6+3 », « 4d6kh3 », « 1d20 »). Si character_id est fourni, le lancer est ajouté au journal de la fiche.',
    inputSchema: { type: 'object', properties: { expression: { type: 'string' }, label: { type: 'string' }, character_id: charId }, required: ['expression'] },
    run: (user, a) => {
      const r = roll(String(a.expression));
      if (a.character_id) logRoll(load(user, a.character_id).row.id, a.label || a.expression, describeRoll(r), r.total);
      return { total: r.total, detail: describeRoll(r) };
    },
  },
  {
    name: 'roll_check',
    title: 'Jet de la fiche',
    description:
      'Lance un d20 avec les bonus de la fiche (épuisement inclus). kind : ability (key = FOR/DEX/…), save (key = caractéristique), skill (key = nom de compétence, ex. « Perception »), initiative, attack (key = nom de l’attaque ; lance aussi les dégâts si touché, doublés sur 20 naturel), death_save.',
    inputSchema: {
      type: 'object',
      properties: { character_id: charId, kind: { type: 'string', enum: ['ability', 'save', 'skill', 'initiative', 'attack', 'death_save'] }, key: { type: 'string' }, mode: modeSchema },
      required: ['character_id', 'kind'],
    },
    run: (user, a) => {
      const { row, c } = load(user, a.character_id);
      let mode: D20Mode = ['advantage', 'disadvantage'].includes(a.mode) ? a.mode : 'normal';
      let adv: string[] = [];
      const pen = R.exhaustionPenalty(c);
      let label: string;
      let bonus: number;
      let attack: Character['attacks'][number] | undefined;
      switch (a.kind) {
        case 'ability':
        case 'save': {
          const ab = findAbility(String(a.key ?? ''));
          if (!ab) throw new ToolError('key : caractéristique inconnue (FOR, DEX, CON, INT, SAG, CHA)');
          bonus = a.kind === 'ability' ? R.mod(c, ab) : R.saveBonus(c, ab);
          adv = R.effectAdvantage(c, a.kind === 'ability' ? 'check' : 'save', ab);
          label = `${a.kind === 'ability' ? 'Test' : 'Sauvegarde'} de ${ABILITY_LABELS[ab].long}`;
          break;
        }
        case 'skill': {
          const sk = findSkill(String(a.key ?? ''));
          if (!sk) throw new ToolError('key : compétence inconnue');
          bonus = R.skillBonus(c, sk.key);
          adv = R.effectAdvantage(c, 'check', sk.ability);
          label = sk.label;
          break;
        }
        case 'initiative':
          bonus = R.initiative(c);
          adv = R.effectAdvantage(c, 'check', 'dex');
          label = 'Initiative';
          break;
        case 'attack': {
          const k = norm(String(a.key ?? ''));
          attack = c.attacks.find((x) => x.id === a.key || norm(x.name) === k) ?? c.attacks.find((x) => norm(x.name).includes(k));
          if (!attack) throw new ToolError(`Attaque inconnue. Disponibles : ${c.attacks.map((x) => x.name).join(', ')}`);
          bonus = R.attackToHit(c, attack);
          adv = R.effectAdvantage(c, 'attack', attack);
          label = `Attaque : ${attack.name}`;
          break;
        }
        case 'death_save': {
          const r = rollD20(0, 'normal');
          const res = R.resolveDeathSave(c, r.nat);
          save(row, res.char);
          logRoll(row.id, 'Sauvegarde contre la mort', `d20[${r.nat}]`, r.nat);
          return { naturel: r.nat, resultat: res.outcome, jets: res.char.combat.deathSaves, pv: res.char.combat.hpCurrent };
        }
        default:
          throw new ToolError('kind invalide');
      }
      // Avantage des effets actifs (Rage, Témérité…) ; avantage + désavantage = normal.
      if (adv.length) mode = mode === 'disadvantage' ? 'normal' : 'advantage';
      const r = rollD20(bonus + pen, mode);
      const detail = `d20[${r.rolls.join(',')}]${mode !== 'normal' ? ` (${mode === 'advantage' ? 'avantage' : 'désavantage'})` : ''} ${R.fmtMod(bonus)}${pen ? ` ${pen} épuisement` : ''}`;
      logRoll(row.id, label, detail, r.total);
      const out: Record<string, unknown> = { jet: label, total: r.total, naturel: r.nat, des: r.rolls, bonus, critique: r.isCrit, echec_critique: r.isFumble };
      if (adv.length) out.avantage_effets = adv;
      if (attack) {
        const expr = R.damageExpression(c, attack);
        const d = roll(expr, { crit: r.isCrit });
        logRoll(row.id, `Dégâts : ${attack.name}${r.isCrit ? ' (critique)' : ''}`, describeRoll(d), Math.max(0, d.total));
        out.degats = { total: Math.max(0, d.total), detail: describeRoll(d), type: attack.damageType, note: 'À appliquer seulement si le jet touche la CA de la cible.' };
      }
      return out;
    },
  },
  {
    name: 'adjust_hp',
    title: 'Modifier les PV',
    description:
      'Applique des dégâts (les PV temporaires absorbent d’abord ; damage_type applique résistances, immunités et vulnérabilités de la fiche et des effets actifs), des soins, ou des PV temporaires (non cumulables : le plus élevé est gardé). ' +
      'Si le personnage se concentre, le DD du JdS de Constitution est indiqué.',
    inputSchema: { type: 'object', properties: { character_id: charId, type: { type: 'string', enum: ['damage', 'heal', 'temp'] }, amount: { type: 'integer', minimum: 0 }, damage_type: { type: 'string', description: 'ex. Feu, Tranchant (optionnel)' } }, required: ['character_id', 'type', 'amount'] },
    run: (user, a) => {
      const { row, c } = load(user, a.character_id);
      const n = Math.max(0, Math.floor(Number(a.amount) || 0));
      const adj = a.type === 'damage' ? R.adjustDamage(c, n, String(a.damage_type ?? '')) : { amount: n, note: '' };
      const next = a.type === 'damage' ? R.applyDamage(c, adj.amount) : a.type === 'heal' ? R.applyHealing(c, n) : R.setTempHp(c, n);
      const s = save(row, next);
      const out: Record<string, unknown> = { pv: s.combat.hpCurrent, pv_max: s.combat.hpMax, pv_temp: s.combat.hpTemp, a_terre: s.combat.hpCurrent === 0 };
      if (a.type === 'damage') {
        out.degats_subis = adj.amount;
        if (adj.note) out.ajustement = adj.note;
        if (c.combat.concentration && adj.amount > 0) {
          out.concentration = s.combat.concentration
            ? { sort: c.combat.concentration, jds_constitution_dd: R.concentrationDC(adj.amount) }
            : { sort: c.combat.concentration, rompue: 'À 0 PV, la concentration prend fin.' };
        }
      }
      return out;
    },
  },
  {
    name: 'manage_inventory',
    title: "Gérer l'inventaire",
    description:
      'action add : ajoute un objet (name, qty, value, description, container = nom du contenant, créé s’il n’existe pas ; vide = sac principal). ' +
      'action remove : retire qty exemplaires de l’objet nommé (supprimé à 0). action coins : ajoute/retire de la monnaie (coins = {"po": -5, "pa": 3}).',
    inputSchema: {
      type: 'object',
      properties: {
        character_id: charId,
        action: { type: 'string', enum: ['add', 'remove', 'coins'] },
        name: { type: 'string' }, qty: { type: 'integer', minimum: 1 }, value: { type: 'string' }, description: { type: 'string' }, container: { type: 'string' },
        coins: { type: 'object', properties: { pc: { type: 'integer' }, pa: { type: 'integer' }, pe: { type: 'integer' }, po: { type: 'integer' }, pp: { type: 'integer' } } },
      },
      required: ['character_id', 'action'],
    },
    run: (user, a) => {
      const { row, c } = load(user, a.character_id);
      const qty = Math.max(1, Math.floor(Number(a.qty) || 1));
      if (a.action === 'coins') {
        for (const [k, v] of Object.entries(a.coins ?? {})) {
          if (!(k in c.coins)) continue;
          const key = k as keyof Character['coins'];
          const next = c.coins[key] + Math.trunc(Number(v) || 0);
          if (next < 0) throw new ToolError(`Pas assez de ${k} (${c.coins[key]})`);
          c.coins[key] = next;
        }
        return { monnaie: save(row, c).coins };
      }
      if (!a.name) throw new ToolError('name requis');
      if (a.action === 'add') {
        let containerId = '';
        if (a.container && norm(a.container) !== norm('Sac principal')) {
          let box = c.containers.find((b) => norm(b.name) === norm(a.container));
          if (!box) c.containers.push((box = { id: uid(), name: a.container }));
          containerId = box.id;
        }
        const existing = c.inventory.find((i) => norm(i.name) === norm(a.name) && i.containerId === containerId);
        if (existing) existing.qty += qty;
        else c.inventory.push({ id: uid(), name: a.name, qty, weight: 0, equipped: false, attuned: false, value: a.value ?? '', notes: a.description ?? '', containerId });
        save(row, c);
        return { ok: true, objet: a.name, contenant: a.container || 'Sac principal' };
      }
      if (a.action === 'remove') {
        const it = c.inventory.find((i) => norm(i.name) === norm(a.name)) ?? c.inventory.find((i) => norm(i.name).includes(norm(a.name)));
        if (!it) throw new ToolError(`Objet introuvable : ${a.name}`);
        it.qty -= qty;
        if (it.qty <= 0) c.inventory = c.inventory.filter((i) => i !== it);
        save(row, c);
        return { ok: true, objet: it.name, restant: Math.max(0, it.qty) };
      }
      throw new ToolError('action invalide');
    },
  },
  {
    name: 'use_resource',
    title: 'Dépenser / récupérer une ressource',
    description: 'Ressource de classe (Rage, Ki…), emplacement de sort (resource = « slot 1 » … « slot 9 ») ou point d’Inspiration (resource = « inspiration »). delta négatif = dépenser, positif = récupérer.',
    inputSchema: { type: 'object', properties: { character_id: charId, resource: { type: 'string' }, delta: { type: 'integer' } }, required: ['character_id', 'resource', 'delta'] },
    run: (user, a) => {
      const { row, c } = load(user, a.character_id);
      const delta = Math.trunc(Number(a.delta) || 0);
      const key = norm(String(a.resource));
      if (key === 'inspiration') {
        if (c.combat.heroicInspiration + delta < 0) throw new ToolError('Pas assez de points d’Inspiration');
        c.combat.heroicInspiration += delta;
        return { inspiration: save(row, c).combat.heroicInspiration };
      }
      const slot = key.match(/^(?:slot|emplacement)\s*(\d)$/);
      if (slot) {
        const s = c.spellcasting.slots.find((x) => x.level === Number(slot[1]));
        if (!s) throw new ToolError(`Pas d’emplacement de niveau ${slot[1]}`);
        const used = s.used - delta;
        if (used < 0 || used > s.max) throw new ToolError(`Emplacements de niveau ${s.level} : ${s.max - s.used}/${s.max} restants`);
        s.used = used;
        save(row, c);
        return { niveau: s.level, restants: s.max - s.used, max: s.max };
      }
      const r = c.resources.find((x) => x.id === a.resource || norm(x.name) === key) ?? c.resources.find((x) => norm(x.name).includes(key));
      if (!r) throw new ToolError(`Ressource inconnue. Disponibles : ${c.resources.map((x) => x.name).join(', ') || 'aucune'}`);
      const used = r.used - delta;
      if (used < 0 || used > r.max) throw new ToolError(`${r.name} : ${r.max - r.used}/${r.max} restants`);
      r.used = used;
      save(row, c);
      return { ressource: r.name, restants: r.max - r.used, max: r.max };
    },
  },
  {
    name: 'rest',
    title: 'Repos',
    description: 'Repos court (ressources « repos court ») ou long (PV, dés de vie, emplacements, ressources ; épuisement −1).',
    inputSchema: { type: 'object', properties: { character_id: charId, type: { type: 'string', enum: ['short', 'long'] } }, required: ['character_id', 'type'] },
    run: (user, a) => {
      const { row, c } = load(user, a.character_id);
      const s = save(row, a.type === 'long' ? R.longRest(c) : R.shortRest(c));
      return { ok: true, pv: `${s.combat.hpCurrent}/${s.combat.hpMax}`, ressources: s.resources.map((r) => `${r.name} ${r.max - r.used}/${r.max}`) };
    },
  },
  {
    name: 'search_rules',
    title: 'Chercher dans les règles (SRD 5.2.1)',
    description: 'Recherche sorts, objets magiques, dons, armes, armures, équipement et règles (glossaire). lang fr (défaut) ou en. Avec id, renvoie le texte complet d’une entrée.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, id: { type: 'string' }, type: { type: 'string', description: 'spell, magic-item, feat, weapon, armor, gear, tool, rule (plusieurs séparés par des virgules)' }, lang: { type: 'string', enum: ['fr', 'en'] }, limit: { type: 'integer', minimum: 1, maximum: 20 } },
    },
    readOnly: true,
    run: (_user, a) => {
      if (a.id) {
        const e = getSrdEntry(String(a.id));
        if (!e) throw new ToolError('Entrée introuvable');
        return e;
      }
      const r = searchSrd({ q: a.query, type: a.type, lang: a.lang, limit: Math.min(20, Number(a.limit) || 8) });
      return { total: r.total, resultats: r.results.map((e) => ({ id: e.id, nom: e.name, type: e.type, meta: e.meta, extrait: e.body.slice(0, 400) })) };
    },
  },
];

// ---------------------------------------------------------------------------
// JSON-RPC

type RpcMsg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };
const rpcError = (id: RpcMsg['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const rpcResult = (id: RpcMsg['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });

export function handleRpc(user: SessionUser, msg: RpcMsg) {
  const isNotification = msg.id === undefined;
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return isNotification ? null : rpcError(msg.id, -32600, 'Requête invalide');
  switch (msg.method) {
    case 'initialize': {
      const requested = msg.params?.protocolVersion;
      return rpcResult(msg.id, {
        protocolVersion: PROTOCOLS.includes(requested) ? requested : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return isNotification ? null : rpcResult(msg.id, {});
    case 'tools/list':
      return rpcResult(msg.id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: !!t.readOnly, destructiveHint: false, openWorldHint: false },
        })),
      });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return rpcError(msg.id, -32602, `Outil inconnu : ${msg.params?.name}`);
      try {
        const out = tool.run(user, msg.params?.arguments ?? {});
        return rpcResult(msg.id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: Array.isArray(out) ? { items: out } : out, isError: false });
      } catch (e) {
        const message = e instanceof ToolError || e instanceof Error ? e.message : String(e);
        return rpcResult(msg.id, { content: [{ type: 'text', text: `Erreur : ${message}` }], isError: true });
      }
    }
    default:
      if (msg.method.startsWith('notifications/')) return null;
      return isNotification ? null : rpcError(msg.id, -32601, `Méthode non prise en charge : ${msg.method}`);
  }
}

export default async function mcpRoutes(app: FastifyInstance) {
  const unauthorized = (reply: any) =>
    reply
      .code(401)
      .header('WWW-Authenticate', 'Bearer realm="grimoire", error="invalid_token"')
      .send({ error: 'Jeton manquant ou invalide. Créez un jeton dans « Mon compte » et envoyez « Authorization: Bearer grm_… ».' });

  app.post('/mcp', { bodyLimit: 2 * 1024 * 1024, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    const user = userFromBearer(req.headers.authorization);
    if (!user) return unauthorized(reply);
    const body = req.body as RpcMsg | RpcMsg[];
    if (Array.isArray(body)) {
      const out = body.map((m) => handleRpc(user, m)).filter(Boolean);
      return out.length ? reply.send(out) : reply.code(202).send();
    }
    if (!body || typeof body !== 'object') return reply.code(400).send(rpcError(null, -32700, 'JSON invalide'));
    const res = handleRpc(user, body);
    return res ? reply.send(res) : reply.code(202).send();
  });

  // Pas de flux SSE : le client doit utiliser POST.
  app.get('/mcp', async (_req, reply) => reply.code(405).header('Allow', 'POST').send({ error: 'Utilisez POST (MCP Streamable HTTP, réponses JSON).' }));
  app.delete('/mcp', async (_req, reply) => reply.code(405).header('Allow', 'POST').send());
}
