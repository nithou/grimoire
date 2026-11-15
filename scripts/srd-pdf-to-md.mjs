// Convertit le PDF du SRD 5.2.1 (français) en markdown structuré.
// Usage : node scripts/srd-pdf-to-md.mjs ressources/FR_SRD_CC_v5.2.1.pdf srd/fr/srd-fr.md
// Heuristiques basées sur la mise en page officielle (A4, deux colonnes, tailles de police fixes).
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('Usage : node scripts/srd-pdf-to-md.mjs <entrée.pdf> <sortie.md>');
  process.exit(1);
}

const COL_SPLIT = 300; // abscisse séparant les deux colonnes
const FOOTER_Y = 45;

const doc = await getDocument({ data: new Uint8Array(readFileSync(input)), useSystemFonts: true, verbosity: 0 }).promise;

/** Style d'une police d'après son nom PostScript. */
function styleOf(name = '') {
  const n = name.toLowerCase();
  return { bold: /bold|black|heavy|semibold|demi/.test(n), italic: /italic|oblique/.test(n) };
}

const out = [];
let para = null; // paragraphe en cours : { kind, lines: [] }
let lastHeading = { level: 0, page: 0, idx: -1 };

function headingLevel(h, bold) {
  if (h >= 24) return 1;
  if (h >= 17) return 2;
  if (h >= 13.5) return 3;
  if (h >= 11.8 && h < 12.5 && bold) return 4;
  return 0;
}

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  await page.getOperatorList(); // charge les polices dans commonObjs
  const tc = await page.getTextContent();
  const fontStyle = {};
  const font = (id) => {
    if (!(id in fontStyle)) {
      let name = '';
      try {
        name = page.commonObjs.get(id)?.name ?? '';
      } catch {
        /* police non résolue */
      }
      fontStyle[id] = styleOf(name);
    }
    return fontStyle[id];
  };

  const items = tc.items
    .filter((i) => i.str !== undefined && i.str.trim() !== '')
    .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.round(Math.abs(i.transform[3]) * 10) / 10, f: i.fontName }))
    .filter((i) => i.y > FOOTER_Y && i.y < 800);

  // Regroupement en lignes, colonne par colonne.
  const cols = [items.filter((i) => i.x < COL_SPLIT), items.filter((i) => i.x >= COL_SPLIT)];
  for (const col of cols) {
    col.sort((a, b) => b.y - a.y || a.x - b.x);
    // Marge gauche de la colonne : abscisse la plus fréquente du texte courant.
    const freq = {};
    for (const i of col) if (i.h >= 9 && i.h <= 10) freq[Math.round(i.x)] = (freq[Math.round(i.x)] ?? 0) + 1;
    const margin = Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? (col === cols[0] ? 63 : 313));
    const lines = [];
    for (const it of col) {
      const big = it.h >= 7;
      const line = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(2, 0.45 * Math.max(l.h, it.h)));
      if (line) {
        line.items.push(it);
        if (big && it.h > line.h) line.h = it.h;
      } else lines.push({ y: it.y, h: big ? it.h : 9.5, items: [it] });
    }
    lines.sort((a, b) => b.y - a.y);

    let prev = null;
    for (const l of lines) {
      l.items.sort((a, b) => a.x - b.x);
      const main = l.items.find((i) => i.h >= 7) ?? l.items[0];
      const st = font(main.f);
      const lvl = headingLevel(l.h, st.bold);
      // Cellules de tableau : grands écarts horizontaux.
      let isTable = false;
      let text = '';
      let end = null;
      const segs = [];
      for (const it of l.items) {
        const s = font(it.f);
        let str = it.s;
        if (it.h < 7 && /^(er|re|e|ème|nd|de)$/.test(str.trim())) str = str.trim(); // exposants : 1er, 2e
        if (end != null) {
          const gap = it.x - end;
          if (gap > 14 && lvl === 0) {
            isTable = true;
            segs.push('|');
          } else if (gap > 0.25 && !/^[,.)]/.test(str) && !text.endsWith('(')) segs.push(' ');
        }
        segs.push(lvl === 0 && !isTable ? wrap(str, s, l.h) : str);
        text += str;
        end = it.x + it.w;
      }
      let md = segs.join('').replace(/\*\*\s*\*\*/g, '').replace(/__/g, '').replace(/\s+/g, ' ').trim();
      md = md.replace(/\*\* \*\*/g, ' ').replace(/_ _/g, ' ');
      const indent = l.items[0].x - margin;
      const block = { lvl, md, isTable, h: l.h, indent, y: l.y, gap: prev ? prev.y - l.y : 0, page: p, bold: st.bold, italic: st.italic };
      emit(block);
      prev = l;
    }
  }
}

function wrap(str, s, h) {
  if (h >= 10.5 && s.bold) return `**${str}**`;
  if (s.bold && s.italic) return `**_${str}_**`;
  if (s.bold) return `**${str}**`;
  if (s.italic) return `_${str}_`;
  return str;
}

// ---- Assemblage en paragraphes ----
function flush() {
  if (!para) return;
  if (para.kind === 'p') out.push(joinWrapped(para.lines), '');
  else if (para.kind === 'table') out.push(...para.lines.map((l) => `| ${l.replace(/\|/g, ' | ')} |`), '');
  else if (para.kind === 'lines') out.push(para.lines.join('\n'), '');
  para = null;
}

function joinWrapped(lines) {
  let s = '';
  for (const l of lines) {
    if (!s) s = l;
    else if (/[A-Za-zÀ-ÿ]-$/.test(s) && /^[a-zà-ÿ]/.test(l.replace(/^[*_]+/, ''))) s = s.slice(0, -1) + l; // césure
    else if (/-$/.test(s) && /^[a-zà-ÿ]/.test(l)) s = s.slice(0, -1) + l;
    else s += ' ' + l;
  }
  return s.replace(/\*\*\s?-\s?\*\*$/, '').replace(/(\*\*|_) \1/g, ' ').replace(/(\*\*|_)\1/g, '');
}

function emit(b) {
  if (b.lvl) {
    // Titres sur plusieurs lignes : fusion avec le titre précédent de même niveau.
    const last = out[out.length - 2];
    if (!para && lastHeading.level === b.lvl && lastHeading.page === b.page && last?.startsWith('#'.repeat(b.lvl) + ' ') && b.gap > 0 && b.gap < b.h * 1.6) {
      out[out.length - 2] = `${last} ${b.md}`.replace(/\s+/g, ' ');
      return;
    }
    flush();
    out.push(`${'#'.repeat(b.lvl)} ${b.md.replace(/\*\*/g, '')}`, '');
    lastHeading = { level: b.lvl, page: b.page };
    return;
  }
  lastHeading = { level: 0, page: b.page };
  if (b.isTable) {
    if (para?.kind !== 'table') flush();
    para ??= { kind: 'table', lines: [] };
    para.lines.push(b.md.replace(/\*\*|(^|\s)_|_(\s|$)/g, '$1$2').trim());
    return;
  }
  // Ligne « étiquette » (commence par du gras : Portée :, Temps d’incantation…) ou méta en italique.
  const isLabel = /^\*\*[^*]{1,40}\*\*\s*:?/.test(b.md) && /:\s*/.test(b.md.slice(0, 60));
  // Suite d'une ligne étiquette qui déborde sur la ligne suivante.
  if (para?.kind === 'lines' && !isLabel && b.indent <= 10 && !b.md.startsWith('**') && b.gap > 0 && b.gap < b.h * 1.4) {
    para.lines[para.lines.length - 1] = joinWrapped([para.lines[para.lines.length - 1], b.md]);
    return;
  }
  const startsPara = b.indent > 5 || b.gap > b.h * 1.7 || isLabel || para?.kind === 'table';
  if (isLabel) {
    if (para?.kind !== 'lines') flush();
    para ??= { kind: 'lines', lines: [] };
    para.lines.push(b.md.replace(/\*\*\s*:\s*\*\*/, ' :**').replace(/\*\*([^*]+?)\s*\*\*\s*:\s*/, '**$1 :** '));
    return;
  }
  if (startsPara || para?.kind !== 'p') {
    flush();
    para = { kind: 'p', lines: [] };
  }
  para.lines.push(b.md);
}
flush();

const md = out.join('\n').replace(/\n{3,}/g, '\n\n');
writeFileSync(output, md);
console.log(`Écrit ${output} (${md.length} caractères, ${doc.numPages} pages)`);
