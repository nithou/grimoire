import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FileUp, Trash2, RotateCcw, Copy, Download, Pencil, UserRound, Archive } from 'lucide-react';
import { api, type CharacterSummary } from '../api';
import { Skeleton } from '../ui';

export default function CharactersPage() {
  const nav = useNavigate();
  const [list, setList] = useState<CharacterSummary[] | null>(null);
  const [trash, setTrash] = useState<CharacterSummary[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.list().then(setList).catch((e) => setError(e.message));
    api.trash().then(setTrash).catch(() => undefined);
  };
  useEffect(load, []);

  const create = async () => {
    const name = prompt('Nom du personnage ?', 'Nouveau personnage');
    if (name === null) return;
    const { id } = await api.create(undefined, name || 'Nouveau personnage');
    nav(`/c/${id}/edit`);
  };

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <div className="row spread">
        <h1>Mes personnages</h1>
        <div className="row">
          <Link className="btn" to="/import"><FileUp size={18} /> Importer</Link>
          <button className="btn primary" onClick={create}><Plus size={18} /> Nouveau personnage</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {!list ? (
        <div className="grid g3">{[0, 1, 2].map((i) => <div key={i} className="card"><Skeleton /></div>)}</div>
      ) : list.length === 0 ? (
        <div className="card brass" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
          <UserRound size={48} style={{ color: 'var(--accent)' }} />
          <h2>Aucun personnage pour l'instant</h2>
          <p className="muted">Créez une fiche vierge, importez un fichier JSON ou lisez une photo de fiche papier.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={create}><Plus size={18} /> Créer une fiche</button>
            <Link className="btn" to="/import"><FileUp size={18} /> Importer</Link>
          </div>
        </div>
      ) : (
        <div className="grid g3">
          {list.map((c, i) => (
            <div key={c.id} className="card fade-in stack" style={{ animationDelay: `${i * 60}ms` }}>
              <Link to={`/c/${c.id}`} className="char-card">
                <div className="portrait">
                  {c.portrait ? <img src={api.imageUrl(c.portrait, true)} alt="" className="portrait" style={{ border: 0 }} /> : <UserRound size={36} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{c.name}</h3>
                  <div className="small muted">{[c.species, c.classes].filter(Boolean).join(' · ') || 'Fiche vierge'}</div>
                  <div className="small mono">Niv. {c.level} · PV {c.hp}</div>
                </div>
              </Link>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Link className="btn sm" to={`/c/${c.id}/edit`} title="Éditer"><Pencil size={16} /> Éditer</Link>
                <a className="btn sm icon" href={api.exportUrl(c.id)} title="Exporter en JSON" aria-label="Exporter en JSON"><Download size={16} /></a>
                <button className="btn sm icon" title="Dupliquer" aria-label="Dupliquer" onClick={async () => { await api.duplicate(c.id); load(); }}><Copy size={16} /></button>
                <button className="btn sm icon danger" title="Mettre à la corbeille" aria-label="Mettre à la corbeille" onClick={async () => { await api.remove(c.id); load(); }}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {trash.length > 0 && (
        <div className="card">
          <button className="btn ghost sm" onClick={() => setShowTrash(!showTrash)}><Archive size={16} /> Corbeille ({trash.length})</button>
          {showTrash && (
            <ul className="list" style={{ marginTop: '0.5rem' }}>
              {trash.map((c) => (
                <li key={c.id} className="row spread">
                  <span>{c.name} <span className="muted small">{c.classes}</span></span>
                  <span className="row">
                    <button className="btn sm" onClick={async () => { await api.restore(c.id); load(); }}><RotateCcw size={16} /> Restaurer</button>
                    <button className="btn sm danger" onClick={async () => {
                      if (confirm(`Supprimer définitivement « ${c.name} » ? Cette action est irréversible.`)) { await api.purge(c.id); load(); }
                    }}><Trash2 size={16} /> Supprimer</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
