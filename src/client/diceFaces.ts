// Rendu des faces des dés 3D : « Résine & Or ».
// Résine semi-translucide aux volutes laiteuses, paillettes et feuilles d'or en inclusion,
// chiffres dorés gravés en police géométrique arrondie (6 et 9 soulignés).
import '@fontsource/quicksand/600.css';

export const DICE_FONT = '600 64px Quicksand';
const FONT_FAMILY = "Quicksand, 'Avenir Next', 'Century Gothic', 'Nunito', system-ui, sans-serif";

/** PRNG déterministe (mulberry32) pour des inclusions stables par face. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let faceCounter = 0;

function paintResin(ctx: CanvasRenderingContext2D, ts: number, rand: () => number) {
  // Base : résine claire semi-translucide.
  ctx.clearRect(0, 0, ts, ts);
  ctx.fillStyle = 'rgba(246, 246, 249, 0.86)';
  ctx.fillRect(0, 0, ts, ts);

  // Zones cristallines (plus transparentes) et volutes laiteuses nacrées.
  for (let i = 0; i < 4; i++) {
    const x = rand() * ts, y = rand() * ts, r = ts * (0.25 + rand() * 0.35);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    // zones cristallines : on « creuse » la résine pour la rendre plus transparente
    g.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ts, ts);
  }
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = `rgba(245, 245, 248, ${0.45 + rand() * 0.4})`;
    ctx.lineWidth = ts * (0.04 + rand() * 0.09);
    ctx.filter = `blur(${Math.round(ts * 0.02)}px)`;
    ctx.beginPath();
    const x0 = rand() * ts, y0 = rand() * ts;
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(rand() * ts, rand() * ts, rand() * ts, rand() * ts, rand() * ts, rand() * ts);
    ctx.stroke();
  }
  ctx.restore();

  // Inclusions dorées : paillettes et fragments de feuille d'or, légèrement flous (sous la résine).
  ctx.save();
  ctx.filter = 'blur(1px)';
  const flakes = 6 + Math.floor(rand() * 9);
  for (let i = 0; i < flakes; i++) {
    const cx = rand() * ts, cy = rand() * ts;
    const big = rand() < 0.18;
    const r = ts * (big ? 0.02 + rand() * 0.035 : 0.005 + rand() * 0.012);
    const n = 3 + Math.floor(rand() * 4);
    ctx.fillStyle = rand() < 0.5 ? `rgba(217, 155, 38, ${0.55 + rand() * 0.4})` : `rgba(242, 201, 107, ${0.55 + rand() * 0.4})`;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + rand() * 0.8;
      const rr = r * (0.5 + rand() * 0.8);
      const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
      k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Ombre interne douce (réfraction sur les bords) + reflet spéculaire discret.
  const edge = ctx.createRadialGradient(ts / 2, ts / 2, ts * 0.25, ts / 2, ts / 2, ts * 0.72);
  edge.addColorStop(0, 'rgba(0, 0, 0, 0)');
  edge.addColorStop(1, 'rgba(170, 174, 186, 0.22)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, ts, ts);
  const spec = ctx.createRadialGradient(ts * 0.32, ts * 0.26, 0, ts * 0.32, ts * 0.26, ts * 0.32);
  spec.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = spec;
  ctx.fillRect(0, 0, ts, ts);
}

/** Chiffre doré « gravé » : dégradé métallique + liseré sombre fin. */
function goldText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.font = `600 ${size}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const g = ctx.createLinearGradient(x - size / 2, y - size / 2, x + size / 2, y + size / 2);
  g.addColorStop(0, '#A9670F');
  g.addColorStop(0.45, '#D99B26');
  g.addColorStop(0.55, '#EAB952');
  g.addColorStop(1, '#B8761A');
  // Creux de gravure : liseré sombre fin.
  ctx.shadowColor = 'rgba(90, 50, 0, 0.5)';
  ctx.shadowOffsetY = Math.max(1, size * 0.02);
  ctx.shadowBlur = Math.max(1, size * 0.015);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.5, size * 0.05);
  ctx.strokeStyle = '#9A5E0E';
  ctx.strokeText(text, x, y);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = g;
  ctx.fillText(text, x, y);
  if (text === '6' || text === '9') {
    const w = ctx.measureText(text).width;
    const h = Math.max(2, size * 0.075);
    const by = y + size * 0.44;
    ctx.fillStyle = '#9A5E0E';
    ctx.fillRect(x - w * 0.42 - 1, by - 1, w * 0.84 + 2, h + 2);
    ctx.fillStyle = g;
    ctx.fillRect(x - w * 0.42, by, w * 0.84, h);
  }
  ctx.restore();
}

/** Crochet appelé par dice.js pour chaque face. */
export function paintFace(ctx: CanvasRenderingContext2D, ts: number, text: string | string[], opts: { d4: boolean; margin: number }) {
  const label = Array.isArray(text) ? text.join('') : String(text ?? '');
  const rand = rng(0x9e3779b1 ^ (++faceCounter * 2654435761) ^ label.length * 97);
  paintResin(ctx, ts, rand);
  if (opts.d4 && Array.isArray(text)) {
    // D4 : chiffres orientés vers les sommets.
    const size = ts * 0.26;
    for (const t of text) {
      goldText(ctx, String(t), ts / 2, ts / 2 - ts * 0.3, size);
      ctx.translate(ts / 2, ts / 2);
      ctx.rotate((Math.PI * 2) / 3);
      ctx.translate(-ts / 2, -ts / 2);
    }
    return;
  }
  if (!label.trim()) return;
  const size = (ts / (1 + 2 * opts.margin)) * (label.length > 1 ? 1.45 : 1.65);
  goldText(ctx, label, ts / 2, ts / 2, size);
}
