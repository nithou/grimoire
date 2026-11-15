import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bed, BookOpen, Coffee, Dices, Heart, HeartPulse, Minus, Plus, Shield, Skull, Sparkles, Swords, Trash2, Wand2, Backpack, NotebookPen, Star, Zap, LayoutGrid, Drama, Images, Pencil } from 'lucide-react';
import { useCharacter } from '../useCharacter';
import { DiceProvider, DiceTray, ModeSwitch, useDice } from '../dice';
import type { Character } from '../../shared/schema';
import { uid } from '../../shared/schema';
import * as R from '../../shared/rules';
import { ABILITIES, ABILITY_LABELS, COINS, CONDITIONS, SKILLS } from '../../shared/srd-fr';
import { Markdown, Modal, Num, Pips, Skeleton, Tabs, TextArea } from '../ui';
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
      <PlayInner id={id} c={h.char} up={h.update} status={h.status} reload={h.reload} force={h.forceSave} />
    </DiceProvider>
  );
}

type PlayTab = 'general' | 'inventaire' | 'notes';
const TAB_KEY = 'grimoire.playTab';

function PlayInner({ id, c, up, status, reload, force }: { id: string; c: Character; up: Up; status: any; reload: () => void; force: () => void }) {
  const dice = useDice();
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

  const check = (label: string, bonus: number) => dice.d20(label, bonus, { penalty: pen });
  const pp = R.passivePerception(c);
  const ppAuto = 10 + R.skillBonus(c, 'perception');

  return (
    <div>
      <SheetHeader id={id} c={c} mode="play" status={status} onForce={force} onReload={reload} onXp={(xp) => up((d) => { d.identity.xp = xp; })} />
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
            ]}
          />
          <div className="row" style={{ paddingBottom: 6 }}>
            {c.combat.exhaustion > 0 && <span className="chip warn">Épuisement {c.combat.exhaustion} ({pen})</span>}
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
                      <button className="plate" onClick={() => check(`Test de ${ABILITY_LABELS[a].long}`, m)} title={`Test de ${ABILITY_LABELS[a].long}`}>
                        <div className="lbl">{ABILITY_LABELS[a].short}</div>
                        <div className="big">{fm(m)}</div>
                        <div className="sub">{c.abilities[a]}</div>
                      </button>
                      <button className={`save-chip ${prof ? 'on' : ''}`} onClick={() => check(`Sauvegarde de ${ABILITY_LABELS[a].long}`, R.saveBonus(c, a))} title="Jet de sauvegarde">
                        JS {fm(R.saveBonus(c, a))}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="card">
              <h2>Compétences</h2>
              <ul className="list">
                {SKILLS.map((s) => {
                  const st = c.skills[s.key]?.prof ?? 0;
                  return (
                    <li key={s.key} style={{ padding: '0.1rem 0' }}>
                      <button className="rollable" onClick={() => check(s.label, R.skillBonus(c, s.key))}>
                        <span className={`pip ${st === 2 ? 'on' : st === 1 ? 'half' : ''}`} style={{ cursor: 'inherit' }} title={['Non maîtrisée', 'Maîtrise', 'Expertise'][st]} />
                        <span className="grow">{s.label} <span className="muted small">{ABILITY_LABELS[s.ability].short}</span></span>
                        <span className="bonus">{fm(R.skillBonus(c, s.key))}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="small muted" style={{ marginTop: 6 }} title="10 + bonus de Perception">
                Perception passive <strong style={{ color: 'var(--text-strong)' }}>{pp}</strong>
                {c.overrides.passivePerception != null && pp !== ppAuto && <> — valeur forcée (calcul : {ppAuto}), modifiable dans Édition › Caractéristiques</>}
              </div>
            </div>
            <ProficienciesCard c={c} />
            <PersonalityCard c={c} />
          </div>

          {/* ---------- Colonne 2 : combat ---------- */}
          <div className="stack" style={{ gap: '1rem' }}>
            <div className="stat-strip">
              <div className="stat" title={c.combat.acNote}><div className="v"><Shield size={16} /> {c.combat.ac}</div><div className="k">Classe d'armure</div></div>
              <button className="stat" onClick={() => check('Initiative', R.initiative(c))}><div className="v">{fm(R.initiative(c))}</div><div className="k">Initiative</div></button>
              <div className="stat"><div className="v">{R.speed(c)} m</div><div className="k">Vitesse</div></div>
              <div className="stat"><div className="v">{fm(R.proficiencyBonus(c))}</div><div className="k">Maîtrise</div></div>
            </div>
            <InspirationBar c={c} up={up} />
            <HpCard c={c} up={up} />
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
                <span className="small muted">Mode des jets d20 (tests, sauvegardes, attaques)</span>
                <ModeSwitch />
              </div>
              <DiceTray />
            </div>
            <FeaturesCard c={c} />
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
            <TextArea rows={18} value={c.notes} onChange={(v) => up((d) => { d.notes = v; })} placeholder="Notes de session, PNJ, indices…" />
          </div>
          <div className="card stack">
            <h2><Images size={18} /> Images</h2>
            <Gallery characterId={id} portrait={c.identity.portrait} onSetPortrait={(p) => up((d) => { d.identity.portrait = p; })} />
          </div>
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
          <div style={{ whiteSpace: 'pre-wrap' }}>{v}</div>
        </div>
      ))}
      {p.backstory.trim() && (
        <details>
          <summary style={{ cursor: 'pointer' }} className="field-label">Histoire</summary>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{p.backstory}</div>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function HpCard({ c, up }: { c: Character; up: Up }) {
  const dice = useDice();
  const [amt, setAmt] = useState<number | null>(null);
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
        <button className="btn sm danger" disabled={!n} onClick={() => { up((d) => R.applyDamage(d, n)); setAmt(null); }}><Minus size={16} /> Dégâts</button>
        <button className="btn sm" disabled={!n} onClick={() => { up((d) => R.applyHealing(d, n)); setAmt(null); }} style={{ color: 'var(--success)', borderColor: 'var(--success)' }}><Plus size={16} /> Soins</button>
        <button className="btn sm teal" disabled={!n} onClick={() => { up((d) => R.setTempHp(d, n)); setAmt(null); }} title="PV temporaires">Temp.</button>
      </div>
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
        {c.attacks.map((a) => {
          const hit = R.attackToHit(c, a);
          const dmg = R.damageExpression(c, a);
          return (
            <li key={a.id} className="stack" style={{ gap: 4 }}>
              <div className="row spread" style={{ flexWrap: 'nowrap' }}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <strong>{a.name}</strong>
                  <span className="small muted" style={{ display: 'block' }}>{[a.range, a.mastery, a.notes].filter(Boolean).join(' · ')}</span>
                  {a.count != null && (
                    <span className="row small" style={{ gap: 4, marginTop: 2 }}>
                      <button className="btn ghost sm icon" style={{ minHeight: '1.6rem', minWidth: '1.6rem' }} disabled={a.count <= 0} onClick={() => up((d) => { const x = d.attacks.find((y) => y.id === a.id)!; x.count = Math.max(0, (x.count ?? 0) - 1); })} aria-label={`Utiliser un(e) ${a.name}`}><Minus size={13} /></button>
                      <span className={a.count === 0 ? 'error' : ''}>× <strong>{a.count}</strong></span>
                      <button className="btn ghost sm icon" style={{ minHeight: '1.6rem', minWidth: '1.6rem' }} onClick={() => up((d) => { const x = d.attacks.find((y) => y.id === a.id)!; x.count = (x.count ?? 0) + 1; })} aria-label={`Récupérer un(e) ${a.name}`}><Plus size={13} /></button>
                    </span>
                  )}
                </span>
                <button className="btn sm mono" onClick={() => dice.d20(`Attaque : ${a.name}`, hit, {
                  penalty: pen,
                  onResult: (nat) => ({
                    action: nat === 20
                      ? { label: `Dégâts critiques (${dmg})`, run: () => dice.damage(a.name, dmg, true) }
                      : { label: `Dégâts (${dmg})`, run: () => dice.damage(a.name, dmg) },
                  }),
                })}>{fm(hit)}</button>
                <button className="btn sm mono" onClick={() => dice.damage(`Dégâts : ${a.name}`, dmg)} title="Lancer les dégâts">{dmg} <span className="small">{a.damageType}</span></button>
              </div>
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
                <span className="grow" style={{ opacity: l > 0 && !s.prepared && !s.alwaysPrepared ? 0.6 : 1 }}>{s.name} {s.notes && <span className="small muted">— {s.notes}</span>}</span>
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
              {r.description && <span className="small muted" style={{ display: 'block', whiteSpace: 'pre-wrap' }}>{r.description}</span>}
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
          <div className="muted">Objets harmonisés : {c.inventory.filter((i) => i.attuned).length}/3</div>
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
        <div className="small muted">Valeur, poids et description se modifient dans Édition › Inventaire.</div>
      </div>
    </div>
  );
}

/** Un contenant (sac principal ou sac nommé) en vue Jeu. */
function ContainerCard({ c, up, box, onSrd }: { c: Character; up: Up; box: { id: string; name: string }; onSrd: () => void }) {
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const items = c.inventory.filter((i) => i.containerId === box.id);
  const boxes = [{ id: '', name: MAIN_BAG }, ...c.containers];
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
              {boxes.length > 1 && (
                <select className="move-select" value={i.containerId} title="Déplacer vers…" aria-label={`Déplacer ${i.name}`} onChange={(e) => { const to = e.target.value; setItem(i.id, (x) => { x.containerId = to; }); }}>
                  {boxes.map((b) => <option key={b.id} value={b.id}>{b.id === i.containerId ? '↪ Déplacer' : b.name}</option>)}
                </select>
              )}
              <button className="btn ghost sm icon" onClick={() => setItem(i.id, (x) => { x.qty = Math.max(0, x.qty - 1); })} aria-label="Retirer un"><Minus size={14} /></button>
              <span className="big-num" style={{ minWidth: 28, textAlign: 'center', fontSize: '1.1rem' }}>{i.qty}</span>
              <button className="btn ghost sm icon" onClick={() => setItem(i.id, (x) => { x.qty += 1; })} aria-label="Ajouter un"><Plus size={14} /></button>
              <button className="btn ghost sm icon" style={{ color: 'var(--danger)' }} onClick={() => { if (confirm(`Retirer « ${i.name} » de l'inventaire ?`)) up((d) => { d.inventory = d.inventory.filter((x) => x.id !== i.id); }); }} aria-label="Supprimer"><Trash2 size={14} /></button>
            </div>
            {i.notes && <div className="inv-desc">{i.notes}</div>}
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

function FeaturesCard({ c }: { c: Character }) {
  if (!c.features.length) return null;
  return (
    <div className="card">
      <h2>Aptitudes</h2>
      <ul className="list">
        {c.features.map((f) => (
          <li key={f.id}>
            <details>
              <summary style={{ cursor: 'pointer' }}>{f.name} {f.source && <span className="small muted">— {f.source}</span>}</summary>
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
