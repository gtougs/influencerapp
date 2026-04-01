import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '../plugins/auth.js';

const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createTokenPair(
  fastify: FastifyInstance,
  payload: Omit<JwtPayload, 'iat' | 'exp'>
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = fastify.jwt.sign(payload);

  const refreshToken = uuidv4();
  const redisKey = `refresh:${payload.sub}`;
  await fastify.redis.setex(redisKey, REFRESH_TOKEN_TTL, refreshToken);

  return { accessToken, refreshToken };
}

export async function validateRefreshToken(
  fastify: FastifyInstance,
  accountId: string,
  refreshToken: string
): Promise<boolean> {
  const stored = await fastify.redis.get(`refresh:${accountId}`);
  return stored === refreshToken;
}

export async function revokeRefreshToken(
  fastify: FastifyInstance,
  accountId: string
): Promise<void> {
  await fastify.redis.del(`refresh:${accountId}`);
}

/** Cache an active influencer subscription check (5-minute TTL) */
export async function checkInfluencerSubscription(
  fastify: FastifyInstance,
  accountId: string
): Promise<boolean> {
  const cacheKey = `sub:influencer:${accountId}`;
  const cached = await fastify.redis.get(cacheKey);
  if (cached !== null) return cached === '1';

  const rows = await fastify.db`
    SELECT 1 FROM subscriptions
    WHERE account_id = ${accountId}
      AND status IN ('active', 'trialing')
      AND influencer_id IS NULL
    LIMIT 1
  `;
  const active = rows.length > 0;
  await fastify.redis.setex(cacheKey, 300, active ? '1' : '0');
  return active;
}

/** Cache a user→influencer subscription check (5-minute TTL) */
export async function checkUserSubscriptionTo(
  fastify: FastifyInstance,
  accountId: string,
  influencerId: string
): Promise<boolean> {
  const cacheKey = `sub:user:${accountId}:${influencerId}`;
  const cached = await fastify.redis.get(cacheKey);
  if (cached !== null) return cached === '1';

  const rows = await fastify.db`
    SELECT 1 FROM subscriptions
    WHERE account_id = ${accountId}
      AND influencer_id = ${influencerId}
      AND status IN ('active', 'trialing')
    LIMIT 1
  `;
  const active = rows.length > 0;
  await fastify.redis.setex(cacheKey, 300, active ? '1' : '0');
  return active;
}
