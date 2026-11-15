import { useEffect, useState } from 'react';
import { Dices, KeyRound, UserPlus } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../App';
import { Field } from '../ui';

export default function LoginPage() {
  const { setUser } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    api.authConfig().then((c) => setOpen(c.registrationOpen)).catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register' && password !== password2) return setError('Les mots de passe ne correspondent pas.');
    setBusy(true);
    try {
      const r = mode === 'login' ? await api.login(username, password, remember) : await api.register(username, password, remember);
      setUser(r.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '60dvh' }}>
      <form className="card brass fade-in stack" style={{ width: 'min(420px, 100%)', gap: '0.9rem', padding: '1.5rem' }} onSubmit={submit}>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Dices size={40} style={{ color: 'var(--accent)' }} />
        </div>
        <h1 style={{ textAlign: 'center' }}>{mode === 'login' ? 'Entrer dans le Grimoire' : 'Créer un compte'}</h1>
        <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>Fiches de personnage pour Donjons & Dragons 5.2</p>
        <Field label="Identifiant">
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </Field>
        <Field label="Mot de passe">
          <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : undefined} />
        </Field>
        {mode === 'register' && (
          <Field label="Confirmer le mot de passe">
            <input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
          </Field>
        )}
        <label className="row small" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Rester connecté (30 jours)
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy}>
          {mode === 'login' ? <><KeyRound size={18} /> Se connecter</> : <><UserPlus size={18} /> Créer le compte</>}
        </button>
        {open && (
          <button type="button" className="btn ghost sm" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
            {mode === 'login' ? 'Pas encore de compte ? Inscription' : 'Déjà un compte ? Connexion'}
          </button>
        )}
      </form>
    </div>
  );
}
