import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createToken, listTokens, revokeToken } from '../tokens';

export default async function tokenRoutes(app: FastifyInstance) {
  app.get('/api/tokens', async (req) => listTokens(req.user!.id));

  app.post('/api/tokens', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const p = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'Nom du jeton requis' });
    return createToken(req.user!.id, p.data.name);
  });

  app.delete<{ Params: { id: string } }>('/api/tokens/:id', async (req, reply) => {
    if (!revokeToken(req.user!.id, Number(req.params.id))) return reply.code(404).send({ error: 'Jeton introuvable' });
    return { ok: true };
  });
}
