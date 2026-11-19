// Service worker de Grimoire : l'application et les dernières fiches consultées restent disponibles hors ligne.
// - Interface (index.html, /assets, dés 3D, icônes) : mise en cache à l'installation puis à l'usage.
// - API en lecture : réseau d'abord, sinon dernière réponse connue.
// - Les écritures ne passent pas par ici : la fiche les garde sur l'appareil et les renvoie au retour du réseau.

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL = `grimoire-shell-${VERSION}`;
const DATA = 'grimoire-data';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const res = await fetch('/', { cache: 'no-cache' });
      if (res.ok) {
        const html = await res.clone().text();
        await cache.put('/', res);
        const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
        await cache.addAll(['/manifest.webmanifest', '/icon.svg', '/icon-180.png', '/icon-512.png', ...new Set(assets)]).catch(() => undefined);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('grimoire-shell-') && k !== SHELL) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

const offlineJson = () =>
  new Response(JSON.stringify({ error: 'Hors ligne' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

async function networkFirst(req, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || fallback();
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;

  if (p.startsWith('/api/')) {
    // Pas de cache pour l'authentification (sauf l'utilisateur courant) ni pour l'OCR.
    if (p.startsWith('/api/auth/') && p !== '/api/auth/me') return;
    // Images : identifiant immuable.
    if (/^\/api\/uploads\/[^/]+$/.test(p)) {
      event.respondWith(cacheFirst(req, DATA).catch(offlineJson));
      return;
    }
    event.respondWith(networkFirst(req, DATA, offlineJson));
    return;
  }
  if (p === '/mcp') return;

  // Navigation : l'application est une page unique, index.html sert toutes les routes.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(SHELL)).put('/', res.clone());
          return res;
        } catch {
          return (await caches.match('/')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Fichiers statiques (empreinte dans le nom ou ?v= de build) : cache d'abord.
  event.respondWith(cacheFirst(req, SHELL).catch(() => caches.match(req).then((r) => r || Response.error())));
});

// Déconnexion : effacer les données en cache.
self.addEventListener('message', (event) => {
  if (event.data === 'clear-data') event.waitUntil(caches.delete(DATA));
});
