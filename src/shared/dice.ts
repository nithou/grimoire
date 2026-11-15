// Moteur de dés : expressions du type "2d6+3", "1d8 + 1d6 - 1", "d20", "4d6kh3".

export type Rng = () => number;
export const defaultRng: Rng = () => {
  const g = globalThis.crypto;
  if (g?.getRandomValues) {
    const a = new Uint32Array(1);
    g.getRandomValues(a);
    return a[0] / 2 ** 32;
  }
  return Math.random();
};

export const rollDie = (sides: number, rng: Rng = defaultRng) => 1 + Math.floor(rng() * sides);

export type DiceTerm = { kind: 'dice'; sign: 1 | -1; count: number; sides: number; keepHigh?: number };
export type ConstTerm = { kind: 'const'; sign: 1 | -1; value: number };
export type Term = DiceTerm | ConstTerm;

export function parseDice(expr: string): Term[] {
  const s = expr.replace(/\s+/g, '').toLowerCase().replace(/[dD]/g, 'd');
  if (!s) throw new Error('Expression vide');
  const re = /([+-]?)(?:(\d*)d(\d+)(?:kh(\d+))?|(\d+))/gy;
  const terms: Term[] = [];
  let m: RegExpExecArray | null;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    m = re.exec(s);
    if (!m || m.index !== pos || m[0] === '') throw new Error(`Expression invalide : « ${expr} »`);
    const sign = m[1] === '-' ? -1 : 1;
    if (terms.length > 0 && !m[1]) throw new Error(`Opérateur manquant dans « ${expr} »`);
    if (m[3]) {
      const count = m[2] ? parseInt(m[2], 10) : 1;
      const sides = parseInt(m[3], 10);
      if (count < 1 || count > 100 || sides < 2 || sides > 1000) throw new Error('Dés hors limites');
      terms.push({ kind: 'dice', sign, count, sides, keepHigh: m[4] ? parseInt(m[4], 10) : undefined });
    } else {
      terms.push({ kind: 'const', sign, value: parseInt(m[5], 10) });
    }
    pos = re.lastIndex;
  }
  return terms;
}

export type RolledTerm = { label: string; sign: 1 | -1; rolls: number[]; kept: number[]; value: number };
export type RollResult = { expr: string; total: number; terms: RolledTerm[]; crit: boolean };

/** Lance une expression. `crit` double le nombre de dés (règle des coups critiques). */
export function roll(expr: string, opts: { crit?: boolean; rng?: Rng } = {}): RollResult {
  const rng = opts.rng ?? defaultRng;
  const terms = parseDice(expr);
  const out: RolledTerm[] = [];
  let total = 0;
  for (const t of terms) {
    if (t.kind === 'const') {
      out.push({ label: String(t.value), sign: t.sign, rolls: [], kept: [], value: t.value });
      total += t.sign * t.value;
      continue;
    }
    const count = opts.crit ? t.count * 2 : t.count;
    const rolls = Array.from({ length: count }, () => rollDie(t.sides, rng));
    const kept = t.keepHigh ? [...rolls].sort((a, b) => b - a).slice(0, t.keepHigh) : rolls;
    const value = kept.reduce((a, b) => a + b, 0);
    out.push({ label: `${count}d${t.sides}${t.keepHigh ? `kh${t.keepHigh}` : ''}`, sign: t.sign, rolls, kept, value });
    total += t.sign * value;
  }
  return { expr, total, terms: out, crit: !!opts.crit };
}

export type D20Mode = 'normal' | 'advantage' | 'disadvantage';
export type D20Result = { rolls: number[]; nat: number; bonus: number; total: number; mode: D20Mode; isCrit: boolean; isFumble: boolean };

export function rollD20(bonus: number, mode: D20Mode = 'normal', rng: Rng = defaultRng): D20Result {
  const a = rollDie(20, rng);
  const rolls = mode === 'normal' ? [a] : [a, rollDie(20, rng)];
  const nat = mode === 'advantage' ? Math.max(...rolls) : mode === 'disadvantage' ? Math.min(...rolls) : a;
  return { rolls, nat, bonus, total: nat + bonus, mode, isCrit: nat === 20, isFumble: nat === 1 };
}

export function describeRoll(r: RollResult): string {
  return r.terms
    .map((t, i) => {
      const sign = t.sign < 0 ? '−' : i > 0 ? '+' : '';
      return t.rolls.length ? `${sign}${t.label}[${t.rolls.join(',')}]` : `${sign}${t.label}`;
    })
    .join(' ');
}
