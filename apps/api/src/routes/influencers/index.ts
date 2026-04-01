import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { checkInfluencerSubscription } from '../../services/auth.service.js';

const UpdateProfileBody = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(2000).optional(),
  personaPrompt: z.string().max(5000).optional(),
  specialtyTags: z.array(z.string()).max(10).optional(),
  timezone: z.string().optional(),
});

const influencerRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/influencers — public list
  fastify.get('/', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(query.page ?? '1'));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20')));
    const offset = (page - 1) * limit;
    const search = query.search?.trim() ?? '';

    const rows = await fastify.db`
      SELECT
        ip.id, ip.handle, ip.bio, ip.specialty_tags, ip.follower_count, ip.is_published,
        ip.created_at, ip.updated_at,
        a.display_name, a.avatar_url
      FROM influencer_profiles ip
      JOIN accounts a ON a.id = ip.account_id
      WHERE ip.is_published = true
        AND (${search} = '' OR a.display_name ILIKE ${'%' + search + '%'} OR ip.handle ILIKE ${'%' + search + '%'})
      ORDER BY ip.follower_count DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ count }] = await fastify.db`
      SELECT COUNT(*) FROM influencer_profiles ip
      JOIN accounts a ON a.id = ip.account_id
      WHERE ip.is_published = true
        AND (${search} = '' OR a.display_name ILIKE ${'%' + search + '%'} OR ip.handle ILIKE ${'%' + search + '%'})
    `;

    return reply.send({ influencers: rows, total: parseInt(count), page, limit });
  });

  // GET /v1/influencers/me — own profile (influencer only)
  fastify.get('/me', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const [profile] = await fastify.db`
      SELECT ip.*, a.display_name, a.avatar_url, a.email, a.timezone
      FROM influencer_profiles ip
      JOIN accounts a ON a.id = ip.account_id
      WHERE ip.account_id = ${request.user.sub}
    `;
    if (!profile) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Profile not found' });
    }
    return reply.send(profile);
  });

  // PUT /v1/influencers/me — update own profile
  fastify.put('/me', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const body = UpdateProfileBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: body.error.issues[0].message });
    }

    const { displayName, bio, personaPrompt, specialtyTags, timezone } = body.data;

    if (displayName || timezone) {
      await fastify.db`
        UPDATE accounts SET
          ${displayName ? fastify.db`display_name = ${displayName},` : fastify.db``}
          ${timezone ? fastify.db`timezone = ${timezone},` : fastify.db``}
          updated_at = now()
        WHERE id = ${request.user.sub}
      `;
    }

    const [profile] = await fastify.db`
      UPDATE influencer_profiles SET
        ${bio !== undefined ? fastify.db`bio = ${bio},` : fastify.db``}
        ${personaPrompt !== undefined ? fastify.db`persona_prompt = ${personaPrompt},` : fastify.db``}
        ${specialtyTags !== undefined ? fastify.db`specialty_tags = ${specialtyTags},` : fastify.db``}
        updated_at = now()
      WHERE account_id = ${request.user.sub}
      RETURNING *
    `;

    return reply.send(profile);
  });

  // POST /v1/influencers/me/publish — toggle publication
  fastify.post('/me/publish', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const hasSubscription = await checkInfluencerSubscription(fastify, request.user.sub);
    if (!hasSubscription) {
      return reply.code(402).send({ statusCode: 402, error: 'Payment Required', message: 'Active influencer subscription required' });
    }

    const [profile] = await fastify.db`
      UPDATE influencer_profiles SET is_published = NOT is_published, updated_at = now()
      WHERE account_id = ${request.user.sub}
      RETURNING is_published
    `;
    return reply.send({ isPublished: profile.is_published });
  });

  // GET /v1/influencers/me/analytics
  fastify.get('/me/analytics', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const influencerId = request.user.influencerId;
    if (!influencerId) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'No influencer profile' });
    }

    const [subscribers] = await fastify.db`
      SELECT COUNT(*) as count FROM subscriptions
      WHERE influencer_id = ${influencerId} AND status IN ('active', 'trialing')
    `;
    const [planViews] = await fastify.db`
      SELECT COALESCE(SUM(view_count), 0) as total FROM plans WHERE influencer_id = ${influencerId}
    `;
    const [videoViews] = await fastify.db`
      SELECT COALESCE(SUM(view_count), 0) as total FROM videos WHERE influencer_id = ${influencerId}
    `;
    const [chatCount] = await fastify.db`
      SELECT COUNT(*) as count FROM chat_sessions WHERE influencer_id = ${influencerId}
    `;

    return reply.send({
      subscribers: parseInt(subscribers.count),
      planViews: parseInt(planViews.total),
      videoViews: parseInt(videoViews.total),
      chatSessions: parseInt(chatCount.count),
    });
  });

  // GET /v1/influencers/:handle — public profile
  fastify.get('/:handle', async (request, reply) => {
    const { handle } = request.params as { handle: string };
    const [profile] = await fastify.db`
      SELECT ip.id, ip.handle, ip.bio, ip.specialty_tags, ip.follower_count, ip.is_published,
             ip.created_at, ip.updated_at, a.display_name, a.avatar_url
      FROM influencer_profiles ip
      JOIN accounts a ON a.id = ip.account_id
      WHERE ip.handle = ${handle} AND ip.is_published = true
    `;
    if (!profile) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Influencer not found' });
    }
    return reply.send(profile);
  });
};

export default influencerRoutes;
