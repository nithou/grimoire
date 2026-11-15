import { useEffect, useState } from 'react';
import { Crown, Trash2, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, type Share } from '../api';
import { useAuth } from '../App';

/** Gestion des Maîtres du Donjon d'une fiche (propriétaire), ou statut de MJ (invité). */
export function SharePanel({ characterId, role, owner }: { characterId: string; role: 'owner' | 'dm'; owner: string }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [shares, setShares] = useState<Share[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = () => api.shares(characterId).then(setShares).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [characterId]);

  if (role === 'dm') {
    return (
      <div className="card stack" style={{ maxWidth: 640 }}>
        <h2><Crown size={18} /> Maître du Donjon</h2>
        <p style={{ margin: 0 }}>Vous êtes Maître du Donjon de ce personnage, qui appartient à <strong>{owner}</strong>. Vous pouvez tout modifier ; chaque modification est inscrite au journal à votre nom.</p>
        <button className="btn danger sm" style={{ alignSelf: 'flex-start' }} onClick={async () => {
          if (!confirm('Ne plus être Maître du Donjon de ce personnage ? Vous perdrez l’accès à la fiche.')) return;
          await api.removeShare(characterId, user!.id);
          nav('/');
        }}><Trash2 size={14} /> Me retirer</button>
      </div>
    );
  }

  return (
    <div className="card stack" style={{ maxWidth: 640 }}>
      <h2><Crown size={18} /> Maîtres du Donjon</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Un Maître du Donjon peut voir et modifier toute la fiche (stats, inventaire, images, lancers), y compris via son propre accès IA (MCP).
        Il ne peut ni supprimer la fiche ni gérer les partages. Toutes ses modifications apparaissent dans le journal.
      </p>
      <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await api.addShare(characterId, name.trim());
          setName('');
          load();
        } catch (x) {
          setError((x as Error).message);
        }
      }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Identifiant du compte du MJ" aria-label="Identifiant du Maître du Donjon" />
        <button className="btn primary sm" type="submit" disabled={!name.trim()}><UserPlus size={16} /> Désigner comme MJ</button>
      </form>
      {error && <div className="error">{error}</div>}
      <ul className="list">
        {shares.length === 0 && <li className="muted small">Aucun Maître du Donjon désigné.</li>}
        {shares.map((s) => (
          <li key={s.id} className="row spread">
            <span className="row" style={{ gap: 6 }}><Crown size={15} style={{ color: 'var(--gold)' }} /> <strong>{s.username}</strong> <span className="small muted">depuis le {new Date(s.created_at).toLocaleDateString('fr-FR')}</span></span>
            <button className="btn sm danger" onClick={async () => {
              if (!confirm(`Retirer l'accès de ${s.username} à cette fiche ?`)) return;
              await api.removeShare(characterId, s.id);
              load();
            }}><Trash2 size={14} /> Retirer</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
