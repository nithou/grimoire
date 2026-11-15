// Animation de dés 3D (three.js + cannon.js), inspirée de Baldur's Gate 3.
// Librairie vendorisée dans public/dice (MIT, sarahRosannaBusch/dice), chargée à la demande.
// Les résultats sont tirés par notre moteur (shared/dice.ts) puis imposés à l'animation.

declare global {
  interface Window {
    DICE?: any;
  }
}

import { DICE_FONT, paintFace } from './diceFaces';

const SUPPORTED = new Set([4, 6, 8, 10, 12, 20]);
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
      await loadScript('/dice/three.min.js');
      await loadScript('/dice/cannon.min.js');
      await loadScript('/dice/teal.js');
      await loadScript('/dice/dice.js');
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
    DICE.vars.desk_color = '#0b0a13';
    DICE.vars.desk_opacity = 0.2;
    DICE.vars.shadow_darkness = 0.6;
    DICE.vars.ambient_light_color = 0xf4f4f6;
    DICE.vars.spot_light_color = 0xffffff;
    Object.assign(DICE.vars.material_options, { color: 0xffffff, specular: 0x9a9a9a, shininess: 70, transparent: true, opacity: 0.97 });
    DICE.soundUrl = '/dice/nc93322.mp3';
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
  const dice = groups.filter((g) => SUPPORTED.has(g.sides)).flatMap((g) => g.values.map((v) => ({ sides: g.sides, v })));
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
  b.setDice(shown.map((d) => `1d${d.sides}`).join('+'));
  await new Promise<void>((resolve) => {
    const fallback = setTimeout(resolve, 6000);
    b.start_throw(
      () => shown.map((d) => (d.sides === 10 ? d.v % 10 : d.v)),
      () => {
        clearTimeout(fallback);
        resolve();
      },
    );
  });
  hide(1400);
}
