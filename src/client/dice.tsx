import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Dices, Volume2, VolumeX, X } from 'lucide-react';
import { roll, rollD20, describeRoll, type D20Mode, type RollResult } from '../shared/dice';
import { animateDice, dice3dPrefs, type DiceGroup } from './dice3d';
import { fmtMod } from '../shared/rules';
import { api, type RollEntry } from './api';

export type RollDisplay = {
  label: string;
  total: number;
  detail: string;
  tone?: 'crit' | 'fumble';
  note?: string;
  action?: { label: string; run: () => void };
};

type Ctx = {
  mode: D20Mode;
  setMode: (m: D20Mode) => void;
  /** Test d20 : renvoie le résultat (nat, total). */
  d20: (label: string, bonus: number, opts?: { penalty?: number; mode?: D20Mode; note?: string; onResult?: (nat: number, total: number) => { action?: RollDisplay['action']; note?: string } | void; extra?: string }) => { nat: number; total: number };
  damage: (label: string, expr: string, crit?: boolean) => void;
  free: (expr: string) => void;
  log: RollEntry[];
  clearLog: () => void;
};

const DiceCtx = createContext<Ctx | null>(null);
export const useDice = () => useContext(DiceCtx)!;

const MODE_LABEL: Record<D20Mode, string> = { normal: '', advantage: ' (avantage)', disadvantage: ' (désavantage)' };

export function DiceProvider({ characterId, children }: { characterId?: string; children: ReactNode }) {
  const [mode, setMode] = useState<D20Mode>('normal');
  const [shown, setShown] = useState<RollDisplay | null>(null);
  const [rolling, setRolling] = useState(false);
  const [log, setLog] = useState<RollEntry[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (characterId) api.rolls(characterId).then(setLog).catch(() => setLog([]));
  }, [characterId]);

  const seq = useRef(0);

  /** Joue l'animation 3D (si activée) puis affiche le résultat. Le journal est mis à jour immédiatement. */
  const show = useCallback(
    async (r: RollDisplay, groups: DiceGroup[] = []) => {
      const n = ++seq.current;
      const entry = { label: r.label, detail: r.detail, total: r.total };
      if (characterId) api.addRoll(characterId, entry).catch(() => undefined);
      setRolling(true);
      setShown(null);
      await animateDice(groups).catch(() => undefined);
      if (n !== seq.current) return; // un lancer plus récent a pris le relais
      setLog((l) => [{ ...entry, id: Date.now(), created_at: Date.now() }, ...l].slice(0, 100));
      setShown(r);
      setTimeout(() => setRolling(false), 350);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShown(null), r.action ? 15000 : 8000);
    },
    [characterId],
  );

  const groupsOf = (r: RollResult): DiceGroup[] =>
    r.terms.filter((t) => t.rolls.length).map((t) => ({ sides: parseInt(t.label.split('d')[1], 10), values: t.rolls }));

  const d20: Ctx['d20'] = useCallback(
    (label, bonus, opts = {}) => {
      const m = opts.mode ?? mode;
      const total = bonus + (opts.penalty ?? 0);
      const r = rollD20(total, m);
      const pieces = [`d20[${r.rolls.join(',')}]${m !== 'normal' ? (m === 'advantage' ? '↑' : '↓') : ''}`, fmtMod(bonus)];
      if (opts.penalty) pieces.push(`${opts.penalty} épuis.`);
      const res = opts.onResult?.(r.nat, r.total) || {};
      show({
        label: label + MODE_LABEL[m],
        total: r.total,
        detail: pieces.join(' ') + (opts.extra ? ` — ${opts.extra}` : ''),
        tone: r.isCrit ? 'crit' : r.isFumble ? 'fumble' : undefined,
        note: res.note ?? opts.note ?? (r.isCrit ? '20 naturel !' : r.isFumble ? '1 naturel…' : undefined),
        action: res.action,
      }, [{ sides: 20, values: r.rolls }]);
      return { nat: r.nat, total: r.total };
    },
    [mode, show],
  );

  const damage: Ctx['damage'] = useCallback(
    (label, expr, crit = false) => {
      try {
        const r = roll(expr, { crit });
        show({ label: `${label}${crit ? ' — critique' : ''}`, total: Math.max(0, r.total), detail: describeRoll(r), tone: crit ? 'crit' : undefined }, groupsOf(r));
      } catch (e) {
        show({ label, total: 0, detail: (e as Error).message, tone: 'fumble' });
      }
    },
    [show],
  );

  const free: Ctx['free'] = useCallback(
    (expr) => {
      try {
        const r = roll(expr);
        show({ label: expr, total: r.total, detail: describeRoll(r) }, groupsOf(r));
      } catch (e) {
        show({ label: expr, total: 0, detail: (e as Error).message, tone: 'fumble' });
      }
    },
    [show],
  );

  const clearLog = useCallback(() => {
    setLog([]);
    if (characterId) api.clearRolls(characterId).catch(() => undefined);
  }, [characterId]);

  return (
    <DiceCtx.Provider value={{ mode, setMode, d20, damage, free, log, clearLog }}>
      {children}
      {shown && (
        <div className="dice-toast" role="status" aria-live="polite">
          <div className="row spread">
            <strong className="grow">{shown.label}</strong>
            <button className="btn ghost sm icon" onClick={() => setShown(null)} aria-label="Fermer"><X size={16} /></button>
          </div>
          <div className="row" style={{ alignItems: 'center', gap: '0.75rem', marginTop: 4 }}>
            <Dices size={32} className={`dice-icon ${rolling ? 'spin' : ''}`} />
            <span className={`total ${shown.tone ?? ''}`}>{rolling ? '…' : shown.total}</span>
            <span className="mono small muted grow" style={{ wordBreak: 'break-word' }}>{shown.detail}</span>
          </div>
          {shown.note && <div className={`small ${shown.tone ?? ''}`} style={{ marginTop: 4 }}>{shown.note}</div>}
          {shown.action && (
            <button className="btn primary sm" style={{ marginTop: 8 }} onClick={() => { const a = shown.action!; setShown(null); a.run(); }}>
              {shown.action.label}
            </button>
          )}
        </div>
      )}
    </DiceCtx.Provider>
  );
}

export function ModeSwitch() {
  const { mode, setMode } = useDice();
  const opts: { k: D20Mode; l: string }[] = [
    { k: 'disadvantage', l: 'Désavantage' },
    { k: 'normal', l: 'Normal' },
    { k: 'advantage', l: 'Avantage' },
  ];
  return (
    <div className="mode-switch" role="radiogroup" aria-label="Mode de lancer">
      {opts.map((o) => (
        <button key={o.k} role="radio" aria-checked={mode === o.k} className={mode === o.k ? 'on' : ''} onClick={() => setMode(o.k)}>{o.l}</button>
      ))}
    </div>
  );
}

export function DiceTray() {
  const { free, log, clearLog } = useDice();
  const [expr, setExpr] = useState('1d20');
  const [anim, setAnim] = useState(dice3dPrefs.enabled);
  const [sound, setSound] = useState(dice3dPrefs.sound);
  return (
    <div className="stack">
      <div className="row small">
        <button className={`chip ${anim ? 'on' : ''}`} aria-pressed={anim} onClick={() => { dice3dPrefs.enabled = !anim; setAnim(!anim); }}>
          <Box size={14} /> Dés 3D
        </button>
        <button className={`chip ${sound && anim ? 'on' : ''}`} aria-pressed={sound} disabled={!anim} onClick={() => { dice3dPrefs.sound = !sound; setSound(!sound); }}>
          {sound ? <Volume2 size={14} /> : <VolumeX size={14} />} Son
        </button>
      </div>
      <div className="row">
        {[4, 6, 8, 10, 12, 20, 100].map((d) => (
          <button key={d} className="btn sm mono" onClick={() => free(`1d${d}`)}>d{d}</button>
        ))}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); free(expr); }}>
        <input className="grow mono" style={{ width: 'auto' }} value={expr} onChange={(e) => setExpr(e.target.value)} aria-label="Expression de dés" placeholder="2d6+3" />
        <button className="btn teal sm" type="submit">Lancer</button>
      </form>
      <div className="row spread">
        <span className="small muted">Journal des lancers</span>
        {log.length > 0 && <button className="btn ghost sm" onClick={clearLog}>Effacer</button>}
      </div>
      <ul className="list small" style={{ maxHeight: 260, overflow: 'auto' }}>
        {log.length === 0 && <li className="muted">Aucun lancer pour l'instant.</li>}
        {log.map((r) => (
          <li key={r.id} className="row spread" style={{ flexWrap: 'nowrap' }}>
            <span className="grow" style={{ minWidth: 0 }}>
              {r.label}
              <span className="muted mono" style={{ display: 'block', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.detail}</span>
            </span>
            <strong className="mono">{r.total}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
