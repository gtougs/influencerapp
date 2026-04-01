import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const UpsertScheduleBody = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  videoId: z.string().uuid().optional().nullable(),
  planId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
});

const scheduleRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/schedule/me — influencer's own schedule
  fastify.get('/me', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const influencerId = request.user.influencerId;

    const rows = await fastify.db`
      SELECT ds.*, v.title AS video_title, v.cdn_url, v.thumbnail_url,
             p.title AS plan_title, p.category AS plan_category
      FROM daily_schedule ds
      LEFT JOIN videos v ON v.id = ds.video_id
      LEFT JOIN plans p ON p.id = ds.plan_id
      WHERE ds.influencer_id = ${influencerId}
      ORDER BY ds.day_of_week
    `;

    // Fill in all 7 days (even days without entries)
    const schedule = Array.from({ length: 7 }, (_, i) => {
      const entry = rows.find((r: { day_of_week: number }) => r.day_of_week === i);
      return entry ?? { day_of_week: i, day_name: DAY_NAMES[i], is_active: false };
    });

    return reply.send({ schedule });
  });

  // PUT /v1/schedule/me/:dayOfWeek — upsert a day's entry
  fastify.put('/me/:dayOfWeek', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const influencerId = request.user.influencerId;
    if (!influencerId) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'No influencer profile' });

    const dayOfWeek = parseInt((request.params as { dayOfWeek: string }).dayOfWeek);
    if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'dayOfWeek must be 0-6' });
    }

    const body = UpsertScheduleBody.safeParse({ ...(request.body as object), dayOfWeek });
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: body.error.issues[0].message });
    }

    const { title, description, videoId, planId, isActive } = body.data;

    const [entry] = await fastify.db`
      INSERT INTO daily_schedule (influencer_id, day_of_week, title, description, video_id, plan_id, is_active)
      VALUES (${influencerId}, ${dayOfWeek}, ${title}, ${description ?? null}, ${videoId ?? null}, ${planId ?? null}, ${isActive ?? true})
      ON CONFLICT (influencer_id, day_of_week) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        video_id = EXCLUDED.video_id,
        plan_id = EXCLUDED.plan_id,
        is_active = EXCLUDED.is_active,
        updated_at = now()
      RETURNING *
    `;

    return reply.send(entry);
  });

  // DELETE /v1/schedule/me/:dayOfWeek
  fastify.delete('/me/:dayOfWeek', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const influencerId = request.user.influencerId;
    const dayOfWeek = parseInt((request.params as { dayOfWeek: string }).dayOfWeek);

    await fastify.db`
      DELETE FROM daily_schedule WHERE influencer_id = ${influencerId} AND day_of_week = ${dayOfWeek}
    `;
    return reply.code(204).send();
  });

  // GET /v1/schedule/:influencerId/today — user's today schedule (subscription-gated)
  fastify.get('/:influencerId/today', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { influencerId } = request.params as { influencerId: string };

    // Get user's timezone or fall back to UTC
    const [accountRow] = await fastify.db`SELECT timezone FROM accounts WHERE id = ${request.user.sub}`;
    const tz = accountRow?.timezone ?? 'UTC';

    // Get day of week in user's timezone
    const dayOfWeek = new Date(new Date().toLocaleString('en-US', { timeZone: tz })).getDay();

    const [entry] = await fastify.db`
      SELECT ds.*, v.title AS video_title, v.cdn_url, v.thumbnail_url, v.duration_seconds,
             p.title AS plan_title, p.category AS plan_category, p.description AS plan_description
      FROM daily_schedule ds
      LEFT JOIN videos v ON v.id = ds.video_id
      LEFT JOIN plans p ON p.id = ds.plan_id
      WHERE ds.influencer_id = ${influencerId}
        AND ds.day_of_week = ${dayOfWeek}
        AND ds.is_active = true
    `;

    if (!entry) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'No workout scheduled for today' });
    }

    return reply.send({ ...entry, dayName: DAY_NAMES[dayOfWeek] });
  });
};

export default scheduleRoutes;
