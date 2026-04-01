import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import postgres from 'postgres';

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof postgres>;
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const sql = postgres(fastify.config.DATABASE_URL, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
  });

  fastify.decorate('db', sql);

  fastify.addHook('onClose', async () => {
    await sql.end();
  });
};

export default fp(dbPlugin, { name: 'db', dependencies: ['env'] });
