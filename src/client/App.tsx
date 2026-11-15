import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes, Link } from 'react-router-dom';
import { Cog, Users, BookOpen, FileUp, LogOut, Moon, Sun, Settings } from 'lucide-react';
import { api, type User } from './api';
import { Skeleton } from './ui';
import LoginPage from './pages/Login';
import CharactersPage from './pages/Characters';
import SheetEdit from './pages/SheetEdit';
import SheetPlay from './pages/SheetPlay';
import ImportPage from './pages/Import';
import SrdPage from './pages/Srd';
import AccountPage from './pages/Account';

type AuthCtx = { user: User | null; setUser: (u: User | null) => void };
const Auth = createContext<AuthCtx>({ user: null, setUser: () => undefined });
export const useAuth = () => useContext(Auth);

function useTheme() {
  const read = () => {
    try { return (localStorage.getItem('theme') as 'light' | 'dark' | null) ?? null; } catch { return null; }
  };
  const [theme, setTheme] = useState<'light' | 'dark' | null>(read);
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    try { theme ? localStorage.setItem('theme', theme) : localStorage.removeItem('theme'); } catch { /* stockage indisponible */ }
  }, [theme]);
  const dark = theme ? theme === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return { dark, toggle: () => setTheme(dark ? 'light' : 'dark') };
}

function Layout({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const { dark, toggle } = useTheme();
  return (
    <>
      <header className="app-header no-print">
        <div className="inner">
          <Link to="/" className="brand">
            <Cog size={26} className="gear-spin" /> <span className="brand-text">Grimoire</span>
          </Link>
          {user && (
            <nav className="nav">
              <NavLink to="/" end><Users size={18} /><span className="label">Personnages</span></NavLink>
              <NavLink to="/import"><FileUp size={18} /><span className="label">Importer</span></NavLink>
              <NavLink to="/srd"><BookOpen size={18} /><span className="label">Règles SRD</span></NavLink>
              <NavLink to="/compte" title={user.username}><Settings size={18} /><span className="label">{user.username}</span></NavLink>
              <button onClick={toggle} aria-label={dark ? 'Thème clair' : 'Thème sombre'} title={dark ? 'Thème clair' : 'Thème « lampe à gaz »'}>
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button onClick={async () => { await api.logout(); setUser(null); }} aria-label="Se déconnecter" title="Se déconnecter">
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
    const h = () => setUser(null);
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
