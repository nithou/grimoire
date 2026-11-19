import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { BookOpen, Backpack, Image, NotebookPen, ScrollText, Shield, Sparkles, User, Wand2, RefreshCw, Plus, Trash2, Crown, History, Eye, Flame, ShieldHalf, Award, Compass } from 'lucide-react';
import { CharacterLog } from '../components/CharacterLog';
import { SharePanel } from '../components/SharePanel';
import { useCharacter } from '../useCharacter';
import type { Character, AttackT, ItemT, SpellT, ResourceT, FeatureT, EffectT } from '../../shared/schema';
import { FEATURE_KINDS } from '../../shared/schema';
import { uid } from '../../shared/schema';
import {
  FEATURE_KIND_LABELS, ABILITIES, ABILITY_LABELS, ALIGNMENTS, BACKGROUNDS, CLASSES, CONDITIONS, DAMAGE_TYPES, SKILLS, SPECIES, WEAPON_MASTERIES, findClass, COINS,
  SRD_BACKGROUNDS, FEAT_TYPES, SENSES, norm, type Ability,
} from '../../shared/srd-fr';
import { api } from '../api';
import * as R from '../../shared/rules';
import { DataList, Field, ListEditor, MD_HINT, Num, Select, Skeleton, Tabs, TagInput, Text, TextArea } from '../ui';

const MdHint = () => <span className="md-hint" title={MD_HINT}>· **gras** *italique*</span>;
import { SheetHeader, ToVerifyBanner } from '../components/SheetHeader';
import { SrdPicker } from '../components/SrdPicker';
import { Gallery } from '../components/Gallery';
import { srdToAttack, srdToFeature, srdToItem, srdToSpell } from '../srdToSheet';

type Tab = 'identite' | 'stats' | 'combat' | 'sorts' | 'inventaire' | 'profil' | 'notes' | 'partage' | 'log';
type Up = (fn: (c: Character) => void) => void;

const fm = R.fmtMod;

export default function SheetEdit() {
  const { id = '' } = useParams();
  const { char: c, status, update, reload, forceSave, error, role, owner } = useCharacter(id);
  const [tab, setTab] = useState<Tab>('identite');
  if (!c) return status === 'error' ? <div className="card error">{error}</div> : <div className="card"><Skeleton lines={8} /></div>;
  const up: Up = (fn) => update((d) => { fn(d); });

  return (
    <div>
      <SheetHeader id={id} c={c} mode="edit" status={status} onForce={forceSave} onReload={reload} onXp={(xp) => up((d) => { d.identity.xp = xp; })} onPortrait={(pid) => up((d) => { d.identity.portrait = pid; if (!d.images.includes(pid)) d.images.push(pid); })} role={role} owner={owner} />
      <ToVerifyBanner items={c.toVerify} onChange={(v) => up((d) => { d.toVerify = v; })} />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'identite', label: 'Identité', icon: <User size={16} /> },
          { key: 'stats', label: 'Caractéristiques', icon: <Sparkles size={16} /> },
          { key: 'combat', label: 'Combat', icon: <Shield size={16} /> },
          { key: 'sorts', label: 'Sorts', icon: <Wand2 size={16} /> },
          { key: 'inventaire', label: 'Inventaire', icon: <Backpack size={16} /> },
          { key: 'profil', label: 'Profil & aptitudes', icon: <ScrollText size={16} /> },
          { key: 'notes', label: 'Notes', icon: <NotebookPen size={16} /> },
          { key: 'partage', label: role === 'dm' ? 'Maître du Donjon' : 'Partage (MJ)', icon: <Crown size={16} /> },
          { key: 'log', label: 'Log', icon: <History size={16} /> },
        ]}
      />
      <div className="fade-in" key={tab}>
        {tab === 'identite' && <IdentityTab c={c} up={up} />}
        {tab === 'stats' && <StatsTab c={c} up={up} />}
        {tab === 'combat' && <CombatTab c={c} up={up} />}
        {tab === 'sorts' && <SpellsTab c={c} up={up} />}
        {tab === 'inventaire' && <InventoryTab c={c} up={up} />}
        {tab === 'profil' && <ProfileTab c={c} up={up} />}
        {tab === 'partage' && <SharePanel characterId={id} role={role} owner={owner} />}
        {tab === 'log' && <CharacterLog characterId={id} refreshKey={status === 'saved'} />}
        {tab === 'notes' && (
          <div className="sheet-layout">
            <div className="card stack">
              <h2><NotebookPen size={18} /> Notes</h2>
              <TextArea rows={18} value={c.notes} onChange={(v) => up((d) => { d.notes = v; })} placeholder="Notes de session, PNJ, indices…" />
              <div className="small muted">{MD_HINT}</div>
            </div>
            <div className="card stack">
              <h2><Image size={18} /> Images</h2>
              <Gallery characterId={id} portrait={c.identity.portrait} onSetPortrait={(p) => up((d) => { d.identity.portrait = p; })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function IdentityTab({ c, up }: { c: Character; up: Up }) {
  const set = <K extends keyof Character['identity']>(k: K, v: Character['identity'][K]) => up((d) => { d.identity[k] = v; });
  return (
    <div className="sheet-layout">
      <div className="card stack">
        <h2>Identité</h2>
        <Field label="Nom du personnage"><Text value={c.identity.name} onChange={(v) => set('name', v)} /></Field>
        <div className="grid g2">
          <Field label="Joueur"><Text value={c.identity.player} onChange={(v) => set('player', v)} /></Field>
          <Field label="Espèce"><Text list="dl-species" value={c.identity.species} onChange={(v) => set('species', v)} /></Field>
          <Field label="Historique"><Text list="dl-bg" value={c.identity.background} onChange={(v) => set('background', v)} /></Field>
          <Field label="Alignement"><Text list="dl-align" value={c.identity.alignment} onChange={(v) => set('alignment', v)} /></Field>
          <Field label="Points d'expérience"><Num value={c.identity.xp} onChange={(v) => set('xp', v ?? 0)} min={0} /></Field>
          <Field label="Taille">
            <Select value={c.identity.size} onChange={(v) => set('size', v)} options={['TP', 'P', 'M', 'G', 'TG', 'Gig'].map((s) => ({ value: s, label: { TP: 'Très petite', P: 'Petite', M: 'Moyenne', G: 'Grande', TG: 'Très grande', Gig: 'Gigantesque' }[s]! }))} />
          </Field>
          <Field label="Âge"><Text value={c.identity.age} onChange={(v) => set('age', v)} /></Field>
        </div>
        <Field label="Apparence"><TextArea value={c.identity.appearance} onChange={(v) => set('appearance', v)} rows={3} /></Field>
        <DataList id="dl-species" options={SPECIES} />
        <DataList id="dl-bg" options={BACKGROUNDS} />
        <DataList id="dl-align" options={ALIGNMENTS} />
        <OriginHelper c={c} up={up} />
      </div>
      <div className="stack" style={{ gap: '1rem' }}>
        <div className="card stack">
          <h2>Classes</h2>
          <ListEditor
            items={c.classes}
            onChange={(v) => up((d) => { d.classes = v; })}
            make={() => ({ name: '', subclass: '', level: 1, hitDie: 'd8' as const })}
            addLabel="Ajouter une classe (multiclasse)"
            render={(k, set) => (
              <div className="grid g4">
                <Field label="Classe">
                  <Text list="dl-classes" value={k.name} onChange={(v) => { const info = findClass(v); set(info ? { name: info.name, hitDie: info.hitDie } : { name: v }); }} />
                </Field>
                <Field label="Sous-classe"><Text list={`dl-sub-${k.id}`} value={k.subclass} onChange={(v) => set({ subclass: v })} /></Field>
                <Field label="Niveau"><Num value={k.level} min={1} max={20} onChange={(v) => set({ level: Math.max(1, Math.min(20, v ?? 1)) })} /></Field>
                <Field label="Dé de vie">
                  <Select value={k.hitDie} onChange={(v) => set({ hitDie: v })} options={['d6', 'd8', 'd10', 'd12'].map((x) => ({ value: x as 'd6', label: x }))} />
                </Field>
                <DataList id={`dl-sub-${k.id}`} options={[findClass(k.name)?.srdSubclass ?? ''].filter(Boolean)} />
              </div>
            )}
          />
          <DataList id="dl-classes" options={CLASSES.map((k) => k.name)} />
          <div className="small muted">Niveau total {R.totalLevel(c)} · Bonus de maîtrise {fm(R.proficiencyBonus(c))}</div>
        </div>
        <div className="card stack">
          <h3>Points à vérifier</h3>
          <TagInput value={c.toVerify} onChange={(v) => up((d) => { d.toVerify = v; })} placeholder="Ajouter une note de vérification" />
        </div>
      </div>
    </div>
  );
}

/** Historique du SRD 2024 : rappel de ce qu'il apporte et application en un clic. */
function OriginHelper({ c, up }: { c: Character; up: Up }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const bg = SRD_BACKGROUNDS.find((b) => norm(b.name) === norm(c.identity.background));
  if (!bg) return null;
  const skillLabel = (k: string) => SKILLS.find((s) => s.key === k)!.label;
  const hasFeat = c.features.some((f) => norm(f.name) === norm(bg.feat));
  const missingSkills = bg.skills.filter((k) => !(c.skills[k]?.prof));
  const missingTool = !c.proficiencies.tools.some((t) => norm(t) === norm(bg.tool));
  const todo = !hasFeat || missingSkills.length > 0 || missingTool;

  const apply = async () => {
    setBusy(true);
    setMsg('');
    let feat: FeatureT | null = null;
    if (!hasFeat) {
      try {
        const r = await api.srdSearch({ q: bg.feat.replace(/\s*\(.*\)$/, ''), type: 'feat', lang: 'fr', limit: 5 });
        const hit = r.results.find((x) => norm(bg.feat).startsWith(norm(x.name)));
        if (hit) feat = srdToFeature(await api.srdEntry(hit.id));
      } catch { /* hors ligne : don ajouté sans description */ }
      feat = feat ? { ...feat, name: bg.feat } : { id: uid(), name: bg.feat, source: '', description: '', kind: 'passive', category: 'feat', featType: 'Origine' };
      feat.source = `Historique : ${bg.name}`;
    }
    up((d) => {
      for (const k of bg.skills) d.skills[k] = { prof: Math.max(1, d.skills[k]?.prof ?? 0) as 1 | 2, bonus: d.skills[k]?.bonus ?? 0 };
      if (missingTool) d.proficiencies.tools.push(bg.tool);
      if (feat) d.features.push(feat);
    });
    setBusy(false);
    setMsg('Appliqué. Pensez aux valeurs de caractéristique (onglet Caractéristiques).');
  };

  return (
    <div className="banner stack" style={{ gap: 6 }}>
      <strong className="row" style={{ gap: 6 }}><Award size={16} /> Historique « {bg.name} » (règles 2024)</strong>
      <div className="small">
        <div>Caractéristiques : +2 à l'une et +1 à une autre, ou +1 aux trois : <strong>{bg.abilities.map((a) => ABILITY_LABELS[a].long).join(', ')}</strong></div>
        <div>Don d'origine : <strong>{bg.feat}</strong>{hasFeat && ' ✓'}</div>
        <div>Compétences : {bg.skills.map(skillLabel).join(' et ')}{missingSkills.length === 0 && ' ✓'}</div>
        <div>Outil : {bg.tool}{!missingTool && ' ✓'}</div>
      </div>
      {todo && <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={apply}>Ajouter le don, les compétences et l'outil</button>}
      {msg && <div className="small muted">{msg}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
function StatsTab({ c, up }: { c: Character; up: Up }) {
  const classSaves = c.classes[0] ? findClass(c.classes[0].name)?.saves : undefined;
  return (
    <div className="sheet-layout">
      <div className="stack" style={{ gap: '1rem' }}>
        <div className="card stack">
          <h2>Caractéristiques</h2>
          <div className="abil-grid">
            {ABILITIES.map((a) => (
              <div key={a} className="plate">
                <div className="lbl">{ABILITY_LABELS[a].long.toUpperCase()}</div>
                <Num value={c.abilities[a]} min={1} max={30} onChange={(v) => up((d) => { d.abilities[a] = Math.max(1, Math.min(30, v ?? 10)); })} />
                <div className="big">{fm(R.mod(c, a))}</div>
                <label className="save-chip" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" style={{ width: 14, height: 14 }} checked={c.savingThrows.includes(a)} onChange={(e) => up((d) => {
                    d.savingThrows = e.target.checked ? [...d.savingThrows, a] : d.savingThrows.filter((x) => x !== a);
                  })} />
                  JS {fm(R.saveBonus(c, a))}
                </label>
              </div>
            ))}
          </div>
          {classSaves && classSaves.some((s) => !c.savingThrows.includes(s)) && (
            <button className="btn sm" onClick={() => up((d) => { d.savingThrows = [...new Set([...d.savingThrows, ...classSaves])]; })}>
              <RefreshCw size={14} /> Appliquer les sauvegardes de {c.classes[0].name} ({classSaves.map((s) => ABILITY_LABELS[s].short).join(', ')})
            </button>
          )}
        </div>
        <div className="card stack">
          <h2><Eye size={18} /> Sens & perception passive</h2>
          <div className="row" style={{ alignItems: 'flex-end', gap: '1rem' }}>
            <div className="pp-box"><span className="big-num">{R.passivePerception(c)}</span></div>
            <Field label={`Valeur (vide = calcul : ${10 + R.skillBonus(c, 'perception')})`} className="grow">
              <Num nullable placeholder={String(10 + R.skillBonus(c, 'perception'))} value={c.overrides.passivePerception} onChange={(v) => up((d) => { d.overrides.passivePerception = v; })} />
            </Field>
            {c.overrides.passivePerception != null && (
              <button className="btn sm" onClick={() => up((d) => { d.overrides.passivePerception = null; })}>Revenir au calcul</button>
            )}
          </div>
          <p className="small muted" style={{ margin: 0 }}>Calcul : 10 + bonus de Perception ({fm(R.skillBonus(c, 'perception'))}).</p>
          <div className="small muted">
            Perspicacité passive {R.passiveSkill(c, 'perspicacite')} · Investigation passive {R.passiveSkill(c, 'investigation')}
          </div>
          <Field label="Sens spéciaux">
            <TagInput value={c.senses} onChange={(v) => up((d) => { d.senses = v; })} placeholder="ex. Vision dans le noir 18 m" suggestions={SENSES} />
          </Field>
        </div>
        <div className="card stack">
          <h3>Valeurs forcées</h3>
          <p className="small muted" style={{ margin: 0 }}>Laissez vide pour le calcul automatique.</p>
          <div className="grid g3">
            <Field label={`Bonus de maîtrise (auto ${fm(2 + Math.floor((R.totalLevel(c) - 1) / 4))})`}><Num nullable value={c.overrides.proficiencyBonus} onChange={(v) => up((d) => { d.overrides.proficiencyBonus = v; })} /></Field>
            <Field label="Initiative"><Num nullable value={c.overrides.initiative} onChange={(v) => up((d) => { d.overrides.initiative = v; })} /></Field>
            <Field label="Bonus à tous les JS"><Num value={c.saveBonus} onChange={(v) => up((d) => { d.saveBonus = v ?? 0; })} /></Field>
          </div>
        </div>
      </div>
      <div className="card">
        <h2>Compétences</h2>
        <table className="tbl">
          <thead><tr><th>Compétence</th><th>Maîtrise</th><th>Bonus divers</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
          <tbody>
            {SKILLS.map((s) => {
              const st = c.skills[s.key] ?? { prof: 0, bonus: 0 };
              return (
                <tr key={s.key}>
                  <td>{s.label} <span className="muted small">({ABILITY_LABELS[s.ability].short})</span></td>
                  <td>
                    <select value={st.prof} onChange={(e) => up((d) => { d.skills[s.key] = { ...st, prof: Number(e.target.value) as 0 | 1 | 2 }; })} aria-label={`Maîtrise ${s.label}`}>
                      <option value={0}>—</option>
                      <option value={1}>Maîtrise</option>
                      <option value={2}>Expertise</option>
                    </select>
                  </td>
                  <td style={{ width: 90 }}><Num value={st.bonus} onChange={(v) => up((d) => { d.skills[s.key] = { ...st, bonus: v ?? 0 }; })} /></td>
                  <td className="bonus">{fm(R.skillBonus(c, s.key))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function CombatTab({ c, up }: { c: Character; up: Up }) {
  const [picker, setPicker] = useState(false);
  const expected = R.expectedHitDice(c);
  return (
    <div className="sheet-layout">
      <div className="stack" style={{ gap: '1rem' }}>
        <div className="card stack">
          <h2>Défense & déplacement</h2>
          <div className="grid g3">
            <Field label="Classe d'armure"><Num value={c.combat.ac} onChange={(v) => up((d) => { d.combat.ac = v ?? 10; })} /></Field>
            <Field label="Bonus d'initiative"><Num value={c.combat.initiativeBonus} onChange={(v) => up((d) => { d.combat.initiativeBonus = v ?? 0; })} /></Field>
            <Field label="Vitesse (m)"><Num step={1.5} value={c.combat.speed} onChange={(v) => up((d) => { d.combat.speed = v ?? 9; })} /></Field>
          </div>
          <Field label="Détail de la CA (armure, bouclier…)"><Text value={c.combat.acNote} onChange={(v) => up((d) => { d.combat.acNote = v; })} placeholder="ex. Défense sans armure 10 + DEX + CON" /></Field>
          <div className="small muted">
            Initiative {fm(R.initiative(c))} · Défense sans armure (Barbare) {10 + R.mod(c, 'dex') + R.mod(c, 'con')} · (Moine) {10 + R.mod(c, 'dex') + R.mod(c, 'sag')}
          </div>
        </div>
        <div className="card stack">
          <h2>Points de vie</h2>
          <div className="grid g3">
            <Field label="PV max"><Num value={c.combat.hpMax} min={1} onChange={(v) => up((d) => { d.combat.hpMax = Math.max(1, v ?? 1); d.combat.hpCurrent = Math.min(d.combat.hpCurrent, d.combat.hpMax); })} /></Field>
            <Field label="PV actuels"><Num value={c.combat.hpCurrent} min={0} onChange={(v) => up((d) => { d.combat.hpCurrent = Math.max(0, Math.min(d.combat.hpMax, v ?? 0)); })} /></Field>
            <Field label="PV temporaires"><Num value={c.combat.hpTemp} min={0} onChange={(v) => up((d) => { d.combat.hpTemp = Math.max(0, v ?? 0); })} /></Field>
          </div>
          {c.classes.length > 0 && R.suggestedHp(c) !== c.combat.hpMax && (
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => up((d) => { d.combat.hpMax = R.suggestedHp(c); d.combat.hpCurrent = Math.min(d.combat.hpCurrent, d.combat.hpMax); })}>
              PV moyens suggérés : {R.suggestedHp(c)} — appliquer
            </button>
          )}
          <h3>Dés de vie</h3>
          <ListEditor
            items={c.combat.hitDice.map((h, i) => ({ ...h, id: String(i) }))}
            onChange={(v) => up((d) => { d.combat.hitDice = v.map(({ id: _id, ...h }) => h); })}
            make={() => ({ die: 'd8' as const, total: 1, used: 0 })}
            render={(h, set) => (
              <div className="grid g3">
                <Field label="Dé"><Select value={h.die} onChange={(v) => set({ die: v })} options={['d6', 'd8', 'd10', 'd12'].map((x) => ({ value: x as 'd6', label: x }))} /></Field>
                <Field label="Total"><Num value={h.total} min={0} onChange={(v) => set({ total: v ?? 0 })} /></Field>
                <Field label="Dépensés"><Num value={h.used} min={0} onChange={(v) => set({ used: v ?? 0 })} /></Field>
              </div>
            )}
            extraActions={expected.length > 0 && (
              <button className="btn sm" onClick={() => up((d) => { d.combat.hitDice = expected.map((e) => ({ die: e.die as 'd8', total: e.total, used: 0 })); })}>
                <RefreshCw size={14} /> Depuis les classes ({expected.map((e) => `${e.total}${e.die}`).join(' + ')})
              </button>
            )}
          />
        </div>
        <div className="card stack">
          <h2>États</h2>
          <div className="row">
            {CONDITIONS.map((k) => (
              <button key={k} className={`chip ${c.combat.conditions.includes(k) ? 'on' : ''}`} onClick={() => up((d) => {
                d.combat.conditions = d.combat.conditions.includes(k) ? d.combat.conditions.filter((x) => x !== k) : [...d.combat.conditions, k];
              })}>{k}</button>
            ))}
          </div>
          <Field label={`Épuisement (niveau ${c.combat.exhaustion} : ${R.exhaustionPenalty(c)} aux tests d20)`}>
            <Num value={c.combat.exhaustion} min={0} max={6} onChange={(v) => up((d) => { d.combat.exhaustion = Math.max(0, Math.min(6, v ?? 0)); })} />
          </Field>
          <div className="grid g2">
            <Field label="JdS contre la mort : réussites (/3)"><Num value={c.combat.deathSaves.success} min={0} max={3} onChange={(v) => up((d) => { Object.assign(d, R.setDeathSaves(d, v ?? 0, d.combat.deathSaves.failure).char); })} /></Field>
            <Field label="JdS contre la mort : échecs (/3)"><Num value={c.combat.deathSaves.failure} min={0} max={3} onChange={(v) => up((d) => { Object.assign(d, R.setDeathSaves(d, d.combat.deathSaves.success, v ?? 0).char); })} /></Field>
          </div>
          <Field label="Points d'Inspiration"><Num value={c.combat.heroicInspiration} min={0} onChange={(v) => up((d) => { d.combat.heroicInspiration = Math.max(0, v ?? 0); })} /></Field>
        </div>
      </div>
      <div className="stack" style={{ gap: '1rem' }}>
        <div className="card stack">
          <div className="card-title"><h2>Attaques</h2><button className="btn sm" onClick={() => setPicker(true)}><BookOpen size={16} /> Arme du SRD</button></div>
          <ListEditor<AttackT>
            items={c.attacks}
            onChange={(v) => up((d) => { d.attacks = v; })}
            make={() => ({ name: 'Nouvelle attaque', ability: 'for', proficient: true, toHitBonus: 0, damage: '1d6', addAbilityToDamage: true, damageBonus: 0, damageType: '', mastery: '', range: '', notes: '', count: null, equipped: true })}
            render={(a, set) => (
              <div className="stack">
                <div className="grid g3">
                  <Field label="Nom"><Text value={a.name} onChange={(v) => set({ name: v })} /></Field>
                  <Field label="Caractéristique">
                    <Select value={a.ability} onChange={(v) => set({ ability: v })} options={[
                      ...ABILITIES.map((x) => ({ value: x as AttackT['ability'], label: ABILITY_LABELS[x].long })),
                      { value: 'finesse', label: 'Finesse (FOR ou DEX)' },
                      { value: 'spell', label: "Carac. d'incantation" },
                      { value: 'none', label: 'Aucune (bonus fixe)' },
                    ]} />
                  </Field>
                  <Field label="Bonus divers au toucher"><Num value={a.toHitBonus} onChange={(v) => set({ toHitBonus: v ?? 0 })} /></Field>
                  <Field label="Dés de dégâts"><Text value={a.damage} onChange={(v) => set({ damage: v })} placeholder="1d8" /></Field>
                  <Field label="Bonus divers aux dégâts"><Num value={a.damageBonus} onChange={(v) => set({ damageBonus: v ?? 0 })} /></Field>
                  <Field label="Type de dégâts"><Text list="dl-dmg" value={a.damageType} onChange={(v) => set({ damageType: v })} /></Field>
                  <Field label="Botte d'arme"><Text list="dl-mastery" value={a.mastery} onChange={(v) => set({ mastery: v })} /></Field>
                  <Field label="Portée"><Text value={a.range} onChange={(v) => set({ range: v })} /></Field>
                  <Field label="Nombre (armes de jet, javelines…)"><Num nullable placeholder="—" value={a.count} min={0} onChange={(v) => set({ count: v == null ? null : Math.max(0, v) })} /></Field>
                </div>
                <Field label={<>Notes (propriétés, effets, conditions…) <MdHint /></>}><TextArea rows={3} value={a.notes} onChange={(v) => set({ notes: v })} /></Field>
                <div className="row small">
                  <label className="row"><input type="checkbox" checked={a.equipped} onChange={(e) => set({ equipped: e.target.checked })} /> Équipée</label>
                  <label className="row"><input type="checkbox" checked={a.proficient} onChange={(e) => set({ proficient: e.target.checked })} /> Maîtrisée</label>
                  <label className="row"><input type="checkbox" checked={a.addAbilityToDamage} onChange={(e) => set({ addAbilityToDamage: e.target.checked })} /> Ajouter le mod. aux dégâts</label>
                  <span className="grow" />
                  <strong className="mono">Toucher {fm(R.attackToHit(c, a))} · Dégâts {R.damageExpression(c, a)} {a.damageType}</strong>
                </div>
              </div>
            )}
          />
          <DataList id="dl-dmg" options={DAMAGE_TYPES} />
          <DataList id="dl-mastery" options={WEAPON_MASTERIES.map((m) => m.label)} />
        </div>
        <EffectsEditor c={c} up={up} />
        <DefensesCard c={c} up={up} />
        <ResourcesCard c={c} up={up} />
      </div>
      {picker && <SrdPicker title="Ajouter une arme du SRD" types={['weapon']} onClose={() => setPicker(false)} onPick={(e) => up((d) => { d.attacks.push(srdToAttack(e)); })} />}
    </div>
  );
}

function DefensesCard({ c, up }: { c: Character; up: Up }) {
  const set = (k: keyof Character['defenses'], v: string[]) => up((d) => { d.defenses[k] = v; });
  return (
    <div className="card stack">
      <h2><ShieldHalf size={18} /> Résistances & immunités</h2>
      <p className="small muted" style={{ margin: 0 }}>Permanentes (espèce, objet, aptitude). En jeu, choisir le type de dégâts les applique : résistance = moitié, vulnérabilité = double.</p>
      <Field label="Résistances"><TagInput value={c.defenses.resistances} onChange={(v) => set('resistances', v)} placeholder="Résistance à…" suggestions={DAMAGE_TYPES} /></Field>
      <Field label="Immunités (dégâts)"><TagInput value={c.defenses.immunities} onChange={(v) => set('immunities', v)} placeholder="Immunité aux dégâts…" suggestions={DAMAGE_TYPES} /></Field>
      <Field label="Vulnérabilités"><TagInput value={c.defenses.vulnerabilities} onChange={(v) => set('vulnerabilities', v)} placeholder="Vulnérabilité à…" suggestions={DAMAGE_TYPES} /></Field>
      <Field label="Immunités (états)"><TagInput value={c.defenses.conditionImmunities} onChange={(v) => set('conditionImmunities', v)} placeholder="Immunité à l'état…" suggestions={CONDITIONS} /></Field>
    </div>
  );
}

/** Bonus de dégâts de Rage selon le niveau de Barbare (2024). */
const rageDamage = (lvl: number) => (lvl >= 16 ? 4 : lvl >= 9 ? 3 : 2);

/** Utilisations de Rage selon le niveau de Barbare (2024). */
const rageUses = (lvl: number) => (lvl >= 17 ? 6 : lvl >= 12 ? 5 : lvl >= 6 ? 4 : lvl >= 3 ? 3 : 2);

const EFFECT_PRESETS: { name: string; setup?: (d: Character) => void; make: (c: Character) => Omit<EffectT, 'id'> }[] = [
  {
    name: 'Rage',
    // Sans ressource « Rage » sur la fiche, on la crée pour que l'activation la décompte.
    setup: (d) => {
      if (d.resources.some((r) => norm(r.name).startsWith('rage'))) return;
      const lvl = d.classes.find((k) => norm(k.name) === 'barbare')?.level ?? 1;
      d.resources.push({ id: uid(), name: 'Rage', max: rageUses(lvl), used: 0, recharge: 'long', description: 'Récupère 1 utilisation par repos court.' });
    },
    make: (c) => ({
      name: 'Rage', active: false,
      resourceId: c.resources.find((r) => norm(r.name).startsWith('rage'))?.id ?? '',
      acBonus: 0, toHitBonus: 0, saveBonus: 0, advAttacks: false,
      damageBonus: rageDamage(c.classes.find((k) => norm(k.name) === 'barbare')?.level ?? 1), strOnly: true,
      advChecks: ['for'], advSaves: ['for'], resistances: ['Contondant', 'Perforant', 'Tranchant'],
      notes: "Sans armure lourde. Prend fin si tu es neutralisé, ou si ton tour se termine sans avoir attaqué, forcé un JdS ni prolongé la rage par une action bonus. Pas de sorts ni de concentration.",
    }),
  },
  {
    name: 'Témérité',
    make: () => ({
      name: 'Témérité', active: false, resourceId: '', acBonus: 0, toHitBonus: 0, damageBonus: 0, saveBonus: 0,
      strOnly: true, advAttacks: true, advChecks: [], advSaves: [], resistances: [],
      notes: "Les attaques contre toi ont l'avantage jusqu'au début de ton prochain tour.",
    }),
  },
  {
    name: 'Bouclier de la foi',
    make: () => ({
      name: 'Bouclier de la foi', active: false, resourceId: '', acBonus: 2, toHitBonus: 0, damageBonus: 0, saveBonus: 0,
      strOnly: false, advAttacks: false, advChecks: [], advSaves: [], resistances: [], notes: 'Sort de concentration, 10 minutes.',
    }),
  },
];

function AbilityToggles({ value, onChange }: { value: Ability[]; onChange: (v: Ability[]) => void }) {
  return (
    <span className="row" style={{ gap: 4 }}>
      {ABILITIES.map((a) => (
        <button key={a} type="button" className={`chip ${value.includes(a) ? 'on' : ''}`} aria-pressed={value.includes(a)}
          onClick={() => onChange(value.includes(a) ? value.filter((x) => x !== a) : [...value, a])}>{ABILITY_LABELS[a].short}</button>
      ))}
    </span>
  );
}

function EffectsEditor({ c, up }: { c: Character; up: Up }) {
  const blank = (): Omit<EffectT, 'id'> => ({ name: '', notes: '', active: false, resourceId: '', acBonus: 0, toHitBonus: 0, damageBonus: 0, saveBonus: 0, strOnly: false, advChecks: [], advSaves: [], advAttacks: false, resistances: [] });
  return (
    <div className="card stack">
      <h2><Flame size={18} /> Effets activables</h2>
      <p className="small muted" style={{ margin: 0 }}>Rage, Témérité, sorts reçus… En vue Jeu, un clic les active : les bonus et l'avantage s'appliquent aux jets, et ils prennent fin au repos.</p>
      <ListEditor<EffectT>
        items={c.effects}
        onChange={(v) => up((d) => { d.effects = v; })}
        make={blank}
        addLabel="Effet vierge"
        extraActions={EFFECT_PRESETS.filter((p) => !c.effects.some((e) => norm(e.name) === norm(p.name))).map((p) => (
          <button key={p.name} className="btn sm" onClick={() => up((d) => { p.setup?.(d); d.effects.push({ ...p.make(d), id: uid() }); })}><Plus size={14} /> {p.name}</button>
        ))}
        render={(e, set) => (
          <div className="stack">
            <div className="grid g3">
              <Field label="Nom"><Text value={e.name} onChange={(v) => set({ name: v })} /></Field>
              <Field label="Dépense à l'activation">
                <select value={e.resourceId} onChange={(ev) => set({ resourceId: ev.target.value })}>
                  <option value="">—</option>
                  {c.resources.map((r) => <option key={r.id} value={r.id}>{r.name || 'Ressource'}</option>)}
                </select>
              </Field>
              <Field label="Bonus à la CA"><Num value={e.acBonus} onChange={(v) => set({ acBonus: v ?? 0 })} /></Field>
              <Field label="Bonus au toucher"><Num value={e.toHitBonus} onChange={(v) => set({ toHitBonus: v ?? 0 })} /></Field>
              <Field label="Bonus aux dégâts"><Num value={e.damageBonus} onChange={(v) => set({ damageBonus: v ?? 0 })} /></Field>
              <Field label="Bonus aux JS"><Num value={e.saveBonus} onChange={(v) => set({ saveBonus: v ?? 0 })} /></Field>
            </div>
            <div className="row small" style={{ gap: 12 }}>
              <label className="row"><input type="checkbox" checked={e.advAttacks} onChange={(ev) => set({ advAttacks: ev.target.checked })} /> Avantage aux attaques</label>
              <label className="row"><input type="checkbox" checked={e.strOnly} onChange={(ev) => set({ strOnly: ev.target.checked })} /> Seulement les attaques de Force (dégâts et avantage)</label>
            </div>
            <div className="row small"><span style={{ minWidth: 150 }}>Avantage aux tests</span><AbilityToggles value={e.advChecks} onChange={(v) => set({ advChecks: v })} /></div>
            <div className="row small"><span style={{ minWidth: 150 }}>Avantage aux JS</span><AbilityToggles value={e.advSaves} onChange={(v) => set({ advSaves: v })} /></div>
            <Field label="Résistances pendant l'effet"><TagInput value={e.resistances} onChange={(v) => set({ resistances: v })} placeholder={`Résistance (${e.name || 'effet'})`} suggestions={DAMAGE_TYPES} /></Field>
            <Field label={<>Rappel affiché en jeu <MdHint /></>}><TextArea rows={2} value={e.notes} onChange={(v) => set({ notes: v })} /></Field>
          </div>
        )}
      />
    </div>
  );
}

function ResourcesCard({ c, up }: { c: Character; up: Up }) {
  return (
    <div className="card stack">
      <h2>Ressources de classe</h2>
      <p className="small muted" style={{ margin: 0 }}>Rage, Ki, Inspiration bardique, emplacements de pacte… avec leur recharge.</p>
      <ListEditor<ResourceT>
        items={c.resources}
        onChange={(v) => up((d) => { d.resources = v; })}
        make={() => ({ name: '', max: 1, used: 0, recharge: 'long', description: '' })}
        render={(r, set) => (
          <div className="stack">
            <div className="grid g4">
              <Field label="Nom"><Text value={r.name} onChange={(v) => set({ name: v })} /></Field>
              <Field label="Maximum"><Num value={r.max} min={0} onChange={(v) => set({ max: v ?? 0 })} /></Field>
              <Field label="Dépensées"><Num value={r.used} min={0} onChange={(v) => set({ used: v ?? 0 })} /></Field>
              <Field label="Recharge"><Select value={r.recharge} onChange={(v) => set({ recharge: v })} options={[{ value: 'short', label: 'Repos court' }, { value: 'long', label: 'Repos long' }, { value: 'none', label: 'Manuelle' }]} /></Field>
            </div>
            <Field label={<>Description (effets, conditions d'usage…) <MdHint /></>}><TextArea rows={2} value={r.description} onChange={(v) => set({ description: v })} /></Field>
          </div>
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
function SpellsTab({ c, up }: { c: Character; up: Up }) {
  const [picker, setPicker] = useState(false);
  const ab = R.spellAbility(c);
  const slots = Array.from({ length: 9 }, (_, i) => c.spellcasting.slots.find((s) => s.level === i + 1) ?? { level: i + 1, max: 0, used: 0 });
  const setSlot = (lvl: number, max: number) => up((d) => {
    const others = d.spellcasting.slots.filter((s) => s.level !== lvl);
    d.spellcasting.slots = max > 0 ? [...others, { level: lvl, max, used: Math.min(max, d.spellcasting.slots.find((s) => s.level === lvl)?.used ?? 0) }].sort((a, b) => a.level - b.level) : others;
  });
  return (
    <div className="sheet-layout">
      <div className="card stack">
        <h2>Incantation</h2>
        <Field label="Caractéristique d'incantation">
          <select value={c.spellcasting.ability ?? ''} onChange={(e) => up((d) => { d.spellcasting.ability = (e.target.value || null) as any; })}>
            <option value="">Auto (d'après la classe{ab ? ` : ${ABILITY_LABELS[ab].long}` : ''})</option>
            {ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_LABELS[a].long}</option>)}
          </select>
        </Field>
        <div className="stat-strip">
          <div className="stat"><div className="v">{R.spellSaveDC(c) ?? '—'}</div><div className="k">DD des sorts</div></div>
          <div className="stat"><div className="v">{R.spellAttack(c) != null ? fm(R.spellAttack(c)!) : '—'}</div><div className="k">Attaque de sort</div></div>
        </div>
        <h3>Emplacements de sorts (maximum)</h3>
        <div className="grid g3">
          {slots.map((s) => (
            <Field key={s.level} label={`Niveau ${s.level}`}><Num value={s.max} min={0} max={9} onChange={(v) => setSlot(s.level, Math.max(0, v ?? 0))} /></Field>
          ))}
        </div>
      </div>
      <div className="card stack">
        <div className="card-title"><h2>Sorts connus / préparés</h2><button className="btn sm" onClick={() => setPicker(true)}><BookOpen size={16} /> Sort du SRD</button></div>
        <ListEditor<SpellT>
          items={c.spellcasting.spells}
          onChange={(v) => up((d) => { d.spellcasting.spells = v; })}
          make={() => ({ name: '', level: 0, prepared: false, alwaysPrepared: false, srdName: '', notes: '', concentration: false })}
          render={(s, set) => (
            <div className="stack">
              <div className="grid g3">
                <Field label="Nom" className=""><Text value={s.name} onChange={(v) => set({ name: v })} /></Field>
                <Field label="Niveau (0 = mineur)"><Num value={s.level} min={0} max={9} onChange={(v) => set({ level: v ?? 0 })} /></Field>
                <Field label="Notes"><Text value={s.notes} onChange={(v) => set({ notes: v })} /></Field>
              </div>
              <div className="row small">
                <label className="row"><input type="checkbox" checked={s.prepared} onChange={(e) => set({ prepared: e.target.checked })} /> Préparé</label>
                <label className="row"><input type="checkbox" checked={s.alwaysPrepared} onChange={(e) => set({ alwaysPrepared: e.target.checked })} /> Toujours préparé</label>
                <label className="row"><input type="checkbox" checked={s.concentration} onChange={(e) => set({ concentration: e.target.checked })} /> Concentration</label>
                {s.srdName && <span className="chip">SRD</span>}
              </div>
            </div>
          )}
        />
      </div>
      {picker && <SrdPicker title="Ajouter un sort du SRD" types={['spell']} onClose={() => setPicker(false)} onPick={(e) => up((d) => { d.spellcasting.spells.push(srdToSpell(e)); d.spellcasting.spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)); })} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
const MAIN_BAG = 'Sac principal';

/** Un contenant (sac principal ou sac nommé) et ses objets, en édition complète. */
function EditContainer({ c, up, box, onSrd }: { c: Character; up: Up; box: { id: string; name: string }; onSrd: () => void }) {
  const items = c.inventory.filter((i) => i.containerId === box.id);
  const others = [{ id: '', name: MAIN_BAG }, ...c.containers];
  return (
    <div className="card stack">
      <div className="card-title">
        {box.id ? (
          <input className="box-name" value={box.name} aria-label="Nom du contenant" onChange={(e) => up((d) => { d.containers.find((x) => x.id === box.id)!.name = e.target.value; })} />
        ) : (
          <h2>{MAIN_BAG}</h2>
        )}
        <span className="row">
          <button className="btn sm" onClick={onSrd}><BookOpen size={16} /> Objet du SRD</button>
          {box.id && (
            <button className="btn sm icon danger" title="Supprimer le contenant" aria-label="Supprimer le contenant" onClick={() => {
              if (!confirm(`Supprimer « ${box.name} » ? Ses objets seront déplacés dans le sac principal.`)) return;
              up((d) => {
                d.containers = d.containers.filter((x) => x.id !== box.id);
                for (const i of d.inventory) if (i.containerId === box.id) i.containerId = '';
              });
            }}><Trash2 size={15} /></button>
          )}
        </span>
      </div>
      <ListEditor<ItemT>
        items={items}
        onChange={(v) => up((d) => { d.inventory = [...d.inventory.filter((i) => i.containerId !== box.id), ...v.map((i) => ({ ...i, containerId: box.id }))]; })}
        make={() => ({ name: '', qty: 1, weight: 0, equipped: false, attuned: false, value: '', notes: '', containerId: box.id })}
        render={(it, set) => (
          <div className="stack">
            <div className="grid g4">
              <Field label="Objet" className=""><Text value={it.name} onChange={(v) => set({ name: v })} /></Field>
              <Field label="Quantité"><Num value={it.qty} min={0} onChange={(v) => set({ qty: v ?? 0 })} /></Field>
              <Field label="Poids unitaire (kg)"><Num value={it.weight} min={0} step={0.1} onChange={(v) => set({ weight: v ?? 0 })} /></Field>
              <Field label="Valeur"><Text value={it.value} placeholder="ex. 25 po" onChange={(v) => set({ value: v })} /></Field>
            </div>
            <Field label={<>Description <MdHint /></>}><TextArea rows={2} value={it.notes} onChange={(v) => set({ notes: v })} /></Field>
            <div className="row small">
              <label className="row"><input type="checkbox" checked={it.equipped} onChange={(e) => set({ equipped: e.target.checked })} /> Équipé</label>
              <label className="row"><input type="checkbox" checked={it.attuned} onChange={(e) => set({ attuned: e.target.checked })} /> Harmonisé</label>
              {others.length > 1 && (
                <label className="row">Contenant
                  <select style={{ width: 'auto' }} value={it.containerId} onChange={(e) => { const to = e.target.value; up((d) => { d.inventory.find((x) => x.id === it.id)!.containerId = to; }); }}>
                    {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>
        )}
      />
    </div>
  );
}

function InventoryTab({ c, up }: { c: Character; up: Up }) {
  const [picker, setPicker] = useState<string | null>(null);
  return (
    <div className="sheet-layout">
      <div className="stack" style={{ gap: '1rem' }}>
        <div className="card stack">
          <h2>Monnaie</h2>
          <div className="grid g3">
            {COINS.map((k) => (
              <Field key={k.key} label={k.long}><Num value={c.coins[k.key]} min={0} onChange={(v) => up((d) => { d.coins[k.key] = Math.max(0, v ?? 0); })} /></Field>
            ))}
          </div>
        </div>
        <div className="card stack">
          <h2>Maîtrises</h2>
          <Field label="Armures"><TagInput value={c.proficiencies.armor} onChange={(v) => up((d) => { d.proficiencies.armor = v; })} placeholder="Légères, Intermédiaires, Boucliers…" suggestions={['Légères', 'Intermédiaires', 'Lourdes', 'Boucliers']} /></Field>
          <Field label="Armes"><TagInput value={c.proficiencies.weapons} onChange={(v) => up((d) => { d.proficiencies.weapons = v; })} placeholder="Armes courantes, Armes de guerre…" suggestions={['Armes courantes', 'Armes de guerre']} /></Field>
          <Field label="Outils & instruments"><TagInput value={c.proficiencies.tools} onChange={(v) => up((d) => { d.proficiencies.tools = v; })} placeholder="Outils de voleur, Flûte…" /></Field>
          <Field label="Langues"><TagInput value={c.proficiencies.languages} onChange={(v) => up((d) => { d.proficiencies.languages = v; })} placeholder="Commun, Elfique…" suggestions={['Commun', 'Langue des signes commune', 'Draconique', 'Elfique', 'Géant', 'Gnome', 'Gobelin', 'Halfelin', 'Nain', 'Orc', 'Abyssal', 'Céleste', 'Commun des profondeurs', 'Druidique', 'Infernal', 'Primordial', 'Sylvestre', "Argot des voleurs"]} /></Field>
        </div>
      </div>
      <div className="stack" style={{ gap: '1rem' }}>
        {[{ id: '', name: MAIN_BAG }, ...c.containers].map((box) => (
          <EditContainer key={box.id || 'main'} c={c} up={up} box={box} onSrd={() => setPicker(box.id)} />
        ))}
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => up((d) => { d.containers.push({ id: uid(), name: 'Nouveau sac' }); })}>
          <Plus size={16} /> Nouveau contenant
        </button>
        <div className="small muted">
          Charge totale : {R.carriedWeight(c)} kg / {R.carryingCapacity(c)} kg · <span className={R.attunedCount(c) > R.MAX_ATTUNED ? 'error' : ''}>Objets harmonisés : {R.attunedCount(c)}/{R.MAX_ATTUNED}</span>
        </div>
      </div>
      {picker != null && <SrdPicker title="Ajouter un objet du SRD" types={['gear', 'tool', 'weapon', 'armor', 'magic-item']} onClose={() => setPicker(null)} onPick={(e) => up((d) => { d.inventory.push({ ...srdToItem(e), containerId: picker }); })} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ProfileTab({ c, up }: { c: Character; up: Up }) {
  const [picker, setPicker] = useState(false);
  const setP = (k: keyof Character['personality'], v: string) => up((d) => { d.personality[k] = v; });
  return (
    <div className="sheet-layout">
      <div className="stack" style={{ gap: '1rem' }}>
        <div className="card stack">
          <h2>Personnalité</h2>
          <Field label={<>Traits <MdHint /></>}><TextArea rows={2} value={c.personality.traits} onChange={(v) => setP('traits', v)} /></Field>
          <Field label="Idéaux"><TextArea rows={2} value={c.personality.ideals} onChange={(v) => setP('ideals', v)} /></Field>
          <Field label="Liens"><TextArea rows={2} value={c.personality.bonds} onChange={(v) => setP('bonds', v)} /></Field>
          <Field label="Défauts"><TextArea rows={2} value={c.personality.flaws} onChange={(v) => setP('flaws', v)} /></Field>
          <Field label={<>Histoire <MdHint /></>}><TextArea rows={6} value={c.personality.backstory} onChange={(v) => setP('backstory', v)} /></Field>
        </div>
        <div className="card stack">
          <h2>Alliés & organisations</h2>
          <ListEditor
            items={c.allies}
            onChange={(v) => up((d) => { d.allies = v; })}
            make={() => ({ name: '', notes: '' })}
            render={(a, set) => (
              <div className="grid g2">
                <Field label="Nom"><Text value={a.name} onChange={(v) => set({ name: v })} /></Field>
                <Field label="Notes"><Text value={a.notes} onChange={(v) => set({ notes: v })} /></Field>
              </div>
            )}
          />
        </div>
      </div>
      <div className="stack" style={{ gap: '1rem' }}>
        <FeatureList c={c} up={up} category="feature" title="Aptitudes" hint="Classe, sous-classe, espèce, objets…" />
        <FeatureList c={c} up={up} category="feat" title="Dons" hint="Don d'origine (historique), dons généraux, style de combat…" onSrd={() => setPicker(true)} />
      </div>
      {picker && <SrdPicker title="Ajouter un don du SRD" types={['feat']} onClose={() => setPicker(false)} onPick={(e) => up((d) => { d.features.push(srdToFeature(e)); })} />}
    </div>
  );
}

function FeatureList({ c, up, category, title, hint, onSrd }: { c: Character; up: Up; category: FeatureT['category']; title: string; hint: string; onSrd?: () => void }) {
  const items = c.features.filter((f) => f.category === category);
  const feat = category === 'feat';
  return (
    <div className="card stack">
      <div className="card-title">
        <h2>{feat ? <Award size={18} /> : <Compass size={18} />} {title}</h2>
        {onSrd && <button className="btn sm" onClick={onSrd}><BookOpen size={16} /> Don du SRD</button>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>{hint}</p>
      <ListEditor<FeatureT>
        items={items}
        onChange={(v) => up((d) => { d.features = [...d.features.filter((f) => f.category !== category), ...v]; })}
        make={() => ({ name: '', source: '', description: '', kind: feat ? 'passive' as const : 'other' as const, category, featType: '' })}
        addLabel={feat ? 'Ajouter un don' : 'Ajouter une aptitude'}
        render={(f, set) => (
          <div className="stack">
            <div className={`grid ${feat ? 'g4' : 'g3'}`}>
              <Field label="Nom"><Text value={f.name} onChange={(v) => set({ name: v })} /></Field>
              {feat && <Field label="Catégorie"><Text list="dl-feat-types" value={f.featType} onChange={(v) => set({ featType: v })} placeholder="Origine, Général…" /></Field>}
              <Field label="Type d'action">
                <Select value={f.kind} onChange={(v) => set({ kind: v })} options={FEATURE_KINDS.map((k) => ({ value: k, label: FEATURE_KIND_LABELS[k] }))} />
              </Field>
              <Field label={feat ? 'Source / prérequis' : 'Source'}><Text value={f.source} onChange={(v) => set({ source: v })} placeholder={feat ? 'Historique, niveau 4…' : 'Classe, espèce…'} /></Field>
            </div>
            <Field label={<>Description <MdHint /></>}><TextArea rows={3} value={f.description} onChange={(v) => set({ description: v })} /></Field>
            <div className="row small">
              <button className="btn ghost sm" onClick={() => set({ category: feat ? 'feature' : 'feat' })}>Déplacer vers {feat ? 'Aptitudes' : 'Dons'}</button>
            </div>
          </div>
        )}
      />
      {feat && <DataList id="dl-feat-types" options={FEAT_TYPES} />}
    </div>
  );
}
