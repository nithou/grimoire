import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bed, BookOpen, Coffee, Dices, Heart, HeartPulse, Minus, Plus, Shield, Skull, Sparkles, Swords, Trash2, Wand2, Backpack, NotebookPen, Star, Zap, LayoutGrid, Drama, Images, Pencil, History, Eye, Flame, Focus, Undo2, Award } from 'lucide-react';
import { CharacterLog } from '../components/CharacterLog';
import { useCharacter } from '../useCharacter';
import { DiceProvider, DiceTray, ModeSwitch, useDice } from '../dice';
import type { Character } from '../../shared/schema';
import { uid, FEATURE_KINDS } from '../../shared/schema';
import * as R from '../../shared/rules';
import { ABILITIES, ABILITY_LABELS, COINS, CONDITIONS, DAMAGE_TYPES, SKILLS, FEATURE_KIND_LABELS, type Ability } from '../../shared/srd-fr';
import type { D20Mode } from '../../shared/dice';
import { Markdown, MarkdownNote, Modal, Num, Pips, Skeleton, Tabs } from '../ui';
import { Gallery } from '../components/Gallery';
import { SheetHeader, ToVerifyBanner } from '../components/SheetHeader';
import { SrdDetail, SrdPicker } from '../components/SrdPicker';
import { srdToItem } from '../srdToSheet';

type Up = (fn: (c: Character) => Character | void) => void;
const fm = R.fmtMod;

export default function SheetPlay() {
  const { id = '' } = useParams();
  const h = useCharacter(id);
  if (!h.char) return h.status === 'error' ? <div className="card error">{h.error}</div> : <div className="card"><Skeleton lines={8} /></div>;
  return (
    <DiceProvider characterId={id}>
      <PlayInner id={id} c={h.char} up={h.update} status={h.status} reload={h.reload} force={h.forceSave} role={h.role} owner={h.owner} undo={h.undo} />
    </DiceProvider>
  );
}

type PlayTab = 'general' | 'inventaire' | 'notes' | 'log';
const TAB_KEY = 'grimoire.playTab';

type Undo = { label: string | null; run: () => void };

/** Mode du d20 quand un effet actif donne l'avantage : avantage + désavantage = normal. */
export function withAdvantage(mode: D20Mode, sources: string[]): D20Mode {
  if (!sources.length) return mode;
  return mode === 'disadvantage' ? 'normal' : 'advantage';
}

function PlayInner({ id, c, up, status, reload, force, role, owner, undo }: { id: string; c: Character; up: Up; status: any; reload: () => void; force: () => void; role: 'owner' | 'dm'; owner: string; undo: Undo }) {
  const dice = useDice();
  const [concDc, setConcDc] = useState<number | null>(null);
  const pen = R.exhaustionPenalty(c);
  const [srdOpen, setSrdOpen] = useState<string | null>(null);
  const [itemPicker, setItemPicker] = useState<string | null>(null);
  const [tab, setTabState] = useState<PlayTab>(() => {
    try {
      return (localStorage.getItem(TAB_KEY) as PlayTab) || 'general';
    } catch {
      return 'general';
    }
  });
  const setTab = (t: PlayTab) => {
    setTabState(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* stockage indisponible */ }
  };

  /** Test d20 ; `adv` = effets actifs qui donnent l'avantage. */
  const check = (label: string, bonus: number, adv: string[] = []) =>
    dice.d20(label, bonus, { penalty: pen, mode: withAdvantage(dice.mode, adv), extra: adv.length ? `avantage : ${adv.join(', ')}` : undefined });
  const advCheck = (a: Ability) => R.effectAdvantage(c, 'check', a);
  const advSave = (a: Ability) => R.effectAdvantage(c, 'save', a);

  // Annuler : Ctrl/Cmd+Z hors des champs de saisie.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (!undo.label) return;
      e.preventDefault();
      undo.run();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [undo]);

  return (
    <div>
      <SheetHeader id={id} c={c} mode="play" status={status} onForce={force} onReload={reload} onXp={(xp) => up((d) => { d.identity.xp = xp; })} role={role} owner={owner} />
      <ToVerifyBanner items={c.toVerify} />

      <div className="sticky-tools no-print">
        <div className="row spread" style={{ alignItems: 'flex-end' }}>
          <Tabs<PlayTab>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'general', label: 'Général', icon: <LayoutGrid size={16} /> },
              { key: 'inventaire', label: 'Inventaire', icon: <Backpack size={16} /> },
              { key: 'notes', label: 'Notes', icon: <NotebookPen size={16} /> },
              { key: 'log', label: 'Log', icon: <History size={16} /> },
            ]}
          />
          <div className="row" style={{ paddingBottom: 6 }}>
            {c.combat.exhaustion > 0 && <span className="chip warn">Épuisement {c.combat.exhaustion} ({pen})</span>}
            <button className="btn sm" disabled={!undo.label} onClick={undo.run} title={undo.label ? `Annuler : ${undo.label} (Ctrl+Z)` : 'Rien à annuler'}><Undo2 size={16} /> Annuler</button>
            <button className="btn sm" onClick={() => up((d) => R.shortRest(d))} title="Recharge les ressources « repos court »"><Coffee size={16} /> Repos court</button>
            <button className="btn sm" onClick={() => { if (confirm('Repos long : PV, dés de vie, emplacements et ressources restaurés, épuisement −1. Continuer ?')) up((d) => R.longRest(d)); }}><Bed size={16} /> Repos long</button>
          </div>
        </div>
      </div>

      {tab === 'general' && (
        <div className="sheet-layout three fade-in">
          {/* ---------- Colonne 1 : caractéristiques, compétences, maîtrises, personnalité ---------- */}
          <div className="stack" style={{ gap: '1rem' }}>
            <div className="card stack">
              <h2><Sparkles size={18} /> Caractéristiques</h2>
              <div className="abil-grid">
                {ABILITIES.map((a) => {
                  const m = R.mod(c, a);
                  const prof = c.savingThrows.includes(a);
                  return (
                    <div key={a} className="stack" style={{ gap: 4, alignItems: 'stretch' }}>
                      <button className={`plate ${advCheck(a).length ? 'adv' : ''}`} onClick={() => check(`Test de ${ABILITY_LABELS[a].long}`, m, advCheck(a))} title={`Test de ${ABILITY_LABELS[a].long}${advCheck(a).length ? ` — avantage (${advCheck(a).join(', ')})` : ''}`}>
                        <div className="lbl">{ABILITY_LABELS[a].short}</div>
                        <div className="big">{fm(m)}</div>
                        <div className="sub">{c.abilities[a]}</div>
                      </button>
                      <button className={`save-chip ${prof ? 'on' : ''} ${advSave(a).length ? 'adv' : ''}`} onClick={() => check(`Sauvegarde de ${ABILITY_LABELS[a].long}`, R.saveBonus(c, a), advSave(a))} title={`Jet de sauvegarde${advSave(a).length ? ` — avantage (${advSave(a).join(', ')})` : ''}`}>
                        JS {fm(R.saveBonus(c, a))}{advSave(a).length > 0 && ' ▲'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <SensesCard c={c} />
            <div className="card">
              <h2>Compétences</h2>
              <ul className="list">
                {SKILLS.map((s) => {
                  const st = c.skills[s.key]?.prof ?? 0;
                  return (
                    <li key={s.key} style={{ padding: '0.1rem 0' }}>
                      <button className="rollable" onClick={() => check(s.label, R.skillBonus(c, s.key), advCheck(s.ability))}>
                        <span className={`pip ${st === 2 ? 'on' : st === 1 ? 'half' : ''}`} style={{ cursor: 'inherit' }} title={['Non maîtrisée', 'Maîtrise', 'Expertise'][st]} />
                        <span className="grow">{s.label} <span className="muted small">{ABILITY_LABELS[s.ability].short}</span></span>
                        <span className="bonus">{advCheck(s.ability).length > 0 && <span className="adv-mark" title={`Avantage (${advCheck(s.ability).join(', ')})`}>▲ </span>}{fm(R.skillBonus(c, s.key))}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <ProficienciesCard c={c} />
            <PersonalityCard c={c} />
          </div>

          {/* ---------- Colonne 2 : combat ---------- */}
          <div className="stack" style={{ gap: '1rem' }}>
            <div className="stat-strip">
              <div className={`stat ${R.armorClass(c) !== c.combat.ac ? 'boosted' : ''}`} title={[c.combat.acNote, R.armorClass(c) !== c.combat.ac ? `${c.combat.ac} ${fm(R.armorClass(c) - c.combat.ac)} (effets actifs)` : ''].filter(Boolean).join(' — ')}><div className="v"><Shield size={16} /> {R.armorClass(c)}</div><div className="k">Classe d'armure</div></div>
              <button className="stat" onClick={() => check('Initiative', R.initiative(c), advCheck('dex'))}><div className="v">{fm(R.initiative(c))}</div><div className="k">Initiative</div></button>
              <div className="stat"><div className="v">{R.speed(c)} m</div><div className="k">Vitesse</div></div>
              <div className="stat"><div className="v">{fm(R.proficiencyBonus(c))}</div><div className="k">Maîtrise</div></div>
            </div>
            <InspirationBar c={c} up={up} />
            <EffectsCard c={c} up={up} concDc={concDc} setConcDc={setConcDc} />
            <HpCard c={c} up={up} onDamaged={(n) => { if (c.combat.concentration && n > 0) setConcDc(R.concentrationDC(n)); }} />
            <DeathSavesCard c={c} up={up} />
            <AttacksCard c={c} up={up} />
            <SpellsCard c={c} up={up} onOpen={setSrdOpen} />
            <ResourcesCard c={c} up={up} />
            <ConditionsCard c={c} up={up} />
          </div>

          {/* ---------- Colonne 3 : dés, aptitudes ---------- */}
          <div className="stack" style={{ gap: '1rem' }}>
            <div className="card stack">
              <h2><Dices size={18} /> Dés</h2>
              <div className="stack" style={{ gap: 4 }}>
                <span className="field-label">Jets d20</span>
                <ModeSwitch full />
              </div>
              <DiceTray />
            </div>
            <FeaturesCard c={c} category="feature" />
            <FeaturesCard c={c} category="feat" />
          </div>
        </div>
      )}

      {tab === 'inventaire' && (
        <div className="fade-in">
          <InventoryCard c={c} up={up} onSrd={(box) => setItemPicker(box)} />
        </div>
      )}

      {tab === 'notes' && (
        <div className="sheet-layout fade-in">
          <div className="card stack">
            <h2><NotebookPen size={18} /> Notes</h2>
            <MarkdownNote rows={18} value={c.notes} onChange={(v) => up((d) => { d.notes = v; })} placeholder="Notes de session, PNJ, indices… (**gras**, *italique*)" />
          </div>
          <div className="card stack">
            <h2><Images size={18} /> Images</h2>
            <Gallery characterId={id} portrait={c.identity.portrait} onSetPortrait={(p) => up((d) => { d.identity.portrait = p; })} />
          </div>
        </div>
      )}

      {tab === 'log' && (
        <div className="fade-in">
          <CharacterLog characterId={id} refreshKey={status === 'saved'} />
        </div>
      )}

      {srdOpen && <Modal title="Règles" onClose={() => setSrdOpen(null)}><SrdDetail id={srdOpen} /></Modal>}
      {itemPicker != null && <SrdPicker title="Ajouter un objet" types={['gear', 'tool', 'weapon', 'armor', 'magic-item']} onClose={() => setItemPicker(null)} onPick={(e) => up((d) => { d.inventory.push({ ...srdToItem(e), containerId: itemPicker }); })} />}
    </div>
  );
}

function InspirationBar({ c, up }: { c: Character; up: Up }) {
  const n = c.combat.heroicInspiration;
  return (
    <div className="card row spread" style={{ padding: '0.55rem 0.9rem' }} title="Inspiration : dépenser un point pour relancer un dé">
      <span className="row" style={{ gap: 8 }}>
        <Star size={20} fill={n > 0 ? 'var(--gold)' : 'none'} style={{ color: 'var(--gold)' }} />
        <strong>Inspiration</strong>
        <span className="big-num">{n}</span>
      </span>
      <span className="row" style={{ gap: 4 }}>
        <button className="btn sm" disabled={n <= 0} onClick={() => up((d) => { d.combat.heroicInspiration = Math.max(0, d.combat.heroicInspiration - 1); })}><Minus size={14} /> Dépenser</button>
        <button className="btn sm icon" onClick={() => up((d) => { d.combat.heroicInspiration += 1; })} aria-label="Gagner un point d'Inspiration"><Plus size={14} /></button>
      </span>
    </div>
  );
}

function SensesCard({ c }: { c: Character }) {
  const pp = R.passivePerception(c);
  const ppAuto = 10 + R.skillBonus(c, 'perception');
  const rows: [string, number, string][] = [
    ['Perception', pp, c.overrides.passivePerception != null && pp !== ppAuto ? `Valeur forcée (calcul : ${ppAuto})` : `10 + Perception (${fm(R.skillBonus(c, 'perception'))})`],
    ['Perspicacité', R.passiveSkill(c, 'perspicacite'), `10 + Perspicacité (${fm(R.skillBonus(c, 'perspicacite'))})`],
    ['Investigation', R.passiveSkill(c, 'investigation'), `10 + Investigation (${fm(R.skillBonus(c, 'investigation'))})`],
  ];
  return (
    <div className="card stack" style={{ padding: '0.7rem 1rem', gap: 8 }}>
      <span className="field-label row" style={{ gap: 6 }}><Eye size={15} style={{ color: 'var(--accent)' }} /> Valeurs passives & sens</span>
      <div className="passives">
        {rows.map(([k, v, t]) => (
          <div key={k} className="passive" title={t}>
            <span className={k === 'Perception' ? 'pp-box' : 'pp-box sm'}><span className="big-num">{v}</span></span>
            <span className="small">{k}</span>
          </div>
        ))}
      </div>
      {c.senses.length > 0 && <div className="row small" style={{ gap: 4 }}>{c.senses.map((x) => <span key={x} className="chip">{x}</span>)}</div>}
    </div>
  );
}

/** Résumé des résistances, immunités et vulnérabilités (permanentes + effets actifs). */
function DefensesLine({ c }: { c: Character }) {
  const d = R.damageDefenses(c);
  const fx = new Set(R.activeEffects(c).flatMap((e) => e.resistances));
  const parts: [string, string[]][] = [['Résistances', d.resistances], ['Immunités', d.immunities], ['Vulnérabilités', d.vulnerabilities], ['Immunités (états)', c.defenses.conditionImmunities]];
  if (parts.every(([, v]) => !v.length)) return null;
  return (
    <div className="small stack" style={{ gap: 2 }}>
      {parts.filter(([, v]) => v.length).map(([k, v]) => (
        <div key={k}><span className="muted">{k} :</span> {v.map((x, i) => <span key={x}>{i > 0 && ', '}<span className={fx.has(x) && !c.defenses.resistances.includes(x) && k === 'Résistances' ? 'fx' : ''}>{x}</span></span>)}</div>
      ))}
    </div>
  );
}

/** Effets activables (Rage, Témérité…) et concentration. */
function EffectsCard({ c, up, concDc, setConcDc }: { c: Character; up: Up; concDc: number | null; setConcDc: (n: number | null) => void }) {
  const dice = useDice();
  const [draft, setDraft] = useState('');
  const active = R.activeEffects(c);
  const conc = c.combat.concentration;
  if (!c.effects.length && !conc && !c.spellcasting.spells.some((s) => s.concentration)) {
    // Rien à suivre : on garde une ligne discrète pour une concentration ponctuelle (parchemin, objet).
    return (
      <form className="card row small" style={{ padding: '0.5rem 0.9rem', flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { up((d) => { d.combat.concentration = draft.trim(); }); setDraft(''); } }}>
        <Focus size={16} className="muted" />
        <input className="grow" style={{ width: 'auto' }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Concentration (parchemin, objet…)" aria-label="Se concentrer sur" />
        <button className="btn sm" type="submit" disabled={!draft.trim()}>Commencer</button>
      </form>
    );
  }
  const describe = (e: Character['effects'][number]) => {
    const p: string[] = [];
    if (e.acBonus) p.push(`CA ${fm(e.acBonus)}`);
    if (e.toHitBonus) p.push(`toucher ${fm(e.toHitBonus)}`);
    if (e.damageBonus) p.push(`dégâts ${fm(e.damageBonus)}${e.strOnly ? ' (FOR)' : ''}`);
    if (e.saveBonus) p.push(`JS ${fm(e.saveBonus)}`);
    if (e.advAttacks) p.push(`avantage aux attaques${e.strOnly ? ' (FOR)' : ''}`);
    if (e.advChecks.length) p.push(`avantage aux tests de ${e.advChecks.map((a) => ABILITY_LABELS[a].short).join(', ')}`);
    if (e.advSaves.length) p.push(`avantage aux JS de ${e.advSaves.map((a) => ABILITY_LABELS[a].short).join(', ')}`);
    if (e.resistances.length) p.push(`résistance : ${e.resistances.join(', ')}`);
    return p.join(' · ');
  };
  const rollConc = () => {
    const dc = concDc ?? 10;
    const adv = R.effectAdvantage(c, 'save', 'con');
    dice.d20(`Concentration (DD ${dc})`, R.saveBonus(c, 'con'), {
      penalty: R.exhaustionPenalty(c),
      mode: withAdvantage(dice.mode, adv),
      onResult: (_nat, total) => {
        setConcDc(null);
        return total >= dc
          ? { note: `Réussite : la concentration sur « ${conc} » est maintenue.` }
          : { note: `Échec : la concentration sur « ${conc} » est rompue.`, action: { label: 'Mettre fin à la concentration', run: () => up((d) => { d.combat.concentration = ''; }) } };
      },
    });
  };
  return (
    <div className={`card stack ${active.length ? 'effects-on' : ''}`}>
      <div className="card-title">
        <h2><Flame size={18} /> Effets actifs</h2>
        {active.length > 0 && <button className="btn ghost sm" onClick={() => up((d) => { for (const e of d.effects) e.active = false; })}>Tout terminer</button>}
      </div>
      {c.effects.length > 0 && (
        <div className="row">
          {c.effects.map((e) => {
            const res = e.resourceId ? c.resources.find((r) => r.id === e.resourceId) : undefined;
            return (
              <button key={e.id} className={`chip effect ${e.active ? 'on' : ''}`} aria-pressed={e.active} title={describe(e)}
                onClick={() => {
                  const r = R.toggleEffect(c, e.id);
                  if (r.warning && !confirm(`${r.warning} Activer quand même ?`)) return;
                  up(() => r.char);
                }}>
                {e.name || 'Effet'}{res && <span className="muted"> · {res.max - res.used}/{res.max}</span>}
              </button>
            );
          })}
        </div>
      )}
      {active.map((e) => (
        <div key={e.id} className="small effect-detail">
          <strong>{e.name}</strong>{describe(e) && <> — {describe(e)}</>}
          {e.notes && <div className="muted"><Markdown compact text={e.notes} /></div>}
        </div>
      ))}
      <div className={`conc-row ${conc ? 'on' : ''}`}>
        <Focus size={16} />
        {conc ? (
          <>
            <span className="grow">Concentration : <strong>{conc}</strong></span>
            <button className="btn sm" onClick={rollConc} title="JdS de Constitution pour maintenir la concentration">JdS CON{concDc ? ` DD ${concDc}` : ''}</button>
            <button className="btn ghost sm" onClick={() => { setConcDc(null); up((d) => { d.combat.concentration = ''; }); }}>Terminer</button>
          </>
        ) : (
          <form className="row grow" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { up((d) => { d.combat.concentration = draft.trim(); }); setDraft(''); } }}>
            <input className="grow" style={{ width: 'auto' }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Pas de concentration" aria-label="Se concentrer sur" />
            <button className="btn sm" type="submit" disabled={!draft.trim()}>Commencer</button>
          </form>
        )}
      </div>
      {conc && concDc != null && (
        <div className="banner small row spread">
          <span>Dégâts subis : JdS de Constitution <strong>DD {concDc}</strong> pour maintenir la concentration.</span>
          <span className="row" style={{ gap: 4 }}>
            <button className="btn sm primary" onClick={rollConc}><Dices size={14} /> Lancer</button>
            <button className="btn ghost sm" onClick={() => setConcDc(null)}>Ignorer</button>
          </span>
        </div>
      )}
    </div>
  );
}

function DeathSavesCard({ c, up }: { c: Character; up: Up }) {
  const dice = useDice();
  const { success, failure } = c.combat.deathSaves;
  const dead = R.isDead(c);
  const dying = c.combat.hpCurrent === 0 && !dead;
  const set = (s: number, f: number) => {
    const r = R.setDeathSaves(c, s, f);
    up(() => r.char);
  };
  return (
    <div className={`card stack ${dying ? 'dying' : ''} ${dead ? 'dead' : ''}`}>
      <div className="card-title">
        <h2><Skull size={18} /> JdS contre la mort</h2>
        <button className="btn sm" disabled={dead} onClick={() => dice.d20('Sauvegarde contre la mort', 0, {
          mode: 'normal',
          onResult: (nat) => {
            const r = R.resolveDeathSave(c, nat);
            up(() => r.char);
            return { note: r.outcome };
          },
        })}><Dices size={14} /> Lancer</button>
      </div>
      <div className="death-row">
        <span>Réussites</span>
        <Pips max={3} used={3 - success} label="Réussites" onChange={(u) => set(3 - u, failure)} />
        <span className="muted small">{success}/3</span>
      </div>
      <div className="death-row fail">
        <span>Échecs</span>
        <Pips max={3} used={3 - failure} label="Échecs" onChange={(u) => set(success, 3 - u)} />
        <span className="muted small">{failure}/3</span>
      </div>
      {dying && <div className="small">Le personnage est à terre (0 PV) : lancez un jet à chaque tour. 3 réussites → retour avec 1 PV.</div>}
      {dead && (
        <div className="banner row spread">
          <strong>Le personnage est mort.</strong>
          <button className="btn sm primary" onClick={() => { if (confirm('Ressusciter le personnage (1 PV, jets remis à zéro) ?')) up((d) => R.resurrect(d)); }}>Ressusciter</button>
        </div>
      )}
    </div>
  );
}

function PersonalityCard({ c }: { c: Character }) {
  const p = c.personality;
  const rows: [string, string][] = [['Traits', p.traits], ['Idéaux', p.ideals], ['Liens', p.bonds], ['Défauts', p.flaws]];
  if (rows.every(([, v]) => !v.trim()) && !p.backstory.trim()) return null;
  return (
    <div className="card stack">
      <h2><Drama size={18} /> Personnalité</h2>
      {rows.filter(([, v]) => v.trim()).map(([k, v]) => (
        <div key={k}>
          <div className="field-label">{k}</div>
          <Markdown compact text={v} />
        </div>
      ))}
      {p.backstory.trim() && (
        <details>
          <summary style={{ cursor: 'pointer' }} className="field-label">Histoire</summary>
          <div style={{ marginTop: 4 }}><Markdown compact text={p.backstory} /></div>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function HpCard({ c, up, onDamaged }: { c: Character; up: Up; onDamaged: (taken: number) => void }) {
  const dice = useDice();
  const [amt, setAmt] = useState<number | null>(null);
  const [dmgType, setDmgType] = useState('');
  const [lastNote, setLastNote] = useState('');
  const defs = R.damageDefenses(c);
  const { hpCurrent, hpMax, hpTemp } = c.combat;
  const pct = Math.max(0, Math.min(100, (hpCurrent / Math.max(1, hpMax)) * 100));
  const n = amt ?? 0;
  const conMod = R.mod(c, 'con');

  const spendHitDie = (idx: number) => {
    const pool = c.combat.hitDice[idx];
    if (!pool || pool.used >= pool.total) return;
    const sides = parseInt(pool.die.slice(1), 10);
    const roll = 1 + Math.floor(Math.random() * sides);
    const healed = Math.max(0, roll + conMod);
    up((d) => {
      d.combat.hitDice[idx].used += 1;
      return R.applyHealing(d, healed);
    });
    dice.damage(`Dé de vie ${pool.die} (+${conMod} CON) → soins`, `${roll}${conMod >= 0 ? '+' : ''}${conMod}`);
  };

  return (
    <div className="card stack brass">
      <div className="card-title">
        <h2><Heart size={18} /> Points de vie</h2>
        <span className="big-num">
          <strong>{hpCurrent}</strong><span className="muted">/{hpMax}</span>
          {hpTemp > 0 && <span style={{ color: 'var(--info)' }}> +{hpTemp}</span>}
        </span>
      </div>
      <div className="hp-bar" aria-hidden><span style={{ width: `${pct}%` }} /></div>
      {hpTemp > 0 && <div className="hp-bar" aria-hidden style={{ height: 6 }}><span className="temp" style={{ width: `${Math.min(100, (hpTemp / Math.max(1, hpMax)) * 100)}%` }} /></div>}
      {hpCurrent <= hpMax / 2 && hpCurrent > 0 && <span className="chip warn" style={{ alignSelf: 'flex-start' }}>En sang</span>}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <div style={{ width: 90 }}><Num value={amt} onChange={setAmt} min={0} nullable placeholder="PV" /></div>
        <button className="btn sm danger" disabled={!n} onClick={() => {
          const adj = R.adjustDamage(c, n, dmgType);
          up((d) => R.applyDamage(d, adj.amount));
          setLastNote(adj.note ? `${adj.note}${adj.amount ? ` : ${adj.amount} dégâts subis` : ''}.` : '');
          onDamaged(adj.amount);
          setAmt(null);
        }}><Minus size={16} /> Dégâts</button>
        <button className="btn sm" disabled={!n} onClick={() => { up((d) => R.applyHealing(d, n)); setAmt(null); }} style={{ color: 'var(--success)', borderColor: 'var(--success)' }}><Plus size={16} /> Soins</button>
        <button className="btn sm teal" disabled={!n} onClick={() => { up((d) => R.setTempHp(d, n)); setAmt(null); }} title="PV temporaires">Temp.</button>
      </div>
      <div className="row small" style={{ flexWrap: 'nowrap' }}>
        <span className="muted">Type de dégâts</span>
        <select style={{ width: 'auto' }} value={dmgType} onChange={(e) => setDmgType(e.target.value)} aria-label="Type de dégâts">
          <option value="">— (aucun ajustement)</option>
          {DAMAGE_TYPES.map((t) => {
            const tag = defs.immunities.includes(t) ? ' (immunité)' : defs.resistances.includes(t) ? ' (résistance)' : defs.vulnerabilities.includes(t) ? ' (vulnérabilité)' : '';
            return <option key={t} value={t}>{t}{tag}</option>;
          })}
        </select>
      </div>
      {lastNote && <div className="small" style={{ color: 'var(--info)' }}>{lastNote}</div>}
      <DefensesLine c={c} />
      {c.combat.hitDice.length > 0 && (
        <div className="row small">
          <HeartPulse size={16} /> Dés de vie :
          {c.combat.hitDice.map((h, i) => (
            <span key={i} className="row" style={{ gap: 4 }}>
              <span className="mono">{h.total - h.used}/{h.total}{h.die}</span>
              <button className="btn sm" disabled={h.used >= h.total} onClick={() => spendHitDie(i)} title="Dépenser un dé de vie (repos court)">Dépenser</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AttacksCard({ c, up }: { c: Character; up: Up }) {
  const dice = useDice();
  const pen = R.exhaustionPenalty(c);
  if (!c.attacks.length && R.spellAttack(c) == null) return null;
  return (
    <div className="card">
      <h2><Swords size={18} /> Attaques</h2>
      <ul className="list">
        {[...c.attacks].sort((x, y) => Number(y.equipped) - Number(x.equipped)).map((a) => {
          const hit = R.attackToHit(c, a);
          const dmg = R.damageExpression(c, a);
          return (
            <li key={a.id} className="stack" style={{ gap: 4, opacity: a.equipped ? 1 : 0.6 }}>
              <div className="row spread" style={{ flexWrap: 'nowrap' }}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <strong>{a.name}</strong>{' '}
                  {a.equipped ? <span className="chip on">équipée</span> : <span className="chip">rangée</span>}
                  <span className="small muted" style={{ display: 'block' }}>{[a.range, a.mastery].filter(Boolean).join(' · ')}</span>
                  {a.count != null && (
                    <span className="row small" style={{ gap: 4, marginTop: 2 }}>
                      <button className="btn ghost sm icon" style={{ minHeight: '1.6rem', minWidth: '1.6rem' }} disabled={a.count <= 0} onClick={() => up((d) => { const x = d.attacks.find((y) => y.id === a.id)!; x.count = Math.max(0, (x.count ?? 0) - 1); })} aria-label={`Utiliser un(e) ${a.name}`}><Minus size={13} /></button>
                      <span className={a.count === 0 ? 'error' : ''}>× <strong>{a.count}</strong></span>
                      <button className="btn ghost sm icon" style={{ minHeight: '1.6rem', minWidth: '1.6rem' }} onClick={() => up((d) => { const x = d.attacks.find((y) => y.id === a.id)!; x.count = (x.count ?? 0) + 1; })} aria-label={`Récupérer un(e) ${a.name}`}><Plus size={13} /></button>
                    </span>
                  )}
                </span>
                <button className={`btn sm mono ${R.effectAdvantage(c, 'attack', a).length ? 'adv' : ''}`} onClick={() => dice.d20(`Attaque : ${a.name}`, hit, {
                  penalty: pen,
                  mode: withAdvantage(dice.mode, R.effectAdvantage(c, 'attack', a)),
                  extra: R.effectAdvantage(c, 'attack', a).length ? `avantage : ${R.effectAdvantage(c, 'attack', a).join(', ')}` : undefined,
                  onResult: (nat) => ({
                    action: nat === 20
                      ? { label: `Dégâts critiques (${dmg})`, run: () => dice.damage(a.name, dmg, true) }
                      : { label: `Dégâts (${dmg})`, run: () => dice.damage(a.name, dmg) },
                  }),
                })}>{fm(hit)}</button>
                <button className="btn sm mono" onClick={() => dice.damage(`Dégâts : ${a.name}`, dmg)} title="Lancer les dégâts">{dmg} <span className="small">{a.damageType}</span></button>
              </div>
              {a.notes && <div className="attack-notes"><Markdown compact text={a.notes} /></div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SpellsCard({ c, up, onOpen }: { c: Character; up: Up; onOpen: (id: string) => void }) {
  const dice = useDice();
  const dc = R.spellSaveDC(c);
  const atk = R.spellAttack(c);
  const spells = c.spellcasting.spells;
  if (!spells.length && !c.spellcasting.slots.length) return null;
  const levels = [...new Set(spells.map((s) => s.level))].sort((a, b) => a - b);
  return (
    <div className="card stack">
      <div className="card-title">
        <h2><Wand2 size={18} /> Sorts</h2>
        <span className="row small">
          {dc != null && <span className="chip">DD {dc}</span>}
          {atk != null && <button className="chip" onClick={() => dice.d20('Attaque de sort', atk, { penalty: R.exhaustionPenalty(c) })}>Attaque {fm(atk)}</button>}
        </span>
      </div>
      {c.spellcasting.slots.filter((s) => s.max > 0).length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          {c.spellcasting.slots.filter((s) => s.max > 0).map((s) => (
            <div key={s.level} className="row small">
              <span style={{ width: 70 }}>Niveau {s.level}</span>
              <Pips max={s.max} used={s.used} label={`Emplacements de niveau ${s.level}`} onChange={(u) => up((d) => { const t = d.spellcasting.slots.find((x) => x.level === s.level)!; t.used = Math.max(0, Math.min(t.max, u)); })} />
            </div>
          ))}
        </div>
      )}
      {levels.map((l) => (
        <div key={l}>
          <div className="small muted">{l === 0 ? 'Sorts mineurs' : `Niveau ${l}`}</div>
          <ul className="list">
            {spells.filter((s) => s.level === l).map((s) => (
              <li key={s.id} className="row" style={{ flexWrap: 'nowrap', padding: '0.15rem 0' }}>
                {l > 0 && (
                  <input type="checkbox" checked={s.prepared || s.alwaysPrepared} disabled={s.alwaysPrepared} title="Préparé" aria-label={`Préparer ${s.name}`}
                    onChange={(e) => up((d) => { d.spellcasting.spells.find((x) => x.id === s.id)!.prepared = e.target.checked; })} />
                )}
                <span className="grow" style={{ opacity: l > 0 && !s.prepared && !s.alwaysPrepared ? 0.6 : 1 }}>
                  {s.name} {s.concentration && <span className="chip" title="Concentration">C</span>} {s.notes && <span className="small muted">— {s.notes}</span>}
                </span>
                {s.concentration && (
                  <button className={`btn ghost sm icon ${c.combat.concentration === s.name ? 'on' : ''}`} title={c.combat.concentration === s.name ? 'Concentration en cours' : 'Se concentrer sur ce sort'} aria-label={`Se concentrer sur ${s.name}`}
                    onClick={() => {
                      if (c.combat.concentration === s.name) return;
                      if (c.combat.concentration && !confirm(`Mettre fin à la concentration sur « ${c.combat.concentration} » ?`)) return;
                      up((d) => { d.combat.concentration = s.name; });
                    }}><Focus size={15} /></button>
                )}
                {s.srdName && <button className="btn ghost sm icon" onClick={() => onOpen(s.srdName)} aria-label={`Description de ${s.name}`} title="Description"><BookOpen size={15} /></button>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ResourcesCard({ c, up }: { c: Character; up: Up }) {
  if (!c.resources.length) return null;
  return (
    <div className="card">
      <h2><Zap size={18} /> Ressources</h2>
      <ul className="list">
        {c.resources.map((r) => (
          <li key={r.id} className="row spread" style={{ alignItems: 'flex-start' }}>
            <span className="grow" style={{ minWidth: 0 }}>
              {r.name} <span className="small muted">({{ short: 'repos court', long: 'repos long', none: 'manuel' }[r.recharge]})</span>
              {r.description && <div className="small muted"><Markdown compact text={r.description} /></div>}
            </span>
            {r.max <= 12 ? (
              <Pips max={r.max} used={r.used} onChange={(u) => up((d) => { d.resources.find((x) => x.id === r.id)!.used = u; })} />
            ) : (
              <span className="row" style={{ gap: 4 }}>
                <button className="btn sm icon" onClick={() => up((d) => { const x = d.resources.find((y) => y.id === r.id)!; x.used = Math.min(x.max, x.used + 1); })} aria-label="Dépenser"><Minus size={14} /></button>
                <span className="mono">{r.max - r.used}/{r.max}</span>
                <button className="btn sm icon" onClick={() => up((d) => { const x = d.resources.find((y) => y.id === r.id)!; x.used = Math.max(0, x.used - 1); })} aria-label="Récupérer"><Plus size={14} /></button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConditionsCard({ c, up }: { c: Character; up: Up }) {
  return (
    <div className="card stack">
      <h2>États</h2>
      <div className="row">
        {CONDITIONS.map((k) => (
          <button key={k} className={`chip ${c.combat.conditions.includes(k) ? 'on' : ''}`} aria-pressed={c.combat.conditions.includes(k)} onClick={() => up((d) => {
            d.combat.conditions = d.combat.conditions.includes(k) ? d.combat.conditions.filter((x) => x !== k) : [...d.combat.conditions, k];
          })}>{k}</button>
        ))}
      </div>
      <div className="row small">
        Épuisement
        <button className="btn sm icon" onClick={() => up((d) => { d.combat.exhaustion = Math.max(0, d.combat.exhaustion - 1); })} aria-label="Réduire l'épuisement"><Minus size={14} /></button>
        <span className="mono">{c.combat.exhaustion}/6</span>
        <button className="btn sm icon" onClick={() => up((d) => { d.combat.exhaustion = Math.min(6, d.combat.exhaustion + 1); })} aria-label="Augmenter l'épuisement"><Plus size={14} /></button>
        {c.combat.exhaustion >= 6 && <strong style={{ color: 'var(--danger)' }}>Mort</strong>}
      </div>
    </div>
  );
}

const MAIN_BAG = 'Sac principal';

function InventoryCard({ c, up, onSrd }: { c: Character; up: Up; onSrd: (box: string) => void }) {
  const [newBox, setNewBox] = useState('');
  return (
    <div className="sheet-layout" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 9fr)' }}>
      <div className="stack" style={{ gap: '1rem' }}>
        <div className="card stack">
          <h2>Bourse</h2>
          <div className="coins">
            {COINS.map((k) => (
              <label key={k.key} className="coin" title={k.long}>
                <span className={`coin-badge coin-${k.key}`}>{k.label}</span>
                <Num value={c.coins[k.key]} min={0} onChange={(v) => up((d) => { d.coins[k.key] = Math.max(0, v ?? 0); })} />
              </label>
            ))}
          </div>
        </div>
        <div className="card small stack">
          <h2>Charge</h2>
          <div><span className="big-num">{R.carriedWeight(c)}</span> <span className="muted">/ {R.carryingCapacity(c)} kg</span></div>
          <div className={R.attunedCount(c) > R.MAX_ATTUNED ? 'error' : 'muted'}>Objets harmonisés : {R.attunedCount(c)}/{R.MAX_ATTUNED}{R.attunedCount(c) > R.MAX_ATTUNED && ' (maximum dépassé)'}</div>
        </div>
      </div>
      <div className="stack" style={{ gap: '1rem' }}>
        {[{ id: '', name: MAIN_BAG }, ...c.containers].map((box) => (
          <ContainerCard key={box.id || 'main'} c={c} up={up} box={box} onSrd={() => onSrd(box.id)} />
        ))}
        <form className="card row" style={{ flexWrap: 'nowrap', borderStyle: 'dashed' }} onSubmit={(e) => {
          e.preventDefault();
          const n = newBox.trim();
          if (!n) return;
          up((d) => { d.containers.push({ id: uid(), name: n }); });
          setNewBox('');
        }}>
          <input value={newBox} onChange={(e) => setNewBox(e.target.value)} placeholder="Nouveau contenant (ex. Sac sans fond, Coffre de la cabane…)" aria-label="Nom du nouveau contenant" />
          <button className="btn sm" type="submit" disabled={!newBox.trim()}><Plus size={16} /> Créer</button>
        </form>
        <div className="small muted">Valeur, poids, description et contenant se modifient dans Édition › Inventaire.</div>
      </div>
    </div>
  );
}

/** Un contenant (sac principal ou sac nommé) en vue Jeu. */
function ContainerCard({ c, up, box, onSrd }: { c: Character; up: Up; box: { id: string; name: string }; onSrd: () => void }) {
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(false);
  // Objets équipés en premier (ordre d'origine conservé sinon).
  const items = c.inventory.filter((i) => i.containerId === box.id).sort((x, y) => Number(y.equipped) - Number(x.equipped));
  const weight = Math.round(items.reduce((s, i) => s + (i.weight || 0) * (i.qty || 0), 0) * 100) / 100;
  const setItem = (id: string, fn: (i: Character['inventory'][number]) => void) => up((d) => { const i = d.inventory.find((x) => x.id === id); if (i) fn(i); });
  return (
    <div className="card stack">
      <div className="card-title">
        {box.id && renaming ? (
          <input className="box-name" autoFocus value={box.name} aria-label="Nom du contenant" onBlur={() => setRenaming(false)} onKeyDown={(e) => e.key === 'Enter' && setRenaming(false)}
            onChange={(e) => up((d) => { d.containers.find((x) => x.id === box.id)!.name = e.target.value; })} />
        ) : (
          <h2 onDoubleClick={() => box.id && setRenaming(true)} title={box.id ? 'Double-clic pour renommer' : undefined}><Backpack size={18} /> {box.name}</h2>
        )}
        <span className="row">
          <span className="small muted">{items.length} objet{items.length > 1 ? 's' : ''}{weight ? ` · ${weight} kg` : ''}</span>
          <button className="btn sm" onClick={onSrd}><BookOpen size={15} /> SRD</button>
          {box.id && <button className="btn sm icon" onClick={() => setRenaming(true)} title="Renommer" aria-label="Renommer le contenant"><Pencil size={14} /></button>}
          {box.id && (
            <button className="btn sm icon danger" title="Supprimer le contenant" aria-label="Supprimer le contenant" onClick={() => {
              if (!confirm(`Supprimer « ${box.name} » ? Ses objets seront déplacés dans le sac principal.`)) return;
              up((d) => {
                d.containers = d.containers.filter((x) => x.id !== box.id);
                for (const i of d.inventory) if (i.containerId === box.id) i.containerId = '';
              });
            }}><Trash2 size={14} /></button>
          )}
        </span>
      </div>
      <ul className="list inv">
        {items.length === 0 && <li className="muted">Vide.</li>}
        {items.map((i) => (
          <li key={i.id}>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
              <input type="checkbox" checked={i.equipped} onChange={(e) => setItem(i.id, (x) => { x.equipped = e.target.checked; })} title="Équipé" aria-label={`Équiper ${i.name}`} />
              <span className="grow inv-name">
                {i.name}
                {i.equipped && <span className="chip">équipé</span>}
                {i.attuned && <span className="chip">harmonisé</span>}
              </span>
              {i.value && <span className="chip warn" title="Valeur">{i.value}</span>}
              <button className="btn ghost sm icon" onClick={() => setItem(i.id, (x) => { x.qty = Math.max(0, x.qty - 1); })} aria-label="Retirer un"><Minus size={14} /></button>
              <span className="big-num" style={{ minWidth: 28, textAlign: 'center', fontSize: '1.1rem' }}>{i.qty}</span>
              <button className="btn ghost sm icon" onClick={() => setItem(i.id, (x) => { x.qty += 1; })} aria-label="Ajouter un"><Plus size={14} /></button>
              <button className="btn ghost sm icon" style={{ color: 'var(--danger)' }} onClick={() => { if (confirm(`Retirer « ${i.name} » de l'inventaire ?`)) up((d) => { d.inventory = d.inventory.filter((x) => x.id !== i.id); }); }} aria-label="Supprimer"><Trash2 size={14} /></button>
            </div>
            {i.notes && <div className="inv-desc"><Markdown compact text={i.notes} /></div>}
          </li>
        ))}
      </ul>
      <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => {
        e.preventDefault();
        const t = name.trim();
        if (!t) return;
        const m = t.match(/^(\d+)\s+(.*)$/);
        up((d) => { d.inventory.push({ id: uid(), name: m ? m[2] : t, qty: m ? parseInt(m[1], 10) : 1, weight: 0, equipped: false, attuned: false, value: '', notes: '', containerId: box.id }); });
        setName('');
      }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Ajouter dans « ${box.name} » (ex. 3 torches)`} />
        <button className="btn sm" type="submit" aria-label="Ajouter"><Plus size={16} /></button>
      </form>
    </div>
  );
}

function FeaturesCard({ c, category }: { c: Character; category: 'feature' | 'feat' }) {
  const list = c.features.filter((f) => f.category === category);
  if (!list.length) return null;
  return (
    <div className="card">
      <h2>{category === 'feat' ? <><Award size={18} /> Dons</> : 'Aptitudes'}</h2>
      <ul className="list">
        {list.sort((x, y) => FEATURE_KINDS.indexOf(x.kind) - FEATURE_KINDS.indexOf(y.kind)).map((f) => (
          <li key={f.id}>
            <details>
              <summary style={{ cursor: 'pointer' }}><span className={`chip kind-${f.kind}`}>{FEATURE_KIND_LABELS[f.kind]}</span> {f.name} {(f.featType || f.source) && <span className="small muted">— {[f.featType, f.source].filter(Boolean).join(' · ')}</span>}</summary>
              {f.description && <div className="small" style={{ marginTop: 4 }}><Markdown text={f.description} /></div>}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProficienciesCard({ c }: { c: Character }) {
  const p = c.proficiencies;
  const rows: [string, string[]][] = [['Armures', p.armor], ['Armes', p.weapons], ['Outils', p.tools], ['Langues', p.languages]];
  if (rows.every(([, v]) => !v.length)) return null;
  return (
    <div className="card small">
      <h3>Maîtrises & langues</h3>
      {rows.filter(([, v]) => v.length).map(([k, v]) => (
        <div key={k}><span className="muted">{k} :</span> {v.join(', ')}</div>
      ))}
    </div>
  );
}
