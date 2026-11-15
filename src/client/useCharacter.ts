import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { CharacterSchema, type Character } from '../shared/schema';

export type SaveStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';

/** Charge une fiche et l'enregistre automatiquement (debounce 800 ms, verrou optimiste). */
export function useCharacter(id: string) {
  const [char, setChar] = useState<Character | null>(null);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ role: 'owner' | 'dm'; owner: string }>({ role: 'owner', owner: '' });
  const version = useRef(0);
  const pending = useRef<Character | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const doc = await api.get(id);
      version.current = doc.version;
      pending.current = null;
      setMeta({ role: doc.role ?? 'owner', owner: doc.owner ?? '' });
      setChar(doc.data);
      setStatus('saved');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
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
    try {
      const r = await api.save(id, version.current, data);
      version.current = r.version;
      setStatus(pending.current ? 'dirty' : 'saved');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setStatus('conflict');
      } else {
        pending.current = pending.current ?? data;
        setStatus('error');
        setError((e as Error).message);
      }
    } finally {
      inflight.current = false;
      if (pending.current) timer.current = setTimeout(flush, 800);
    }
  }, [id]);

  const update = useCallback(
    (fn: (c: Character) => Character | void) => {
      setChar((prev) => {
        if (!prev) return prev;
        const draft = structuredClone(prev);
        const res = fn(draft) ?? draft;
        pending.current = res;
        return res;
      });
      setStatus((s) => (s === 'conflict' ? s : 'dirty'));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
    },
    [flush],
  );

  /** Remplace toute la fiche (import, OCR) en la validant. */
  const replace = useCallback((c: Character) => update(() => CharacterSchema.parse(c)), [update]);

  /** Écrase la version serveur avec la version locale après un conflit. */
  const forceSave = useCallback(async () => {
    const doc = await api.get(id);
    version.current = doc.version;
    pending.current = char;
    await flush();
  }, [id, char, flush]);

  // Enregistre avant de quitter la page.
  useEffect(() => {
    const h = () => {
      if (pending.current) {
        fetch(`/api/characters/${id}`, {
          method: 'PUT',
          keepalive: true,
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: version.current, data: pending.current }),
        });
      }
    };
    window.addEventListener('pagehide', h);
    return () => {
      window.removeEventListener('pagehide', h);
      flush();
    };
  }, [id, flush]);

  return { char, status, error, update, replace, reload: load, forceSave, flush, role: meta.role, owner: meta.owner };
}
