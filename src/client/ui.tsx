import { useEffect, useState, type ReactNode } from 'react';
import { X, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { uid } from '../shared/schema';
import { mdToHtml } from '../shared/markdown';

export function Field({ label, children, className = '' }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Text({ value, onChange, placeholder, list }: { value: string; onChange: (v: string) => void; placeholder?: string; list?: string }) {
  return <input value={value} placeholder={placeholder} list={list} onChange={(e) => onChange(e.target.value)} />;
}

/** Champ numérique qui tolère la saisie transitoire ("", "-"). */
export function Num({ value, onChange, min, max, step, nullable, placeholder }: {
  value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; nullable?: boolean; placeholder?: string;
}) {
  const [raw, setRaw] = useState(value == null ? '' : String(value));
  useEffect(() => {
    const parsed = raw === '' ? null : Number(raw);
    if (parsed !== value) setRaw(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      value={raw}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder ?? (nullable ? 'auto' : undefined)}
      onChange={(e) => {
        setRaw(e.target.value);
        if (e.target.value === '') {
          if (nullable) onChange(null);
          return;
        }
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => {
        if (raw === '' && !nullable) setRaw(String(value ?? 0));
      }}
    />
  );
}

export function TextArea({ value, onChange, rows = 4, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function DataList({ id, options }: { id: string; options: string[] }) {
  return (
    <datalist id={id}>
      {options.map((o) => <option key={o} value={o} />)}
    </datalist>
  );
}

export function TagInput({ value, onChange, placeholder, suggestions }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[] }) {
  const [draft, setDraft] = useState('');
  const listId = suggestions ? `dl-${placeholder ?? 'tags'}`.replace(/\W/g, '') : undefined;
  const add = () => {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setDraft('');
  };
  return (
    <div className="stack">
      <div className="row">
        {value.map((t) => (
          <span className="chip" key={t}>
            {t}
            <button className="btn ghost sm icon" style={{ minHeight: 0, padding: 0, minWidth: 0 }} aria-label={`Retirer ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
      <div className="row">
        <input className="grow" style={{ width: 'auto' }} value={draft} list={listId} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button className="btn sm" onClick={add} aria-label="Ajouter"><Plus size={16} /></button>
      </div>
      {listId && <DataList id={listId} options={suggestions!} />}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; icon?: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={t.key === value} className={t.key === value ? 'on' : ''} onClick={() => onChange(t.key)}>
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in" role="dialog" aria-modal="true">
        <header>
          <h3 className="grow" style={{ margin: 0 }}>{title}</h3>
          <button className="btn ghost icon" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </header>
        <div className="body">{children}</div>
        {footer && <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)' }} className="row spread">{footer}</div>}
      </div>
    </div>
  );
}

/** Éditeur de liste générique (ajout, suppression, réordonnancement). */
export function ListEditor<T extends { id: string }>({ items, onChange, render, make, addLabel = 'Ajouter', extraActions }: {
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, set: (patch: Partial<T>) => void, index: number) => ReactNode;
  make: () => Omit<T, 'id'>;
  addLabel?: string;
  extraActions?: ReactNode;
}) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const n = [...items];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  return (
    <div className="stack">
      {items.map((it, i) => (
        <div key={it.id} className="row" style={{ alignItems: 'flex-start', borderBottom: '1px dashed var(--border)', paddingBottom: '0.5rem' }}>
          <div className="grow">{render(it, (patch) => onChange(items.map((x) => (x.id === it.id ? { ...x, ...patch } : x))), i)}</div>
          <div className="stack" style={{ gap: 2 }}>
            <button className="btn ghost sm icon" onClick={() => move(i, -1)} aria-label="Monter"><ChevronUp size={16} /></button>
            <button className="btn ghost sm icon" onClick={() => move(i, 1)} aria-label="Descendre"><ChevronDown size={16} /></button>
            <button className="btn ghost sm icon" style={{ color: 'var(--danger)' }} onClick={() => onChange(items.filter((x) => x.id !== it.id))} aria-label="Supprimer"><Trash2 size={16} /></button>
          </div>
        </div>
      ))}
      <div className="row">
        <button className="btn sm" onClick={() => onChange([...items, { ...make(), id: uid() } as T])}><Plus size={16} /> {addLabel}</button>
        {extraActions}
      </div>
    </div>
  );
}

// ---------- Markdown ----------
export { mdToHtml };

export function Markdown({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`md ${compact ? 'compact' : ''}`} dangerouslySetInnerHTML={{ __html: mdToHtml(text) }} />;
}

/** Rappel de la syntaxe Markdown prise en charge. */
export const MD_HINT = 'Markdown : **gras**, *italique*, - liste';

/** Note affichée mise en forme, modifiable d'un clic (texte brut Markdown). */
export function MarkdownNote({ value, onChange, rows = 10, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  const [editing, setEditing] = useState(!value.trim());
  if (editing) {
    return (
      <div className="stack" style={{ gap: 4 }}>
        <textarea autoFocus={!!value} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onBlur={() => value.trim() && setEditing(false)} />
        <div className="row spread small muted">
          <span>{MD_HINT}</span>
          {value.trim() && <button className="btn sm" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing(false)}>Aperçu</button>}
        </div>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="md-note" role="button" tabIndex={0} title="Double-cliquer pour modifier" onDoubleClick={() => setEditing(true)} onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}>
        <Markdown text={value} />
      </div>
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(true)}>Modifier</button>
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack">
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - i * 12}%` }} />)}
    </div>
  );
}

export function Pips({ max, used, onChange, label }: { max: number; used: number; onChange?: (used: number) => void; label?: string }) {
  // Une pastille pleine = disponible ; vide = dépensée.
  const avail = Math.max(0, max - used);
  return (
    <span className="pips" aria-label={label}>
      {Array.from({ length: Math.max(0, Math.min(max, 30)) }, (_, i) => (
        <button
          key={i}
          type="button"
          className={`pip ${i < avail ? 'on' : ''}`}
          title={i < avail ? 'Dépenser' : 'Récupérer'}
          disabled={!onChange}
          onClick={() => onChange?.(i < avail ? used + (avail - i) : max - i - 1)}
        />
      ))}
    </span>
  );
}
