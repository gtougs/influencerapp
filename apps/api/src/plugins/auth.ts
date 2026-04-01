import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

export interface JwtPayload {
  sub: string;           // account id
  role: string;
  influencerId?: string; // set for influencer accounts
  iat?: number;
  exp?: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (role: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: JwtPayload;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(jwt, {
    secret: fastify.config.JWT_ACCESS_SECRET,
    sign: { expiresIn: '15m' },
  });

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' });
      }
    }
  );

  fastify.decorate(
    'requireRole',
    (role: string) =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          await request.jwtVerify();
          if (request.user.role !== role && request.user.role !== 'admin') {
            reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: `Requires role: ${role}` });
          }
        } catch {
          reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' });
        }
      }
  );
};

export default fp(authPlugin, { name: 'auth', dependencies: ['env'] });
