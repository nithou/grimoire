import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api, srdLang, type CharacterSummary, type SrdFull } from '../api';
import { Skeleton } from '../ui';
import { LangSwitch, SrdDetail, useSrdSearch } from '../components/SrdPicker';
import { SRD_TYPE_LABEL, srdToAttack, srdToFeature, srdToItem, srdToSpell } from '../srdToSheet';

const TYPES = ['spell', 'weapon', 'armor', 'gear', 'tool', 'magic-item', 'feat', 'rule'];

export default function SrdPage() {
  const [q, setQ] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [level, setLevel] = useState<number | ''>('');
  const [sel, setSel] = useState<string | null>(null);
  const [chars, setChars] = useState<CharacterSummary[]>([]);
  const [target, setTarget] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [lang, setLang] = useState(srdLang.get());
  const res = useSrdSearch(q, types, level, lang);

  useEffect(() => {
    api.list().then((l) => { setChars(l); if (l[0]) setTarget(l[0].id); }).catch(() => undefined);
  }, []);

  const addTo = async (e: SrdFull) => {
    if (!target) return;
    const doc = await api.get(target);
    const c = doc.data;
    let what = '';
    if (e.type === 'spell') { c.spellcasting.spells.push(srdToSpell(e)); what = 'sort'; }
    else if (e.type === 'weapon') { c.attacks.push(srdToAttack(e)); c.inventory.push(srdToItem(e)); what = 'arme (attaque + inventaire)'; }
    else if (e.type === 'feat') { c.features.push(srdToFeature(e)); what = 'don'; }
    else if (e.type === 'rule') return;
    else { c.inventory.push(srdToItem(e)); what = 'objet'; }
    await api.save(target, doc.version, c);
    setMsg(`${e.name} ajouté à ${c.identity.name} (${what}).`);
    setTimeout(() => setMsg(null), 4000);
  };

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <div className="row spread">
        <h1>Règles SRD 5.2.1</h1>
        {chars.length > 0 && (
          <label className="row small">Ajouter à
            <select style={{ width: 'auto' }} value={target} onChange={(e) => setTarget(e.target.value)}>
              {chars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="card stack">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <Search size={20} />
          <input placeholder={lang === 'fr' ? 'Rechercher un sort, une arme, un état…' : 'Search a spell, weapon, condition…'} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <LangSwitch value={lang} onChange={(l) => { setLang(l); setSel(null); }} />
        </div>
        <div className="row">
          {TYPES.map((t) => (
            <button key={t} className={`chip ${types.includes(t) ? 'on' : ''}`} onClick={() => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])}>
              {SRD_TYPE_LABEL[t]}
            </button>
          ))}
          {(types.length === 0 || types.includes('spell')) && (
            <select style={{ width: 'auto' }} value={level} onChange={(e) => setLevel(e.target.value === '' ? '' : Number(e.target.value))} aria-label="Niveau de sort">
              <option value="">Tous niveaux</option>
              <option value={0}>Sorts mineurs</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => <option key={l} value={l}>Niveau {l}</option>)}
            </select>
          )}
        </div>
      </div>
      {msg && <div className="banner">{msg}</div>}
      <div className="sheet-layout">
        <div className="card">
          {!res ? <Skeleton lines={8} /> : (
            <>
              <div className="small muted">{res.total} résultat(s)</div>
              <ul className="list">
                {res.results.map((r) => (
                  <li key={r.id}>
                    <button className={`rollable ${sel === r.id ? 'on' : ''}`} onClick={() => setSel(r.id)} style={sel === r.id ? { background: 'var(--surface-2)' } : undefined}>
                      <span className="grow">
                        {r.name} <span className="chip" style={{ marginLeft: 4 }}>{SRD_TYPE_LABEL[r.type]}</span>
                        <span className="small muted" style={{ display: 'block' }}>{r.meta}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="card" style={{ position: 'sticky', top: '4rem' }}>
          {sel ? <SrdDetail id={sel} onAdd={target ? addTo : undefined} addLabel="Ajouter à la fiche" /> : <p className="muted">Sélectionnez une entrée pour lire sa description.</p>}
        </div>
      </div>
    </div>
  );
}
