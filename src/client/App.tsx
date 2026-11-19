import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes, Link } from 'react-router-dom';
import { Dices, Users, BookOpen, FileUp, LogOut, Moon, Sun, Settings } from 'lucide-react';
import { api, type User } from './api';
import { Skeleton } from './ui';
import LoginPage from './pages/Login';
import CharactersPage from './pages/Characters';
import SheetEdit from './pages/SheetEdit';
import SheetPlay from './pages/SheetPlay';
import ImportPage from './pages/Import';
import SrdPage from './pages/Srd';
import AccountPage from './pages/Account';
import PartyPage from './pages/Party';

type AuthCtx = { user: User | null; setUser: (u: User | null) => void };
const Auth = createContext<AuthCtx>({ user: null, setUser: () => undefined });
export const useAuth = () => useContext(Auth);

function useTheme() {
  const read = () => {
    try { return (localStorage.getItem('theme') as 'light' | 'dark' | null) ?? null; } catch { return null; }
  };
  // Sombre par défaut (comme Foundry) ; le thème clair « parchemin » est un choix explicite.
  const [theme, setTheme] = useState<'light' | 'dark' | null>(read);
  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
    try { if (theme) localStorage.setItem('theme', theme); } catch { /* stockage indisponible */ }
  }, [theme]);
  const dark = theme !== 'light';
  return { dark, toggle: () => setTheme(dark ? 'light' : 'dark') };
}

/** Efface les fiches mises en cache pour le mode hors ligne (déconnexion). */
export function clearOfflineData() {
  navigator.serviceWorker?.controller?.postMessage('clear-data');
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

function Layout({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const { dark, toggle } = useTheme();
  const online = useOnline();
  return (
    <>
      {!online && (
        <div className="offline-banner no-print" role="status">
          Hors ligne : les fiches déjà ouvertes sur cet appareil restent consultables, les modifications seront envoyées au retour du réseau.
        </div>
      )}
      <header className="app-header no-print">
        <div className="inner">
          <Link to="/" className="brand">
            <Dices size={26} /> <span className="brand-text">Grimoire</span>
          </Link>
          {user && (
            <nav className="nav">
              <NavLink to="/" end><Users size={18} /><span className="label">Personnages</span></NavLink>
              <NavLink to="/import"><FileUp size={18} /><span className="label">Importer</span></NavLink>
              <NavLink to="/srd"><BookOpen size={18} /><span className="label">Règles SRD</span></NavLink>
              <NavLink to="/compte" title={user.username}><Settings size={18} /><span className="label">{user.username}</span></NavLink>
              <button onClick={toggle} aria-label={dark ? 'Thème clair' : 'Thème sombre'} title={dark ? 'Thème clair (parchemin)' : 'Thème sombre'}>
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button onClick={async () => { await api.logout(); clearOfflineData(); setUser(null); }} aria-label="Se déconnecter" title="Se déconnecter">
                <LogOut size={18} />
              </button>
            </nav>
          )}
        </div>
      </header>
      <main className="page">{children}</main>
      <footer className="footer no-print">
        Contenu de règles : <em>System Reference Document 5.2.1</em> de Wizards of the Coast LLC, sous licence{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>, via{' '}
        <a href="https://github.com/downfallx/dnd-5e-srd-markdown" target="_blank" rel="noreferrer">dnd-5e-srd-markdown</a>. Grimoire n'est ni affilié ni approuvé par Wizards of the Coast.
      </footer>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setReady(true));
    const h = () => { clearOfflineData(); setUser(null); };
    window.addEventListener('grimoire:unauthorized', h);
    return () => window.removeEventListener('grimoire:unauthorized', h);
  }, []);

  return (
    <Auth.Provider value={{ user, setUser }}>
      <BrowserRouter>
        <Layout>
          {!ready ? (
            <div className="card"><Skeleton lines={4} /></div>
          ) : !user ? (
            <LoginPage />
          ) : (
            <Routes>
              <Route path="/" element={<CharactersPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/srd" element={<SrdPage />} />
              <Route path="/compte" element={<AccountPage />} />
              <Route path="/table" element={<PartyPage />} />
              <Route path="/c/:id" element={<SheetPlay />} />
              <Route path="/c/:id/edit" element={<SheetEdit />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </Layout>
      </BrowserRouter>
    </Auth.Provider>
  );
}
