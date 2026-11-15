import { Link } from 'react-router-dom';
import { Check, CloudOff, Download, Eye, Loader, Pencil, Printer, TriangleAlert, UserRound } from 'lucide-react';
import { api } from '../api';
import type { Character } from '../../shared/schema';
import { totalLevel } from '../../shared/rules';
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
    conflict: [<TriangleAlert size={14} />, ''],
  };
  const [icon, label] = map[status];
  return <span className="save-state" aria-live="polite">{icon} {label}</span>;
}

export function SheetHeader({ id, c, mode, status, onForce, onReload }: { id: string; c: Character; mode: 'edit' | 'play'; status: SaveStatus; onForce: () => void; onReload: () => void }) {
  const classes = c.classes.map((k) => `${k.name}${k.subclass ? ` (${k.subclass})` : ''} ${k.level}`).join(' / ');
  return (
    <div className="row spread" style={{ marginBottom: '0.75rem' }}>
      <div className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
        <div className="portrait lg" style={{ flexShrink: 0 }}>
          {c.identity.portrait ? <img src={api.imageUrl(c.identity.portrait, true)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserRound size={44} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0 }}>{c.identity.name || 'Sans nom'}</h1>
          <div className="muted">
            {[c.identity.species, classes || 'Sans classe', c.identity.background].filter(Boolean).join(' · ')} — niveau {totalLevel(c)}
          </div>
          <SaveState status={status} onForce={onForce} onReload={onReload} />
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
