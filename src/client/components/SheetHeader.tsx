import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Crown, Check, CloudOff, Download, Eye, Loader, Pencil, Plus, Printer, TriangleAlert, UserRound } from 'lucide-react';
import { api } from '../api';
import type { Character } from '../../shared/schema';
import { totalLevel, xpProgress } from '../../shared/rules';
import { IMAGE_ACCEPT } from './Gallery';
import type { SaveStatus } from '../useCharacter';

export function SaveState({ status, onForce, onReload }: { status: SaveStatus; onForce: () => void; onReload: () => void }) {
  if (status === 'conflict')
    return (
      <span className="save-state" style={{ color: 'var(--danger)' }}>
        <TriangleAlert size={16} /> Modifiée ailleurs.
        <button className="btn sm" onClick={onReload}>Recharger</button>
        <button className="btn sm danger" onClick={onForce}>Écraser</button>
      </span>
    );
  const map: Record<SaveStatus, [JSX.Element, string]> = {
    loading: [<Loader size={14} />, 'Chargement'],
    saved: [<Check size={14} />, 'Enregistré'],
    dirty: [<Pencil size={14} />, 'Modifié'],
    saving: [<Loader size={14} />, 'Enregistrement…'],
    error: [<CloudOff size={14} />, 'Erreur d’enregistrement — nouvel essai'],
    offline: [<CloudOff size={14} />, 'Hors ligne — enregistré sur cet appareil, envoi au retour du réseau'],
    conflict: [<TriangleAlert size={14} />, ''],
  };
  const [icon, label] = map[status];
  return <span className="save-state" aria-live="polite">{icon} {label}</span>;
}

const fmt = (n: number) => n.toLocaleString('fr-FR');

/** Barre d'expérience : progression vers le niveau suivant (seuils 2024), total modifiable. */
export function XpBar({ c, onXp }: { c: Character; onXp: (xp: number) => void }) {
  const p = xpProgress(c);
  const [gain, setGain] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(p.xp));
  return (
    <div className="xp" aria-label="Expérience">
      <div className="row spread small" style={{ gap: 6 }}>
        <span className="row" style={{ gap: 6 }}>
          <strong>PX</strong>
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); const n = parseInt(draft, 10); if (Number.isFinite(n)) onXp(Math.max(0, n)); setEditing(false); }}>
              <input autoFocus type="number" min={0} className="xp-input" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Total de PX" />
            </form>
          ) : (
            <button className="xp-total" onClick={() => { setDraft(String(p.xp)); setEditing(true); }} title="Modifier le total de PX">
              {fmt(p.xp)}{p.next != null && <span className="muted"> / {fmt(p.next)}</span>}
            </button>
          )}
          {p.canLevelUp && <span className="chip on">Niveau {p.xpLevel} atteint !</span>}
        </span>
        <form className="row no-print" style={{ gap: 4, flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); const n = parseInt(gain, 10); if (Number.isFinite(n) && n !== 0) onXp(Math.max(0, p.xp + n)); setGain(''); }}>
          <input className="xp-input" type="number" placeholder="+ PX" value={gain} onChange={(e) => setGain(e.target.value)} aria-label="PX gagnés" />
          <button className="btn sm icon" type="submit" aria-label="Ajouter les PX"><Plus size={14} /></button>
        </form>
      </div>
      <div className="xp-bar" role="progressbar" aria-valuemin={p.floor} aria-valuemax={p.next ?? p.xp} aria-valuenow={p.xp}>
        <span style={{ width: `${Math.round(p.ratio * 100)}%` }} />
      </div>
      <div className="small muted">{p.next == null ? 'Niveau maximum' : p.canLevelUp ? `Montée de niveau possible : augmentez le niveau de classe dans Édition › Identité.` : `Niveau ${p.level} → ${p.level + 1} : encore ${fmt(p.next - p.xp)} PX`}</div>
    </div>
  );
}

export function SheetHeader({ id, c, mode, status, onForce, onReload, onXp, onPortrait, role = 'owner', owner = '' }: {
  id: string; c: Character; mode: 'edit' | 'play'; status: SaveStatus; onForce: () => void; onReload: () => void;
  onXp: (xp: number) => void; onPortrait?: (uploadId: string) => void; role?: 'owner' | 'dm'; owner?: string;
}) {
  const classes = c.classes.map((k) => `${k.name}${k.subclass ? ` (${k.subclass})` : ''} ${k.level}`).join(' / ');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const editable = mode === 'edit' && !!onPortrait;
  const portrait = c.identity.portrait ? <img src={api.imageUrl(c.identity.portrait, true)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserRound size={44} />;
  return (
    <div className="row spread" style={{ marginBottom: '0.75rem', alignItems: 'flex-start' }}>
      <div className="row" style={{ flexWrap: 'nowrap', minWidth: 0, alignItems: 'flex-start', flex: '1 1 420px' }}>
        {editable ? (
          <>
            <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setBusy(true);
              setErr(null);
              try {
                const r = await api.upload(f, id);
                onPortrait!(r.id);
              } catch (x) {
                setErr((x as Error).message);
              } finally {
                setBusy(false);
              }
            }} />
            <button className="portrait lg portrait-edit" style={{ flexShrink: 0 }} onClick={() => fileRef.current?.click()} title="Changer le portrait" aria-label="Changer le portrait" disabled={busy}>
              {busy ? <Loader size={28} className="spin" /> : portrait}
              <span className="portrait-badge"><Camera size={14} /></span>
            </button>
          </>
        ) : (
          <div className="portrait lg" style={{ flexShrink: 0 }}>{portrait}</div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ margin: 0 }}>{c.identity.name || 'Sans nom'}</h1>
          {role === 'dm' && <span className="chip on dm-badge" style={{ marginTop: 4 }}><Crown size={13} /> Maître du Donjon · fiche de {owner}</span>}
          <div className="muted">
            {[c.identity.species, classes || 'Sans classe', c.identity.background].filter(Boolean).join(' · ')} — niveau {totalLevel(c)}
          </div>
          <XpBar c={c} onXp={onXp} />
          <SaveState status={status} onForce={onForce} onReload={onReload} />
          {err && <div className="error small">{err}</div>}
        </div>
      </div>
      <div className="row no-print">
        {mode === 'edit' ? (
          <Link className="btn teal" to={`/c/${id}`}><Eye size={18} /> Vue jeu</Link>
        ) : (
          <Link className="btn" to={`/c/${id}/edit`}><Pencil size={18} /> Éditer</Link>
        )}
        <a className="btn icon" href={api.exportUrl(id)} title="Exporter en JSON" aria-label="Exporter en JSON"><Download size={18} /></a>
        <button className="btn icon" onClick={() => window.print()} title="Imprimer" aria-label="Imprimer"><Printer size={18} /></button>
      </div>
    </div>
  );
}

export function ToVerifyBanner({ items, onChange }: { items: string[]; onChange?: (v: string[]) => void }) {
  if (!items.length) return null;
  return (
    <details className="banner" style={{ marginBottom: '0.75rem' }}>
      <summary style={{ cursor: 'pointer' }}><TriangleAlert size={16} style={{ verticalAlign: '-3px' }} /> {items.length} point(s) à vérifier</summary>
      <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
        {items.map((t, i) => (
          <li key={i} style={{ marginBottom: 4 }}>
            {t}{' '}
            {onChange && <button className="btn ghost sm" onClick={() => onChange(items.filter((_, j) => j !== i))}>Résolu</button>}
          </li>
        ))}
      </ul>
    </details>
  );
}
