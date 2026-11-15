import { useEffect, useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { api, srdLang, type SrdFull, type SrdLite } from '../api';
import { Markdown, Modal, Skeleton } from '../ui';
import { SRD_TYPE_LABEL } from '../srdToSheet';

export function LangSwitch({ value, onChange }: { value: 'fr' | 'en'; onChange: (v: 'fr' | 'en') => void }) {
  return (
    <div className="mode-switch" role="radiogroup" aria-label="Langue des règles">
      {(['fr', 'en'] as const).map((l) => (
        <button key={l} role="radio" aria-checked={value === l} className={value === l ? 'on' : ''} onClick={() => { srdLang.set(l); onChange(l); }}>
          {l === 'fr' ? 'FR' : 'EN'}
        </button>
      ))}
    </div>
  );
}

export function useSrdSearch(q: string, types: string[], level: number | '', lang: 'fr' | 'en' = 'fr') {
  const [res, setRes] = useState<{ total: number; results: SrdLite[] } | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api.srdSearch({ q, type: types.join(','), level, limit: 60, lang }).then((r) => alive && setRes(r)).catch(() => alive && setRes({ total: 0, results: [] }));
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, types.join(','), level, lang]);
  return res;
}

export function SrdDetail({ id, onAdd, addLabel }: { id: string; onAdd?: (e: SrdFull) => void; addLabel?: string }) {
  const [e, setE] = useState<SrdFull | null>(null);
  useEffect(() => {
    setE(null);
    api.srdEntry(id).then(setE).catch(() => undefined);
  }, [id]);
  if (!e) return <Skeleton lines={5} />;
  return (
    <div className="stack fade-in">
      <div className="row spread">
        <div>
          <h3 style={{ margin: 0 }}>{e.name}</h3>
          <div className="small muted"><em>{e.meta}</em> · {SRD_TYPE_LABEL[e.type] ?? e.type}</div>
        </div>
        {onAdd && <button className="btn primary sm" onClick={() => onAdd(e)}><Plus size={16} /> {addLabel ?? 'Ajouter'}</button>}
      </div>
      <Markdown text={e.body} />
      <div className="small muted">{e.lang === 'fr' ? 'Document de Référence du Système 5.2.1 (version française), CC BY 4.0.' : 'Texte original du SRD 5.2.1 (anglais), CC BY 4.0.'}</div>
    </div>
  );
}

/** Fenêtre de recherche dans le SRD pour ajouter une entrée à la fiche. */
export function SrdPicker({ title, types, onPick, onClose, addLabel }: { title: string; types: string[]; onPick: (e: SrdFull) => void; onClose: () => void; addLabel?: string }) {
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<number | ''>('');
  const [sel, setSel] = useState<string | null>(null);
  const [lang, setLang] = useState(srdLang.get());
  const res = useSrdSearch(q, types, level, lang);
  const [added, setAdded] = useState<string[]>([]);
  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">
        <div className="row">
          <div className="row grow" style={{ flexWrap: 'nowrap' }}>
            <Search size={18} />
            <input autoFocus placeholder={lang === 'fr' ? 'Rechercher (Boule de feu, Épée longue…)' : 'Search (Fireball, Longsword…)'} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <LangSwitch value={lang} onChange={setLang} />
          {types.includes('spell') && (
            <select style={{ width: 'auto' }} value={level} onChange={(e) => setLevel(e.target.value === '' ? '' : Number(e.target.value))} aria-label="Niveau">
              <option value="">Tous niveaux</option>
              <option value={0}>Sorts mineurs</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => <option key={l} value={l}>Niveau {l}</option>)}
            </select>
          )}
        </div>
        {sel ? (
          <>
            <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSel(null)}>← Retour aux résultats</button>
            <SrdDetail id={sel} addLabel={addLabel} onAdd={(e) => { onPick(e); setAdded((a) => [...a, e.id]); setSel(null); }} />
          </>
        ) : !res ? (
          <Skeleton lines={6} />
        ) : (
          <ul className="list">
            {res.results.length === 0 && <li className="muted">Aucun résultat.</li>}
            {res.results.map((r) => (
              <li key={r.id} className="row spread" style={{ flexWrap: 'nowrap' }}>
                <button className="rollable grow" onClick={() => setSel(r.id)}>
                  <span className="grow" style={{ minWidth: 0 }}>
                    {r.name}
                    <span className="small muted" style={{ display: 'block' }}>{r.meta}</span>
                  </span>
                </button>
                <button className="btn sm" disabled={added.includes(r.id)} onClick={async () => { const e = await api.srdEntry(r.id); onPick(e); setAdded((a) => [...a, r.id]); }}>
                  {added.includes(r.id) ? 'Ajouté' : <><Plus size={16} /> {addLabel ?? 'Ajouter'}</>}
                </button>
              </li>
            ))}
            {res.total > res.results.length && <li className="small muted">{res.total - res.results.length} autres résultats : affinez la recherche.</li>}
          </ul>
        )}
      </div>
    </Modal>
  );
}
