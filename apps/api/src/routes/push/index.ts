import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const RegisterTokenBody = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android']),
});

const pushRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/push/register — register/update push token
  fastify.post('/register', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = RegisterTokenBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: body.error.issues[0].message });
    }

    const { token, platform } = body.data;

    await fastify.db`
      INSERT INTO push_tokens (account_id, token, platform)
      VALUES (${request.user.sub}, ${token}, ${platform})
      ON CONFLICT (account_id, token) DO NOTHING
    `;

    return reply.code(204).send();
  });

  // DELETE /v1/push/token — deregister push token (e.g. on logout)
  fastify.delete('/token', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { token } = request.query as { token?: string };
    if (!token) {
      // Remove all tokens for this account
      await fastify.db`DELETE FROM push_tokens WHERE account_id = ${request.user.sub}`;
    } else {
      await fastify.db`DELETE FROM push_tokens WHERE account_id = ${request.user.sub} AND token = ${token}`;
    }
    return reply.code(204).send();
  });
};

export default pushRoutes;
