import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';

import envPlugin from './plugins/env.js';
import dbPlugin from './plugins/db.js';
import redisPlugin from './plugins/redis.js';
import authPlugin from './plugins/auth.js';

import authRoutes from './routes/auth/index.js';
import influencerRoutes from './routes/influencers/index.js';
import planRoutes from './routes/plans/index.js';
import videoRoutes from './routes/videos/index.js';
import chatRoutes from './routes/chat/index.js';
import workoutRoutes from './routes/workouts/index.js';
import mealRoutes from './routes/meals/index.js';
import subscriptionRoutes from './routes/subscriptions/index.js';
import stripeWebhookRoutes from './routes/webhooks/stripe.js';
import uploadRoutes from './routes/uploads/index.js';
import scheduleRoutes from './routes/schedule/index.js';
import pushRoutes from './routes/push/index.js';

import { startDailyWorkoutScheduler } from './jobs/daily-notifications.worker.js';

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
  },
});

async function build() {
  // Core plugins
  await server.register(envPlugin);
  await server.register(dbPlugin);
  await server.register(redisPlugin);
  await server.register(authPlugin);

  // Security & middleware
  await server.register(cors, {
    origin: process.env.CORS_ORIGIN ?? '*',
    credentials: true,
  });
  await server.register(helmet, { contentSecurityPolicy: false });
  await server.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    redis: server.redis,
  });

  // Stripe webhook needs raw body — register before JSON parser
  await server.register(stripeWebhookRoutes, { prefix: '/v1/webhooks' });

  // API routes
  await server.register(authRoutes, { prefix: '/v1/auth' });
  await server.register(influencerRoutes, { prefix: '/v1/influencers' });
  await server.register(planRoutes, { prefix: '/v1/plans' });
  await server.register(videoRoutes, { prefix: '/v1/videos' });
  await server.register(chatRoutes, { prefix: '/v1/chat' });
  await server.register(workoutRoutes, { prefix: '/v1/workouts' });
  await server.register(mealRoutes, { prefix: '/v1/meals' });
  await server.register(subscriptionRoutes, { prefix: '/v1/subscriptions' });
  await server.register(uploadRoutes, { prefix: '/v1/uploads' });
  await server.register(scheduleRoutes, { prefix: '/v1/schedule' });
  await server.register(pushRoutes, { prefix: '/v1/push' });

  // Health check
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return server;
}

async function start() {
  const app = await build();
  const port = parseInt(process.env.API_PORT ?? '3001');

  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`API server listening on port ${port}`);

    // Start background workers
    startDailyWorkoutScheduler(app.redis, app.db);
    app.log.info('Daily notification scheduler started');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
