import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { enqueueIndexPlan } from '../../jobs/index-plan.job.js';
import { createIndexPlanQueue } from '../../jobs/index-plan.job.js';
import { checkUserSubscriptionTo } from '../../services/auth.service.js';

const PlanContentSchema = z.object({
  sections: z.array(z.object({
    id: z.string(),
    heading: z.string(),
    body: z.string(),
  })),
});

const CreatePlanBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum(['workout', 'diet', 'schedule', 'habit', 'mindset', 'other']),
  content: PlanContentSchema,
  coverImageUrl: z.string().url().optional(),
});

const UpdatePlanBody = CreatePlanBody.partial().extend({
  isPublished: z.boolean().optional(),
});

const planRoutes: FastifyPluginAsync = async (fastify) => {
  const indexQueue = createIndexPlanQueue(fastify.redis);

  // ---- INFLUENCER ROUTES ----

  // GET /v1/influencers/me/plans
  fastify.get('/me', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const influencerId = request.user.influencerId;
    if (!influencerId) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'No influencer profile' });

    const query = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(query.page ?? '1'));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20')));
    const offset = (page - 1) * limit;

    const plans = await fastify.db`
      SELECT id, title, description, category, cover_image_url, is_published, view_count, created_at, updated_at
      FROM plans
      WHERE influencer_id = ${influencerId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ count }] = await fastify.db`SELECT COUNT(*) FROM plans WHERE influencer_id = ${influencerId}`;

    return reply.send({ plans, total: parseInt(count), page, limit });
  });

  // POST /v1/influencers/me/plans
  fastify.post('/me', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const influencerId = request.user.influencerId;
    if (!influencerId) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'No influencer profile' });

    const body = CreatePlanBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: body.error.issues[0].message });
    }

    const { title, description, category, content, coverImageUrl } = body.data;

    const [plan] = await fastify.db`
      INSERT INTO plans (influencer_id, title, description, category, content, cover_image_url)
      VALUES (${influencerId}, ${title}, ${description ?? null}, ${category}, ${fastify.db.json(content)}, ${coverImageUrl ?? null})
      RETURNING *
    `;

    // Trigger async RAG indexing
    await enqueueIndexPlan(indexQueue, { planId: plan.id, influencerId });

    return reply.code(201).send(plan);
  });

  // GET /v1/influencers/me/plans/:id
  fastify.get('/me/:id', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const influencerId = request.user.influencerId;
    const { id } = request.params as { id: string };

    const [plan] = await fastify.db`
      SELECT * FROM plans WHERE id = ${id} AND influencer_id = ${influencerId}
    `;
    if (!plan) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Plan not found' });
    return reply.send(plan);
  });

  // PUT /v1/influencers/me/plans/:id
  fastify.put('/me/:id', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const influencerId = request.user.influencerId;
    if (!influencerId) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'No influencer profile' });

    const { id } = request.params as { id: string };
    const body = UpdatePlanBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: body.error.issues[0].message });
    }

    const existing = await fastify.db`SELECT id FROM plans WHERE id = ${id} AND influencer_id = ${influencerId}`;
    if (existing.length === 0) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Plan not found' });

    const { title, description, category, content, coverImageUrl, isPublished } = body.data;

    const [plan] = await fastify.db`
      UPDATE plans SET
        ${title !== undefined ? fastify.db`title = ${title},` : fastify.db``}
        ${description !== undefined ? fastify.db`description = ${description},` : fastify.db``}
        ${category !== undefined ? fastify.db`category = ${category},` : fastify.db``}
        ${content !== undefined ? fastify.db`content = ${fastify.db.json(content)},` : fastify.db``}
        ${coverImageUrl !== undefined ? fastify.db`cover_image_url = ${coverImageUrl},` : fastify.db``}
        ${isPublished !== undefined ? fastify.db`is_published = ${isPublished},` : fastify.db``}
        updated_at = now()
      WHERE id = ${id} AND influencer_id = ${influencerId}
      RETURNING *
    `;

    // Re-index if content changed
    if (content !== undefined) {
      await enqueueIndexPlan(indexQueue, { planId: id, influencerId });
    }

    return reply.send(plan);
  });

  // DELETE /v1/influencers/me/plans/:id
  fastify.delete('/me/:id', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const influencerId = request.user.influencerId;
    const { id } = request.params as { id: string };

    const result = await fastify.db`
      DELETE FROM plans WHERE id = ${id} AND influencer_id = ${influencerId}
    `;
    if (result.count === 0) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Plan not found' });

    return reply.code(204).send();
  });

  // ---- PUBLIC / USER ROUTES ----

  // GET /v1/plans — discovery (no subscription required)
  fastify.get('/', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(query.page ?? '1'));
    const limit = Math.min(50, parseInt(query.limit ?? '20'));
    const offset = (page - 1) * limit;
    const category = query.category;
    const influencerId = query.influencerId;

    const plans = await fastify.db`
      SELECT p.id, p.title, p.description, p.category, p.cover_image_url, p.view_count,
             p.created_at, p.influencer_id, ip.handle, a.display_name, a.avatar_url
      FROM plans p
      JOIN influencer_profiles ip ON ip.id = p.influencer_id
      JOIN accounts a ON a.id = ip.account_id
      WHERE p.is_published = true
        AND ip.is_published = true
        AND (${category ?? ''} = '' OR p.category = ${category ?? ''})
        AND (${influencerId ?? ''} = '' OR p.influencer_id = ${influencerId ?? ''})
      ORDER BY p.view_count DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ count }] = await fastify.db`
      SELECT COUNT(*) FROM plans p
      JOIN influencer_profiles ip ON ip.id = p.influencer_id
      WHERE p.is_published = true AND ip.is_published = true
        AND (${category ?? ''} = '' OR p.category = ${category ?? ''})
        AND (${influencerId ?? ''} = '' OR p.influencer_id = ${influencerId ?? ''})
    `;

    return reply.send({ plans, total: parseInt(count), page, limit });
  });

  // GET /v1/plans/:id — full plan content (subscription-gated)
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [plan] = await fastify.db`
      SELECT p.*, ip.handle, ip.id as influencer_profile_id, a.display_name
      FROM plans p
      JOIN influencer_profiles ip ON ip.id = p.influencer_id
      JOIN accounts a ON a.id = ip.account_id
      WHERE p.id = ${id} AND p.is_published = true
    `;
    if (!plan) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Plan not found' });

    // Influencer can see their own plans; users need a subscription
    if (request.user.role !== 'influencer' || request.user.influencerId !== plan.influencer_id) {
      const hasSub = await checkUserSubscriptionTo(fastify, request.user.sub, plan.influencer_id);
      if (!hasSub) {
        return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Subscription to this influencer required' });
      }
    }

    // Increment view count async (don't await)
    fastify.db`UPDATE plans SET view_count = view_count + 1 WHERE id = ${id}`.catch(() => {});

    return reply.send(plan);
  });
};

export default planRoutes;
