import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../App';
import { Field } from '../ui';

export default function AccountPage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="stack" style={{ maxWidth: 520, gap: '1rem' }}>
      <h1>Mon compte</h1>
      <div className="card stack">
        <div>Connecté en tant que <strong>{user?.username}</strong>{user?.is_admin ? ' (administrateur)' : ''}.</div>
      </div>
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.changePassword(current, next);
          setMsg({ ok: true, text: 'Mot de passe modifié.' });
          setCurrent('');
          setNext('');
        } catch (x) {
          setMsg({ ok: false, text: (x as Error).message });
        }
      }}>
        <h2><KeyRound size={18} /> Changer de mot de passe</h2>
        <Field label="Mot de passe actuel"><input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></Field>
        <Field label="Nouveau mot de passe (8 caractères min.)"><input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required /></Field>
        {msg && <div className={msg.ok ? 'small' : 'error'}>{msg.text}</div>}
        <button className="btn primary" type="submit" style={{ alignSelf: 'flex-start' }}>Enregistrer</button>
      </form>
    </div>
  );
}
