import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  hashPassword,
  verifyPassword,
  createTokenPair,
  validateRefreshToken,
  revokeRefreshToken,
} from '../../services/auth.service.js';

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(100),
  role: z.enum(['user', 'influencer']),
  handle: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/).optional(),
  timezone: z.string().optional(),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

const RefreshBody = z.object({
  accountId: z.string().uuid(),
  refreshToken: z.string(),
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/auth/register
  fastify.post('/register', async (request, reply) => {
    const body = RegisterBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: body.error.issues[0].message });
    }
    const { email, password, displayName, role, handle, timezone } = body.data;

    const existing = await fastify.db`
      SELECT id FROM accounts WHERE email = ${email.toLowerCase()}
    `;
    if (existing.length > 0) {
      return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Email already registered' });
    }

    const passwordHash = await hashPassword(password);

    const [account] = await fastify.db`
      INSERT INTO accounts (email, password_hash, role, display_name, timezone)
      VALUES (${email.toLowerCase()}, ${passwordHash}, ${role}, ${displayName}, ${timezone ?? 'UTC'})
      RETURNING id, email, role, display_name, avatar_url, is_email_verified, created_at, updated_at
    `;

    if (role === 'influencer') {
      if (!handle) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'handle is required for influencer registration' });
      }
      const existingHandle = await fastify.db`
        SELECT id FROM influencer_profiles WHERE handle = ${handle}
      `;
      if (existingHandle.length > 0) {
        // Rollback account creation
        await fastify.db`DELETE FROM accounts WHERE id = ${account.id}`;
        return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Handle already taken' });
      }
      await fastify.db`
        INSERT INTO influencer_profiles (account_id, handle)
        VALUES (${account.id}, ${handle})
      `;
    }

    const influencerProfile = role === 'influencer'
      ? await fastify.db`SELECT id FROM influencer_profiles WHERE account_id = ${account.id}`.then(r => r[0])
      : null;

    const tokens = await createTokenPair(fastify, {
      sub: account.id,
      role: account.role,
      ...(influencerProfile ? { influencerId: influencerProfile.id } : {}),
    });

    return reply.code(201).send({
      ...tokens,
      account: {
        id: account.id,
        email: account.email,
        role: account.role,
        displayName: account.display_name,
        avatarUrl: account.avatar_url,
        isEmailVerified: account.is_email_verified,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
      },
    });
  });

  // POST /v1/auth/login
  fastify.post('/login', async (request, reply) => {
    const body = LoginBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: body.error.issues[0].message });
    }
    const { email, password } = body.data;

    const [account] = await fastify.db`
      SELECT id, email, password_hash, role, display_name, avatar_url, is_email_verified, created_at, updated_at
      FROM accounts
      WHERE email = ${email.toLowerCase()}
    `;
    if (!account) {
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid email or password' });
    }

    const valid = await verifyPassword(password, account.password_hash);
    if (!valid) {
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid email or password' });
    }

    const influencerProfile = account.role === 'influencer'
      ? await fastify.db`SELECT id FROM influencer_profiles WHERE account_id = ${account.id}`.then(r => r[0])
      : null;

    const tokens = await createTokenPair(fastify, {
      sub: account.id,
      role: account.role,
      ...(influencerProfile ? { influencerId: influencerProfile.id } : {}),
    });

    return reply.send({
      ...tokens,
      account: {
        id: account.id,
        email: account.email,
        role: account.role,
        displayName: account.display_name,
        avatarUrl: account.avatar_url,
        isEmailVerified: account.is_email_verified,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
      },
    });
  });

  // POST /v1/auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const body = RefreshBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'accountId and refreshToken required' });
    }
    const { accountId, refreshToken } = body.data;

    const valid = await validateRefreshToken(fastify, accountId, refreshToken);
    if (!valid) {
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid refresh token' });
    }

    const [account] = await fastify.db`
      SELECT id, role FROM accounts WHERE id = ${accountId}
    `;
    if (!account) {
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Account not found' });
    }

    const influencerProfile = account.role === 'influencer'
      ? await fastify.db`SELECT id FROM influencer_profiles WHERE account_id = ${accountId}`.then(r => r[0])
      : null;

    const tokens = await createTokenPair(fastify, {
      sub: accountId,
      role: account.role,
      ...(influencerProfile ? { influencerId: influencerProfile.id } : {}),
    });

    return reply.send(tokens);
  });

  // POST /v1/auth/logout
  fastify.post('/logout', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    await revokeRefreshToken(fastify, request.user.sub);
    return reply.code(204).send();
  });

  // GET /v1/auth/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const [account] = await fastify.db`
      SELECT id, email, role, display_name, avatar_url, is_email_verified, timezone, created_at, updated_at
      FROM accounts
      WHERE id = ${request.user.sub}
    `;
    if (!account) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Account not found' });
    }

    const influencerProfile = account.role === 'influencer'
      ? await fastify.db`
          SELECT id, handle, bio, persona_prompt, specialty_tags, follower_count, is_published, created_at, updated_at
          FROM influencer_profiles
          WHERE account_id = ${account.id}
        `.then(r => r[0] ?? null)
      : null;

    const subscriptions = await fastify.db`
      SELECT id, stripe_subscription_id, stripe_price_id, status, current_period_start, current_period_end,
             cancel_at_period_end, influencer_id, created_at, updated_at
      FROM subscriptions
      WHERE account_id = ${account.id}
    `;

    return reply.send({
      account: {
        id: account.id,
        email: account.email,
        role: account.role,
        displayName: account.display_name,
        avatarUrl: account.avatar_url,
        isEmailVerified: account.is_email_verified,
        timezone: account.timezone,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
      },
      influencerProfile,
      subscriptions,
    });
  });
};

export default authRoutes;
