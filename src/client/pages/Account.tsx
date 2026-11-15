import { useEffect, useState } from 'react';
import { Bot, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { api, type ApiToken } from '../api';
import { useAuth } from '../App';
import { Field } from '../ui';

const fmtDate = (t: number | null) => (t ? new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais');

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

function McpTokens() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api.tokens().then(setTokens).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  const url = `${window.location.origin}/mcp`;
  const claudeCmd = `claude mcp add --transport http grimoire ${url} --header "Authorization: Bearer ${fresh ?? 'grm_…'}"`;
  const jsonCfg = JSON.stringify({ mcpServers: { grimoire: { type: 'http', url, headers: { Authorization: `Bearer ${fresh ?? 'grm_…'}` } } } }, null, 2);

  return (
    <div className="card stack">
      <h2><Bot size={18} /> Accès IA (MCP)</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Un assistant IA compatible MCP (Claude, etc.) peut lire et modifier <strong>vos</strong> fiches : consulter les stats, lancer les dés,
        appliquer des dégâts, gérer l'inventaire, chercher dans les règles. Chaque jeton donne accès à vos fiches uniquement et peut être révoqué à tout moment.
      </p>
      <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          const r = await api.createToken(name.trim() || 'Assistant IA');
          setFresh(r.token);
          setName('');
          load();
        } catch (x) {
          setError((x as Error).message);
        }
      }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du jeton (ex. Claude Desktop)" aria-label="Nom du jeton" />
        <button className="btn primary sm" type="submit"><Plus size={16} /> Créer un jeton</button>
      </form>
      {error && <div className="error">{error}</div>}
      {fresh && (
        <div className="banner stack">
          <strong>Copiez ce jeton maintenant : il ne sera plus affiché.</strong>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <code className="grow" style={{ wordBreak: 'break-all', padding: '0.35rem 0.5rem' }}>{fresh}</code>
            <button className="btn sm icon" onClick={() => copy(fresh)} aria-label="Copier le jeton" title="Copier"><Copy size={15} /></button>
          </div>
        </div>
      )}
      <div className="stack small">
        <div className="field-label">Adresse du serveur MCP</div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <code className="grow" style={{ padding: '0.35rem 0.5rem' }}>{url}</code>
          <button className="btn sm icon" onClick={() => copy(url)} aria-label="Copier l'adresse" title="Copier"><Copy size={15} /></button>
        </div>
        <div className="field-label">Claude Code</div>
        <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <pre className="grow code-block">{claudeCmd}</pre>
          <button className="btn sm icon" onClick={() => copy(claudeCmd)} aria-label="Copier la commande" title="Copier"><Copy size={15} /></button>
        </div>
        <div className="field-label">Configuration JSON (clients MCP « streamable HTTP »)</div>
        <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <pre className="grow code-block">{jsonCfg}</pre>
          <button className="btn sm icon" onClick={() => copy(jsonCfg)} aria-label="Copier la configuration" title="Copier"><Copy size={15} /></button>
        </div>
      </div>
      <table className="tbl">
        <thead><tr><th>Nom</th><th>Jeton</th><th>Créé</th><th>Dernière utilisation</th><th /></tr></thead>
        <tbody>
          {tokens.length === 0 && <tr><td colSpan={5} className="muted">Aucun jeton.</td></tr>}
          {tokens.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td><code>{t.prefix}…</code></td>
              <td className="small">{fmtDate(t.created_at)}</td>
              <td className="small">{fmtDate(t.last_used_at)}</td>
              <td style={{ textAlign: 'right' }}>
                <button className="btn sm danger" onClick={async () => {
                  if (!confirm(`Révoquer le jeton « ${t.name} » ? Les assistants qui l'utilisent perdront l'accès.`)) return;
                  await api.revokeToken(t.id);
                  load();
                }}><Trash2 size={14} /> Révoquer</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="stack" style={{ maxWidth: 860, gap: '1rem' }}>
      <h1>Mon compte</h1>
      <div className="card stack">
        <div>Connecté en tant que <strong>{user?.username}</strong>{user?.is_admin ? ' (administrateur)' : ''}.</div>
      </div>
      <McpTokens />
      <form className="card stack" style={{ maxWidth: 520 }} onSubmit={async (e) => {
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
