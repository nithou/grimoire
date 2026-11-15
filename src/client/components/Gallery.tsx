import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, UserRound, ScanText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, type UploadInfo } from '../api';

export const IMAGE_ACCEPT = 'image/*,.heic,.heif';

export function UploadButton({ characterId, onDone, label = 'Ajouter une image' }: { characterId?: string; onDone: (id: string) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="stack" style={{ gap: 2 }}>
      <input ref={ref} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setBusy(true);
        setErr(null);
        try {
          const r = await api.upload(f, characterId);
          onDone(r.id);
        } catch (x) {
          setErr((x as Error).message);
        } finally {
          setBusy(false);
        }
      }} />
      <button className="btn sm" disabled={busy} onClick={() => ref.current?.click()}>
        <Upload size={16} /> {busy ? 'Envoi et conversion…' : label}
      </button>
      {err && <span className="error small">{err}</span>}
    </span>
  );
}

export function Lightbox({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-label="Image agrandie">
      <img src={api.imageUrl(id)} alt="" />
    </div>
  );
}

export function Gallery({ characterId, portrait, onSetPortrait }: { characterId: string; portrait: string; onSetPortrait: (id: string) => void }) {
  const [items, setItems] = useState<UploadInfo[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);
  const load = () => api.uploads(characterId).then(setItems).catch(() => undefined);
  useEffect(() => {
    load();
  }, [characterId]);
  return (
    <div className="stack">
      <div className="row">
        <UploadButton characterId={characterId} onDone={load} />
        <span className="small muted">HEIC (iPhone), JPEG, PNG, WebP — 25 Mo max.</span>
      </div>
      {items.length === 0 ? (
        <p className="muted small">Aucune image : ajoutez un portrait ou des photos de votre fiche papier.</p>
      ) : (
        <div className="gallery">
          {items.map((u) => (
            <figure key={u.id}>
              <img src={api.imageUrl(u.id, true)} alt={u.original_name} onClick={() => setZoom(u.id)} loading="lazy" />
              <div className="row" style={{ marginTop: 4, gap: 2 }}>
                <button className={`btn sm icon ${portrait === u.id ? 'teal' : ''}`} title="Définir comme portrait" aria-label="Définir comme portrait" onClick={() => onSetPortrait(portrait === u.id ? '' : u.id)}><UserRound size={15} /></button>
                <Link className="btn sm icon" title="Lire le texte (OCR)" aria-label="Lire le texte (OCR)" to={`/import?upload=${u.id}&target=${characterId}`}><ScanText size={15} /></Link>
                <button className="btn sm icon danger" title="Supprimer" aria-label="Supprimer l'image" onClick={async () => {
                  if (!confirm("Supprimer définitivement cette image ?")) return;
                  await api.deleteUpload(u.id);
                  if (portrait === u.id) onSetPortrait('');
                  load();
                }}><Trash2 size={15} /></button>
              </div>
            </figure>
          ))}
        </div>
      )}
      {zoom && <Lightbox id={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
