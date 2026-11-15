// Animation de dés 3D (three.js + cannon.js), inspirée de Baldur's Gate 3.
// Librairie vendorisée dans public/dice (MIT, sarahRosannaBusch/dice), chargée à la demande.
// Les résultats sont tirés par notre moteur (shared/dice.ts) puis imposés à l'animation.

declare global {
  interface Window {
    DICE?: any;
  }
}

import { DICE_FONT, paintFace } from './diceFaces';

const SUPPORTED = new Set([4, 6, 8, 10, 12, 20, 100]);
// Version du build : les scripts de /dice ont une URL fixe, on la rend unique à chaque build
// pour qu'aucun cache (navigateur, reverse proxy, CDN) ne serve une ancienne librairie.
declare const __BUILD_ID__: string;
const V = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
const asset = (p: string) => `/dice/${p}?v=${V}`;
const PREF_KEY = 'grimoire.dice3d';
const SOUND_KEY = 'grimoire.diceSound';

const readPref = (k: string, d: boolean) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : v === '1';
  } catch {
    return d;
  }
};
const writePref = (k: string, v: boolean) => {
  try {
    localStorage.setItem(k, v ? '1' : '0');
  } catch {
    /* stockage indisponible */
  }
};

export const dice3dPrefs = {
  get enabled() {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return readPref(PREF_KEY, !reduced);
  },
  set enabled(v: boolean) {
    writePref(PREF_KEY, v);
  },
  get sound() {
    return readPref(SOUND_KEY, true);
  },
  set sound(v: boolean) {
    writePref(SOUND_KEY, v);
  },
};

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Échec du chargement de ${src}`));
    document.head.appendChild(s);
  });
}

let loading: Promise<void> | null = null;
function ensureLib() {
  if (!loading) {
    loading = (async () => {
      await loadScript(asset('three.min.js'));
      await loadScript(asset('cannon.min.js'));
      await loadScript(asset('teal.js'));
      await loadScript(asset('dice.js'));
      // Les textures sont dessinées une seule fois : la police doit être prête avant.
      await document.fonts?.load(DICE_FONT).catch(() => undefined);
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

let overlay: HTMLDivElement | null = null;
let box: any = null;
let boxSize = '';
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function getBox() {
  const DICE = window.DICE;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'dice3d-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.addEventListener('click', () => hide(0));
    document.body.appendChild(overlay);
  }
  const size = `${window.innerWidth}x${window.innerHeight}`;
  if (!box || size !== boxSize) {
    // « Résine & Or » : faces peintes par diceFaces.ts, matière translucide, sans fond studio.
    DICE.paintFace = paintFace;
    // Secours si une ancienne dice.js (sans crochet paintFace) est servie : dés clairs à chiffres dorés.
    if (!DICE.paintFaceSupported) {
      DICE.vars.dice_color = '#eef0f4';
      DICE.vars.label_color = '#9a5e0e';
    }
    DICE.vars.desk_color = '#0b0a13';
    DICE.vars.desk_opacity = 0.2;
    DICE.vars.shadow_darkness = 0.6;
    // Lumière plus douce : évite que les faces exposées « brûlent » au blanc et masquent les chiffres.
    DICE.vars.ambient_light_color = 0xc8c8cc;
    DICE.vars.spot_light_color = 0xd9d9dc;
    Object.assign(DICE.vars.material_options, { color: 0xffffff, specular: 0x3a3a3a, shininess: 40, transparent: true, opacity: 0.97 });
    DICE.soundUrl = asset('nc93322.mp3');
    overlay.innerHTML = '';
    box = new DICE.dice_box(overlay);
    boxSize = size;
  }
  DICE.muted = !dice3dPrefs.sound;
  return box;
}

function hide(delay: number) {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => overlay?.classList.remove('on'), delay);
}

export type DiceGroup = { sides: number; values: number[] };

/**
 * Lance l'animation 3D avec des résultats imposés. Résout quand les dés sont arrêtés
 * (ou immédiatement si l'animation est désactivée / impossible).
 */
export async function animateDice(groups: DiceGroup[]): Promise<void> {
  if (!dice3dPrefs.enabled) return;
  // d100 = dé des dizaines (00–90) + d10 des unités (0–9) ; 100 = « 00 » + « 0 ».
  const dice = groups
    .filter((g) => SUPPORTED.has(g.sides))
    .flatMap((g) =>
      g.values.flatMap((v) =>
        g.sides === 100
          ? [{ type: 'd100', forced: v === 100 ? 0 : Math.floor(v / 10) * 10 }, { type: 'd10', forced: v % 10 }]
          : [{ type: `d${g.sides}`, forced: g.sides === 10 ? v % 10 : v }],
      ),
    );
  if (!dice.length) return;
  const shown = dice.slice(0, 12); // au-delà, l'animation devient illisible
  try {
    await ensureLib();
  } catch {
    return;
  }
  const b = getBox();
  if (b.rolling) return;
  overlay!.classList.add('on');
  b.setDice(shown.map((d) => `1${d.type}`).join('+'));
  await new Promise<void>((resolve) => {
    const fallback = setTimeout(resolve, 6000);
    b.start_throw(
      () => shown.map((d) => d.forced),
      () => {
        clearTimeout(fallback);
        resolve();
      },
    );
  });
  hide(1400);
}
