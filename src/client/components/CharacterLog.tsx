import { useEffect, useState } from 'react';
import { Bot, Globe, History, RefreshCw } from 'lucide-react';
import { api, type LogEntry } from '../api';
import { Skeleton } from '../ui';

const KIND: Record<string, string> = {
  create: 'Fiche créée', import: 'Fiche importée', duplicate: 'Fiche créée par duplication', trash: 'Mise à la corbeille',
  restore: 'Restaurée depuis la corbeille', share: 'Partage', unshare: 'Partage retiré', update: 'Modifications',
};

const when = (t: number) => new Date(t).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** Journal des modifications d'une fiche : qui, quand, depuis où, quoi. */
export function CharacterLog({ characterId, refreshKey }: { characterId: string; refreshKey?: unknown }) {
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api.log(characterId).then(setLog).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [characterId, refreshKey]);
  return (
    <div className="card stack">
      <div className="card-title">
        <h2><History size={18} /> Journal des modifications</h2>
        <button className="btn sm" onClick={load}><RefreshCw size={14} /> Actualiser</button>
      </div>
      {error && <div className="error">{error}</div>}
      {!log ? (
        <Skeleton lines={5} />
      ) : log.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>Aucune modification enregistrée pour l'instant.</p>
      ) : (
        <ol className="log">
          {log.map((e) => (
            <li key={e.id}>
              <div className="row spread small">
                <span className="row" style={{ gap: 6 }}>
                  <strong style={{ color: 'var(--text-strong)' }}>{e.username}</strong>
                  {e.role === 'dm' && <span className="chip on">MJ</span>}
                  <span className="chip" title={e.source === 'mcp' ? 'Via un assistant IA (MCP)' : 'Via l’interface web'}>
                    {e.source === 'mcp' ? <><Bot size={12} /> IA</> : <><Globe size={12} /> Web</>}
                  </span>
                  <span className="muted">{KIND[e.kind] ?? e.kind}</span>
                </span>
                <span className="muted" title={e.updated_at !== e.created_at ? `jusqu'à ${when(e.updated_at)}` : undefined}>{when(e.created_at)}</span>
              </div>
              {e.changes.length > 0 && (
                <ul className="log-changes">
                  {e.changes.map((c, i) => (
                    <li key={i}>
                      <span className="muted">{c.label}</span>{' '}
                      {c.before && c.after ? (
                        <><span className="log-before">{c.before}</span> → <span className="log-after">{c.after}</span></>
                      ) : (
                        <span className={c.after ? 'log-after' : 'log-before'}>{c.after || c.before}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
