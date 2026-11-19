import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { CharacterSchema, type Character } from '../shared/schema';
import { diffCharacters } from '../shared/diff';

export type SaveStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'offline' | 'conflict' | 'error';

/** Modifications pas encore envoyées au serveur (hors ligne, page fermée…), conservées dans le navigateur. */
const localKey = (id: string) => `grimoire.pending.${id}`;
type LocalPending = { version: number; data: Character };
const local = {
  get(id: string): LocalPending | null {
    try {
      const raw = localStorage.getItem(localKey(id));
      return raw ? (JSON.parse(raw) as LocalPending) : null;
    } catch {
      return null;
    }
  },
  set(id: string, v: LocalPending) {
    try { localStorage.setItem(localKey(id), JSON.stringify(v)); } catch { /* stockage indisponible */ }
  },
  clear(id: string) {
    try { localStorage.removeItem(localKey(id)); } catch { /* stockage indisponible */ }
  },
};

/** Historique d'annulation : les modifications rapprochées d'un même champ (saisie) sont regroupées. */
const UNDO_MAX = 30;
const UNDO_COALESCE_MS = 1500;

/** Charge une fiche et l'enregistre automatiquement (debounce 800 ms, verrou optimiste, reprise hors ligne). */
export function useCharacter(id: string) {
  const [char, setChar] = useState<Character | null>(null);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ role: 'owner' | 'dm'; owner: string }>({ role: 'owner', owner: '' });
  const [history, setHistory] = useState<Character[]>([]);
  const lastPush = useRef({ at: 0, key: '' });
  const version = useRef(0);
  const pending = useRef<Character | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);

  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const schedule = (ms = 800) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), ms);
  };

  const load = useCallback(async (discardLocal = false) => {
    setStatus('loading');
    setHistory([]);
    if (discardLocal) local.clear(id);
    try {
      const doc = await api.get(id);
      version.current = doc.version;
      pending.current = null;
      setMeta({ role: doc.role ?? 'owner', owner: doc.owner ?? '' });
      setError(null);
      const saved = local.get(id);
      if (saved && JSON.stringify(saved.data) !== JSON.stringify(doc.data)) {
        const data = CharacterSchema.parse(saved.data);
        setChar(data);
        if (saved.version === doc.version) {
          // Modifications faites hors ligne sur la dernière version : on les envoie.
          pending.current = data;
          setStatus('dirty');
          schedule(50);
        } else {
          // La fiche a changé ailleurs entre-temps : l'utilisateur choisit (Recharger / Écraser).
          setStatus('conflict');
        }
        return;
      }
      local.clear(id);
      setChar(doc.data);
      setStatus('saved');
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!pending.current || inflight.current) return;
    const data = pending.current;
    pending.current = null;
    inflight.current = true;
    setStatus('saving');
    let retry = 800;
    try {
      const r = await api.save(id, version.current, data);
      version.current = r.version;
      if (!pending.current) local.clear(id);
      setStatus(pending.current ? 'dirty' : 'saved');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        local.set(id, { version: version.current, data });
        setStatus('conflict');
      } else {
        pending.current = pending.current ?? data;
        local.set(id, { version: version.current, data: pending.current });
        const offline = !(e instanceof ApiError) || !navigator.onLine;
        setStatus(offline ? 'offline' : 'error');
        setError((e as Error).message);
        retry = offline ? 5000 : 800;
      }
    } finally {
      inflight.current = false;
      if (pending.current) schedule(retry);
    }
  }, [id]);
  flushRef.current = flush;

  // Retour du réseau : on renvoie tout de suite.
  useEffect(() => {
    const h = () => { if (pending.current) schedule(50); };
    window.addEventListener('online', h);
    return () => window.removeEventListener('online', h);
  }, []);

  const commit = useCallback((next: Character) => {
    pending.current = next;
    local.set(id, { version: version.current, data: next });
    setStatus((s) => (s === 'conflict' ? s : 'dirty'));
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const update = useCallback(
    (fn: (c: Character) => Character | void) => {
      setChar((prev) => {
        if (!prev) return prev;
        const draft = structuredClone(prev);
        const res = fn(draft) ?? draft;
        const t = Date.now();
        // Clé de regroupement : champs modifiés (le journal ne suit pas tous les champs, d'où le repli).
        const key = diffCharacters(prev, res).map((x) => x.path).join('|') || (JSON.stringify(prev) === JSON.stringify(res) ? '' : '*');
        if (!key) return prev;
        if (t - lastPush.current.at > UNDO_COALESCE_MS || key !== lastPush.current.key) setHistory((h) => [...h, prev].slice(-UNDO_MAX));
        lastPush.current = { at: t, key };
        commit(res);
        return res;
      });
    },
    [commit],
  );

  /** Annule la dernière modification (ou le dernier groupe de saisies). */
  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setChar(prev);
      commit(prev);
      lastPush.current = { at: 0, key: '' };
      return h.slice(0, -1);
    });
  }, [commit]);

  const undoLabel = useMemo(() => {
    if (!char || !history.length) return null;
    const changes = diffCharacters(history[history.length - 1], char);
    if (!changes.length) return 'dernière modification';
    const c = changes[0];
    const more = changes.length > 1 ? ` (+${changes.length - 1})` : '';
    return `${c.label}${c.before || c.after ? ` ${[c.before, c.after].filter(Boolean).join(' → ')}` : ''}${more}`;
  }, [char, history]);

  /** Remplace toute la fiche (import, OCR) en la validant. */
  const replace = useCallback((c: Character) => update(() => CharacterSchema.parse(c)), [update]);

  /** Écrase la version serveur avec la version locale après un conflit. */
  const forceSave = useCallback(async () => {
    const doc = await api.get(id);
    version.current = doc.version;
    pending.current = char;
    await flush();
  }, [id, char, flush]);

  // Enregistre avant de quitter la page (et garde une copie locale si l'envoi échoue).
  useEffect(() => {
    const h = () => {
      if (pending.current) {
        local.set(id, { version: version.current, data: pending.current });
        fetch(`/api/characters/${id}`, {
          method: 'PUT',
          keepalive: true,
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: version.current, data: pending.current }),
        }).catch(() => undefined);
      }
    };
    window.addEventListener('pagehide', h);
    return () => {
      window.removeEventListener('pagehide', h);
      flush();
    };
  }, [id, flush]);

  return {
    char, status, error, update, replace, reload: () => load(true), forceSave, flush, role: meta.role, owner: meta.owner,
    undo: { label: undoLabel, run: undo },
  };
}
