// Mini rendu Markdown (sûr : tout est échappé) : **gras**, *italique* / _italique_, listes,
// citations, titres, tableaux simples ; retours à la ligne conservés dans un paragraphe.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BEFORE = "(^|[\\s(>«\"'’\\-–—/\\[])";
const AFTER = "(?=[\\s.,;:)!?<»\"'’\\-–—/\\]]|$)";
const reItalicStar = new RegExp(`${BEFORE}\\*(?!\\s)(.+?)(?<!\\s)\\*${AFTER}`, 'g');
const reItalicUnder = new RegExp(`${BEFORE}_(?!\\s)(.+?)(?<!\\s)_${AFTER}`, 'g');

const inline = (s: string) =>
  esc(s)
    .replace(/\*\*\*(?!\s)(.+?)(?<!\s)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(?!\s)(.+?)(?<!\s)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?!\s)(.+?)(?<!\s)__/g, '<strong>$1</strong>')
    .replace(reItalicUnder, '$1<em>$2</em>')
    .replace(reItalicStar, '$1<em>$2</em>');

export function mdToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br/>')}</p>`);
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    if (!t) { flush(); continue; }
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(); const lv = Math.min(6, Math.max(4, h[1].length)); out.push(`<h${lv}>${inline(h[2])}</h${lv}>`); continue; }
    if (t.startsWith('|')) {
      flush();
      const rows: string[] = [];
      let first = true;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) {
          const tag = first ? 'th' : 'td';
          rows.push(`<tr>${cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`);
          first = false;
        }
        i++;
      }
      i--;
      out.push(`<table>${rows.join('')}</table>`);
      continue;
    }
    if (t.startsWith('>')) { flush(); out.push(`<blockquote>${inline(t.replace(/^>\s?/, ''))}</blockquote>`); continue; }
    if (/^[-*]\s+/.test(t)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { items.push(`<li>${inline(lines[i].trim().replace(/^[-*]\s+/, ''))}</li>`); i++; }
      i--;
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    para.push(t);
  }
  flush();
  return out.join('\n');
}
