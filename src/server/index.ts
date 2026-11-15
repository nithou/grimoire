import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import './db';
import { loadUser, purgeExpiredSessions } from './auth';
import authRoutes from './routes/auth';
import characterRoutes from './routes/characters';
import uploadRoutes from './routes/uploads';
import srdRoutes, { loadSrd } from './routes/srd';

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const CLIENT_DIR = resolve(process.env.CLIENT_DIR ?? './dist/client');

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  trustProxy: process.env.TRUST_PROXY === 'true',
  bodyLimit: 1024 * 1024,
});

await app.register(cookie);
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
await app.register(rateLimit, { global: false });

const PUBLIC = new Set(['/api/health', '/api/auth/config', '/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/me']);

app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/api/')) return;
  req.user = loadUser(req, reply);
  const path = req.url.split('?')[0];
  if (!req.user && !PUBLIC.has(path)) return reply.code(401).send({ error: 'Non connecté' });
});

app.get('/api/health', async () => ({ ok: true }));
await app.register(authRoutes);
await app.register(characterRoutes);
await app.register(uploadRoutes);
await app.register(srdRoutes);

if (existsSync(CLIENT_DIR)) {
  await app.register(fastifyStatic, {
    root: CLIENT_DIR,
    cacheControl: false,
    setHeaders: (res: any, path: string) => {
      // Les fichiers de /assets sont nommés par empreinte : cache long. index.html : toujours revalidé.
      const v = path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
      if (typeof res.header === 'function') res.header('Cache-Control', v);
      else res.setHeader('Cache-Control', v);
    },
  });
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0];
    if (path.startsWith('/api/') || path.startsWith('/assets/') || req.method !== 'GET') return reply.code(404).send({ error: 'Introuvable' });
    return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
  });
}

const n = loadSrd();
app.log.info(`SRD : ${n} entrées chargées`);
purgeExpiredSessions();
setInterval(purgeExpiredSessions, 6 * 3600 * 1000).unref();

await app.listen({ port: PORT, host: HOST });
