import type { Character } from '../shared/schema';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: any) {
    super(message);
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  const r = await fetch(url, init);
  const isJson = r.headers.get('content-type')?.includes('json');
  const data = isJson ? await r.json() : await r.text();
  if (!r.ok) {
    if (r.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('grimoire:unauthorized'));
    throw new ApiError(r.status, (data && (data as any).error) || `Erreur ${r.status}`, data);
  }
  return data as T;
}

export type User = { id: number; username: string; is_admin: number };
export type CharacterSummary = {
  id: string; name: string; species: string; classes: string; level: number; portrait: string | null; hp: string; updated_at: number; deleted_at: number | null;
};
export type CharacterDoc = { id: string; version: number; updated_at: number; data: Character };
export type RollEntry = { id: number; label: string; detail: string; total: number; created_at: number };
export type UploadInfo = { id: string; character_id: string | null; original_name: string; width: number; height: number; created_at: number };
export type SrdLite = { id: string; type: string; name: string; meta: string; level?: number; classes?: string[]; extra?: Record<string, string>; lang?: 'en' | 'fr' };
export type SrdFull = SrdLite & { body: string };
export type OcrCard = { title: string; description: string; usage?: { max: number; recharge: 'short' | 'long' } };
export type OcrSuggestion = { key: string; label: string; path: string; value: string | number };

export const api = {
  authConfig: () => req<{ registrationOpen: boolean }>('GET', '/api/auth/config'),
  me: () => req<{ user: User }>('GET', '/api/auth/me'),
  login: (username: string, password: string, remember: boolean) => req<{ user: User }>('POST', '/api/auth/login', { username, password, remember }),
  register: (username: string, password: string, remember: boolean) => req<{ user: User }>('POST', '/api/auth/register', { username, password, remember }),
  logout: () => req('POST', '/api/auth/logout'),
  changePassword: (current: string, next: string) => req('POST', '/api/auth/password', { current, next }),

  list: () => req<CharacterSummary[]>('GET', '/api/characters'),
  trash: () => req<CharacterSummary[]>('GET', '/api/characters/trash'),
  create: (character?: Character, name?: string) => req<{ id: string }>('POST', '/api/characters', { character, name }),
  get: (id: string) => req<CharacterDoc>('GET', `/api/characters/${id}`),
  save: (id: string, version: number, data: Character) => req<{ version: number; updated_at: number }>('PUT', `/api/characters/${id}`, { version, data }),
  remove: (id: string) => req('DELETE', `/api/characters/${id}`),
  restore: (id: string) => req('POST', `/api/characters/${id}/restore`),
  purge: (id: string) => req('DELETE', `/api/characters/${id}/purge`),
  duplicate: (id: string) => req<{ id: string }>('POST', `/api/characters/${id}/duplicate`),
  exportUrl: (id: string) => `/api/characters/${id}/export`,

  rolls: (id: string) => req<RollEntry[]>('GET', `/api/characters/${id}/rolls`),
  addRoll: (id: string, r: { label: string; detail: string; total: number }) => req<{ id: number }>('POST', `/api/characters/${id}/rolls`, r),
  clearRolls: (id: string) => req('DELETE', `/api/characters/${id}/rolls`),

  upload: (file: File, characterId?: string) => {
    const fd = new FormData();
    if (characterId) fd.append('characterId', characterId);
    fd.append('file', file);
    return req<{ id: string; width: number; height: number }>('POST', '/api/uploads', fd);
  },
  uploads: (characterId?: string) => req<UploadInfo[]>('GET', `/api/uploads${characterId ? `?characterId=${encodeURIComponent(characterId)}` : ''}`),
  attachUpload: (id: string, characterId: string | null) => req('PATCH', `/api/uploads/${id}`, { characterId }),
  deleteUpload: (id: string) => req('DELETE', `/api/uploads/${id}`),
  imageUrl: (id: string, thumb = false) => `/api/uploads/${id}${thumb ? '?thumb=1' : ''}`,
  ocrStatus: () => req<{ available: boolean }>('GET', '/api/ocr/status'),
  ocr: (id: string, force = false) => req<{ text: string; suggestions: OcrSuggestion[]; card: OcrCard | null }>('POST', `/api/uploads/${id}/ocr`, { force }),

  srdSearch: (params: { q?: string; type?: string; level?: number | ''; limit?: number; lang?: 'fr' | 'en' }) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') sp.set(k, String(v));
    return req<{ total: number; results: SrdLite[] }>('GET', `/api/srd?${sp}`);
  },
  srdEntry: (id: string) => req<SrdFull>('GET', `/api/srd/${encodeURIComponent(id)}`),
};

/** Langue préférée pour la référence SRD (français par défaut). */
export const srdLang = {
  get(): 'fr' | 'en' {
    try {
      return localStorage.getItem('grimoire.srdLang') === 'en' ? 'en' : 'fr';
    } catch {
      return 'fr';
    }
  },
  set(v: 'fr' | 'en') {
    try {
      localStorage.setItem('grimoire.srdLang', v);
    } catch {
      /* stockage indisponible */
    }
  },
};
