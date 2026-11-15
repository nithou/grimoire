import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileJson, ScanText, TriangleAlert, Check, Image as ImageIcon } from 'lucide-react';
import { api, type CharacterSummary, type OcrCard, type OcrSuggestion } from '../api';
import { importCharacterJson, type ImportResult } from '../../shared/legacy-import';
import { blankCharacter, CharacterSchema, uid, type Character } from '../../shared/schema';
import { applyPath } from '../../shared/ocr-parse';
import { totalLevel } from '../../shared/rules';
import { Skeleton } from '../ui';
import { UploadButton, Lightbox } from '../components/Gallery';

export default function ImportPage() {
  const [params] = useSearchParams();
  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <h1>Importer</h1>
      <div className="sheet-layout">
        <JsonImport />
        <OcrImport initialUpload={params.get('upload')} initialTarget={params.get('target')} />
      </div>
    </div>
  );
}

function JsonImport() {
  const nav = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<(ImportResult & { file: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readFile = async (f: File) => {
    setError(null);
    setResult(null);
    try {
      const json = JSON.parse(await f.text());
      setResult({ ...importCharacterJson(json), file: f.name });
    } catch (e) {
      setError(e instanceof SyntaxError ? "Ce fichier n'est pas un JSON valide." : (e as Error).message);
    }
  };

  const c = result?.character;
  return (
    <div className="card stack">
      <h2><FileJson size={20} /> Fichier JSON</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Exports Grimoire, ou fiche JSON libre en français (clés <code>personnage</code>, <code>caracteristiques</code>, <code>combat</code>…).
      </p>
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
        role="button"
        tabIndex={0}
      >
        Déposez un fichier .json ici ou cliquez pour choisir
        <input ref={ref} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readFile(f); }} />
      </div>
      {error && <div className="error">{error}</div>}
      {c && result && (
        <div className="card fade-in stack" style={{ background: 'var(--surface-2)' }}>
          <div className="row spread">
            <div>
              <h3 style={{ margin: 0 }}>{c.identity.name}</h3>
              <div className="small muted">
                {[c.identity.species, c.classes.map((k) => `${k.name} ${k.level}`).join(' / ')].filter(Boolean).join(' · ')} — niveau {totalLevel(c)}
              </div>
              <div className="small muted">{result.file} · format {result.format === 'native' ? 'Grimoire' : 'libre (converti)'}</div>
            </div>
            <button className="btn primary" onClick={async () => { const r = await api.create(c); nav(`/c/${r.id}`); }}><Check size={18} /> Créer la fiche</button>
          </div>
          <div className="small mono">
            FOR {c.abilities.for} · DEX {c.abilities.dex} · CON {c.abilities.con} · INT {c.abilities.int} · SAG {c.abilities.sag} · CHA {c.abilities.cha} — CA {c.combat.ac} · PV {c.combat.hpMax}
          </div>
          <div className="small">{c.attacks.length} attaque(s) · {c.inventory.length} objet(s) · {c.features.length} aptitude(s) · {c.toVerify.length} point(s) à vérifier</div>
          {result.warnings.length > 0 && (
            <ul className="small" style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {result.warnings.map((w, i) => <li key={i}><TriangleAlert size={13} /> {w}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function OcrImport({ initialUpload, initialTarget }: { initialUpload: string | null; initialTarget: string | null }) {
  const nav = useNavigate();
  const [uploadId, setUploadId] = useState<string | null>(initialUpload);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string>('');
  const [sugg, setSugg] = useState<(OcrSuggestion & { on: boolean })[]>([]);
  const [chars, setChars] = useState<CharacterSummary[]>([]);
  const [target, setTarget] = useState<string>(initialTarget ?? 'new');
  const [addNotes, setAddNotes] = useState(true);
  const [zoom, setZoom] = useState(false);
  const [card, setCard] = useState<OcrCard | null>(null);
  const [cardAs, setCardAs] = useState<'none' | 'item' | 'feature'>('none');
  const [cardRes, setCardRes] = useState(true);

  useEffect(() => {
    api.ocrStatus().then((s) => setAvailable(s.available)).catch(() => setAvailable(false));
    api.list().then(setChars).catch(() => undefined);
  }, []);

  const run = async (id: string, force = false) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.ocr(id, force);
      setText(r.text);
      setSugg(r.suggestions.map((s) => ({ ...s, on: true })));
      setCard(r.card);
      // Une carte isolée (peu de valeurs de fiche reconnues) : proposer de l'ajouter comme objet.
      const isCard = !!r.card?.title && r.suggestions.length < 3;
      setCardAs(isCard ? 'item' : 'none');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (uploadId && available) run(uploadId);
  }, [uploadId, available]);

  // Une carte isolée s'ajoute plutôt à une fiche existante.
  const [targetTouched, setTargetTouched] = useState(!!initialTarget);
  useEffect(() => {
    if (!targetTouched && cardAs !== 'none' && chars[0]) setTarget(chars[0].id);
  }, [cardAs, chars, targetTouched]);

  const apply = async () => {
    if (!uploadId) return;
    setBusy(true);
    try {
      let c: Character;
      let version = 0;
      if (target === 'new') c = blankCharacter('Personnage scanné');
      else {
        const doc = await api.get(target);
        c = doc.data;
        version = doc.version;
      }
      const raw: any = structuredClone(c);
      for (const s of sugg) if (s.on) applyPath(raw, s.path, s.value);
      if (card && cardAs !== 'none' && card.title) {
        const name = card.title;
        if (cardAs === 'item') raw.inventory = [...(raw.inventory ?? []), { id: uid(), name, qty: 1, weight: 0, equipped: false, attuned: false, notes: card.description }];
        else raw.features = [...(raw.features ?? []), { id: uid(), name, source: 'Carte', description: card.description }];
        if (cardRes && card.usage) raw.resources = [...(raw.resources ?? []), { id: uid(), name, max: card.usage.max, used: 0, recharge: card.usage.recharge }];
      }
      if (addNotes && text.trim() && cardAs === 'none') raw.notes = [raw.notes, `--- Texte lu sur l'image (OCR) ---\n${text.trim()}`].filter(Boolean).join('\n\n');
      if (!raw.images?.includes(uploadId)) raw.images = [...(raw.images ?? []), uploadId];
      const next = CharacterSchema.parse(raw);
      let id = target;
      if (target === 'new') id = (await api.create(next)).id;
      else await api.save(target, version, next);
      await api.attachUpload(uploadId, id);
      nav(`/c/${id}/edit`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <h2><ScanText size={20} /> Photo de fiche (OCR)</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Photo iPhone (HEIC), JPEG ou PNG. Le texte est lu localement par Tesseract. Les valeurs reconnues sont proposées, à vérifier avant application. L'écriture manuscrite est mal reconnue : le texte brut reste disponible dans les notes.
      </p>
      {available === false && <div className="banner small"><TriangleAlert size={14} /> Tesseract n'est pas disponible sur ce serveur : l'image sera stockée mais pas lue.</div>}
      <div className="row">
        <UploadButton label={uploadId ? 'Choisir une autre image' : 'Envoyer une image'} onDone={(id) => { setUploadId(id); setText(''); setSugg([]); }} />
      </div>
      {uploadId && (
        <div className="grid g2">
          <div>
            <img src={api.imageUrl(uploadId)} alt="Fiche envoyée" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', cursor: 'zoom-in' }} onClick={() => setZoom(true)} />
            {available && <button className="btn ghost sm" disabled={busy} onClick={() => run(uploadId, true)}>Relancer l'OCR</button>}
          </div>
          <div className="stack">
            {busy && !text ? (
              <>
                <span className="small muted">Lecture en cours (jusqu'à une minute)…</span>
                <Skeleton lines={6} />
              </>
            ) : (
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className="mono small" placeholder={available ? 'Texte reconnu' : 'Saisissez ou collez le texte ici'} aria-label="Texte reconnu" />
            )}
          </div>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {uploadId && (
        <div className="stack">
          <h3>Valeurs détectées</h3>
          {sugg.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>{busy ? '…' : 'Aucune valeur reconnue automatiquement.'}</p>
          ) : (
            <table className="tbl">
              <tbody>
                {sugg.map((s, i) => (
                  <tr key={s.key}>
                    <td style={{ width: 30 }}><input type="checkbox" checked={s.on} onChange={(e) => setSugg(sugg.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} aria-label={`Appliquer ${s.label}`} /></td>
                    <td>{s.label}</td>
                    <td><input value={String(s.value)} onChange={(e) => setSugg(sugg.map((x, j) => (j === i ? { ...x, value: typeof x.value === 'number' ? Number(e.target.value) || 0 : e.target.value } : x)))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {card && (card.title || card.description) && (
            <div className="card stack" style={{ background: 'var(--surface-2)' }}>
              <h3 style={{ margin: 0 }}>Carte détectée</h3>
              <label className="field"><span>Nom</span><input value={card.title} onChange={(e) => setCard({ ...card, title: e.target.value })} /></label>
              <label className="field"><span>Description</span><textarea rows={4} value={card.description} onChange={(e) => setCard({ ...card, description: e.target.value })} /></label>
              <div className="row small">
                <span>Ajouter comme</span>
                <select style={{ width: 'auto' }} value={cardAs} onChange={(e) => setCardAs(e.target.value as typeof cardAs)} aria-label="Ajouter la carte comme">
                  <option value="none">Ne pas ajouter</option>
                  <option value="item">Objet d'inventaire</option>
                  <option value="feature">Aptitude</option>
                </select>
                {card.usage && (
                  <label className="row"><input type="checkbox" checked={cardRes} onChange={(e) => setCardRes(e.target.checked)} /> + ressource {card.usage.max} / repos {card.usage.recharge === 'long' ? 'long' : 'court'}</label>
                )}
              </div>
            </div>
          )}
          <label className="row small"><input type="checkbox" checked={addNotes} onChange={(e) => setAddNotes(e.target.checked)} /> Ajouter le texte brut aux notes</label>
          <div className="row">
            <select value={target} onChange={(e) => { setTarget(e.target.value); setTargetTouched(true); }} style={{ width: 'auto' }} aria-label="Fiche cible">
              <option value="new">Nouvelle fiche</option>
              {chars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn primary" disabled={busy} onClick={apply}><ImageIcon size={18} /> Appliquer et joindre l'image</button>
          </div>
        </div>
      )}
      {zoom && uploadId && <Lightbox id={uploadId} onClose={() => setZoom(false)} />}
    </div>
  );
}
