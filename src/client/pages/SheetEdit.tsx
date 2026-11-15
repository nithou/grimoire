import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { BookOpen, Backpack, Image, ScrollText, Shield, Sparkles, User, Wand2, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { useCharacter } from '../useCharacter';
import type { Character, AttackT, ItemT, SpellT, ResourceT, FeatureT } from '../../shared/schema';
import { uid } from '../../shared/schema';
import {
  ABILITIES, ABILITY_LABELS, ALIGNMENTS, BACKGROUNDS, CLASSES, CONDITIONS, DAMAGE_TYPES, SKILLS, SPECIES, WEAPON_MASTERIES, findClass, COINS,
} from '../../shared/srd-fr';
import * as R from '../../shared/rules';
import { DataList, Field, ListEditor, Num, Select, Skeleton, Tabs, TagInput, Text, TextArea } from '../ui';
import { SheetHeader, ToVerifyBanner } from '../components/SheetHeader';
import { SrdPicker } from '../components/SrdPicker';
import { Gallery } from '../components/Gallery';
import { srdToAttack, srdToFeature, srdToItem, srdToSpell } from '../srdToSheet';

type Tab = 'identite' | 'stats' | 'combat' | 'sorts' | 'inventaire' | 'profil' | 'images';
type Up = (fn: (c: Character) => void) => void;

const fm = R.fmtMod;

export default function SheetEdit() {
  const { id = '' } = useParams();
  const { char: c, status, update, reload, forceSave, error } = useCharacter(id);
  const [tab, setTab] = useState<Tab>('identite');
  if (!c) return status === 'error' ? <div className="card error">{error}</div> : <div className="card"><Skeleton lines={8} /></div>;
  const up: Up = (fn) => update((d) => { fn(d); });

  return (
    <div>
      <SheetHeader id={id} c={c} mode="edit" status={status} onForce={forceSave} onReload={reload} onXp={(xp) => up((d) => { d.identity.xp = xp; })} onPortrait={(pid) => up((d) => { d.identity.portrait = pid; if (!d.images.includes(pid)) d.images.push(pid); })} />
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
          { key: 'images', label: 'Images', icon: <Image size={16} /> },
        ]}
      />
      <div className="fade-in" key={tab}>
        {tab === 'identite' && <IdentityTab c={c} up={up} />}
        {tab === 'stats' && <StatsTab c={c} up={up} />}
        {tab === 'combat' && <CombatTab c={c} up={up} />}
        {tab === 'sorts' && <SpellsTab c={c} up={up} />}
        {tab === 'inventaire' && <InventoryTab c={c} up={up} />}
        {tab === 'profil' && <ProfileTab c={c} up={up} />}
        {tab === 'images' && (
          <div className="card"><Gallery characterId={id} portrait={c.identity.portrait} onSetPortrait={(p) => up((d) => { d.identity.portrait = p; })} /></div>
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

// ---------------------------------------------------------------------------
function StatsTab({ c, up }: { c: Character; up: Up }) {
  const pb = R.proficiencyBonus(c);
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
          <h3>Valeurs forcées</h3>
          <p className="small muted" style={{ margin: 0 }}>Laissez vide pour le calcul automatique.</p>
          <div className="grid g3">
            <Field label={`Bonus de maîtrise (auto ${fm(2 + Math.floor((R.totalLevel(c) - 1) / 4))})`}><Num nullable value={c.overrides.proficiencyBonus} onChange={(v) => up((d) => { d.overrides.proficiencyBonus = v; })} /></Field>
            <Field label="Perception passive"><Num nullable value={c.overrides.passivePerception} onChange={(v) => up((d) => { d.overrides.passivePerception = v; })} /></Field>
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
        <div className="small muted" style={{ marginTop: 8 }}>Perception passive : {R.passivePerception(c)} · Bonus de maîtrise {fm(pb)}</div>
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
            make={() => ({ name: 'Nouvelle attaque', ability: 'for', proficient: true, toHitBonus: 0, damage: '1d6', addAbilityToDamage: true, damageBonus: 0, damageType: '', mastery: '', range: '', notes: '', count: null })}
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
                  <Field label="Notes"><Text value={a.notes} onChange={(v) => set({ notes: v })} /></Field>
                  <Field label="Nombre (armes de jet, javelines…)"><Num nullable placeholder="—" value={a.count} min={0} onChange={(v) => set({ count: v == null ? null : Math.max(0, v) })} /></Field>
                </div>
                <div className="row small">
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
        <ResourcesCard c={c} up={up} />
      </div>
      {picker && <SrdPicker title="Ajouter une arme du SRD" types={['weapon']} onClose={() => setPicker(false)} onPick={(e) => up((d) => { d.attacks.push(srdToAttack(e)); })} />}
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
            <Field label="Description (effets, conditions d'usage…)"><TextArea rows={2} value={r.description} onChange={(v) => set({ description: v })} /></Field>
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
          make={() => ({ name: '', level: 0, prepared: false, alwaysPrepared: false, srdName: '', notes: '' })}
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
            <Field label="Description"><TextArea rows={2} value={it.notes} onChange={(v) => set({ notes: v })} /></Field>
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
          Charge totale : {R.carriedWeight(c)} kg / {R.carryingCapacity(c)} kg · Objets harmonisés : {c.inventory.filter((i) => i.attuned).length}/3
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
          <Field label="Traits"><TextArea rows={2} value={c.personality.traits} onChange={(v) => setP('traits', v)} /></Field>
          <Field label="Idéaux"><TextArea rows={2} value={c.personality.ideals} onChange={(v) => setP('ideals', v)} /></Field>
          <Field label="Liens"><TextArea rows={2} value={c.personality.bonds} onChange={(v) => setP('bonds', v)} /></Field>
          <Field label="Défauts"><TextArea rows={2} value={c.personality.flaws} onChange={(v) => setP('flaws', v)} /></Field>
          <Field label="Histoire"><TextArea rows={6} value={c.personality.backstory} onChange={(v) => setP('backstory', v)} /></Field>
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
        <div className="card stack">
          <div className="card-title"><h2>Aptitudes & dons</h2><button className="btn sm" onClick={() => setPicker(true)}><BookOpen size={16} /> Don du SRD</button></div>
          <ListEditor<FeatureT>
            items={c.features}
            onChange={(v) => up((d) => { d.features = v; })}
            make={() => ({ name: '', source: '', description: '' })}
            render={(f, set) => (
              <div className="stack">
                <div className="grid g2">
                  <Field label="Nom"><Text value={f.name} onChange={(v) => set({ name: v })} /></Field>
                  <Field label="Source"><Text value={f.source} onChange={(v) => set({ source: v })} placeholder="Classe, espèce, don…" /></Field>
                </div>
                <Field label="Description"><TextArea rows={3} value={f.description} onChange={(v) => set({ description: v })} /></Field>
              </div>
            )}
          />
        </div>
        <div className="card stack">
          <h2>Notes</h2>
          <TextArea rows={10} value={c.notes} onChange={(v) => up((d) => { d.notes = v; })} />
        </div>
      </div>
      {picker && <SrdPicker title="Ajouter un don du SRD" types={['feat']} onClose={() => setPicker(false)} onPick={(e) => up((d) => { d.features.push(srdToFeature(e)); })} />}
    </div>
  );
}
