import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { cleanOcrText, scoreOcrText } from '../shared/ocr-parse';

const TESSERACT = process.env.TESSERACT_BIN ?? 'tesseract';
const LANGS = process.env.OCR_LANGS ?? 'fra+eng';

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

let available: boolean | null = null;
export async function tesseractAvailable(): Promise<boolean> {
  if (available != null) return available;
  try {
    available = (await run(TESSERACT, ['--version'], 5000)).code === 0;
  } catch {
    available = false;
  }
  return available;
}

async function tesseract(dir: string, img: Buffer, psm: number): Promise<string> {
  const f = join(dir, `in-${psm}-${Math.random().toString(36).slice(2, 8)}.png`);
  await writeFile(f, img);
  const r = await run(TESSERACT, [f, 'stdout', '-l', LANGS, '--psm', String(psm)], 60_000);
  if (r.code !== 0) throw new Error(r.stderr.split('\n').slice(-3).join(' ') || `code ${r.code}`);
  return r.stdout.replace(/\f/g, '');
}

/** Image en niveaux de gris, redressée de `angle` degrés, à la largeur voulue. */
async function prepare(path: string, angle: number, width: number): Promise<Buffer> {
  return sharp(path)
    .rotate() // orientation EXIF
    .rotate(angle, { background: '#ffffff' })
    .resize({ width })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();
}

// File d'attente : un seul OCR à la fois (tesseract est gourmand en CPU).
let queue: Promise<unknown> = Promise.resolve();

/**
 * Lit le texte d'une image. Les photos prises à la main sont souvent inclinées :
 * on teste plusieurs angles en basse résolution, puis on relit au meilleur angle en pleine résolution.
 */
export function runOcr(imagePath: string): Promise<string> {
  const job = queue.then(async () => {
    if (!(await tesseractAvailable())) throw new Error('tesseract non installé');
    const dir = await mkdtemp(join(tmpdir(), 'ocr-'));
    try {
      const tries = new Map<number, number>();
      const probe = async (angle: number) => {
        if (tries.has(angle)) return tries.get(angle)!;
        const s = scoreOcrText(await tesseract(dir, await prepare(imagePath, angle, 1200), 6));
        tries.set(angle, s);
        return s;
      };
      // Recherche grossière puis affinage autour du meilleur angle.
      for (const a of [0, -6, 6, -12, 12]) await probe(a);
      let best = [...tries.entries()].sort((x, y) => y[1] - x[1])[0][0];
      for (const a of [best - 3, best + 3]) await probe(a);
      best = [...tries.entries()].sort((x, y) => y[1] - x[1])[0][0];

      const full = await prepare(imagePath, best, 1800);
      const candidates = [await tesseract(dir, full, 4), await tesseract(dir, full, 6)];
      candidates.sort((a, b) => scoreOcrText(b) - scoreOcrText(a));
      return cleanOcrText(candidates[0]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  queue = job.catch(() => undefined);
  return job;
}
