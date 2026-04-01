import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { checkUserSubscriptionTo } from '../../services/auth.service.js';

const CreateVideoBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  relatedPlanId: z.string().uuid().optional(),
  contentType: z.string().regex(/^video\//),
});

function getS3Client(fastify: { config: { AWS_ACCESS_KEY_ID: string; AWS_SECRET_ACCESS_KEY: string; AWS_REGION: string } }) {
  return new S3Client({
    region: fastify.config.AWS_REGION,
    credentials: {
      accessKeyId: fastify.config.AWS_ACCESS_KEY_ID,
      secretAccessKey: fastify.config.AWS_SECRET_ACCESS_KEY,
    },
  });
}

const videoRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/videos — create record + return presigned upload URL
  fastify.post('/', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const influencerId = request.user.influencerId;
    if (!influencerId) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'No influencer profile' });

    const body = CreateVideoBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: body.error.issues[0].message });
    }

    const { title, description, relatedPlanId, contentType } = body.data;
    const ext = contentType.split('/')[1] ?? 'mp4';
    const s3Key = `videos/${influencerId}/${uuidv4()}.${ext}`;

    const [video] = await fastify.db`
      INSERT INTO videos (influencer_id, title, description, s3_key, related_plan_id)
      VALUES (${influencerId}, ${title}, ${description ?? null}, ${s3Key}, ${relatedPlanId ?? null})
      RETURNING *
    `;

    const s3 = getS3Client(fastify);
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: fastify.config.AWS_S3_BUCKET,
        Key: s3Key,
        ContentType: contentType,
      }),
      { expiresIn: 3600 }
    );

    return reply.code(201).send({ video, uploadUrl });
  });

  // GET /v1/videos — list own videos (influencer) or subscribed influencer videos (user)
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(query.page ?? '1'));
    const limit = Math.min(50, parseInt(query.limit ?? '20'));
    const offset = (page - 1) * limit;
    const influencerId = query.influencerId;

    if (request.user.role === 'influencer') {
      const myInfluencerId = request.user.influencerId;
      const videos = await fastify.db`
        SELECT * FROM videos WHERE influencer_id = ${myInfluencerId}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      const [{ count }] = await fastify.db`SELECT COUNT(*) FROM videos WHERE influencer_id = ${myInfluencerId}`;
      return reply.send({ videos, total: parseInt(count), page, limit });
    }

    // User: must be subscribed to the influencer
    if (!influencerId) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'influencerId query param required' });
    }
    const hasSub = await checkUserSubscriptionTo(fastify, request.user.sub, influencerId);
    if (!hasSub) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Subscription required' });
    }

    const videos = await fastify.db`
      SELECT id, title, description, cdn_url, thumbnail_url, duration_seconds, status, related_plan_id, view_count, created_at
      FROM videos
      WHERE influencer_id = ${influencerId} AND status = 'ready'
      ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
    `;
    const [{ count }] = await fastify.db`
      SELECT COUNT(*) FROM videos WHERE influencer_id = ${influencerId} AND status = 'ready'
    `;
    return reply.send({ videos, total: parseInt(count), page, limit });
  });

  // GET /v1/videos/:id — get video (includes signed streaming URL)
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [video] = await fastify.db`SELECT * FROM videos WHERE id = ${id}`;
    if (!video) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Video not found' });

    // Ownership check
    if (request.user.role !== 'influencer' || request.user.influencerId !== video.influencer_id) {
      const hasSub = await checkUserSubscriptionTo(fastify, request.user.sub, video.influencer_id);
      if (!hasSub) {
        return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Subscription required' });
      }
    }

    fastify.db`UPDATE videos SET view_count = view_count + 1 WHERE id = ${id}`.catch(() => {});

    const cdnUrl = video.cdn_url
      ? `https://${fastify.config.AWS_CLOUDFRONT_DOMAIN}/${video.s3_key}`
      : null;

    return reply.send({ ...video, streamUrl: cdnUrl });
  });

  // DELETE /v1/videos/:id
  fastify.delete('/:id', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const influencerId = request.user.influencerId;
    const { id } = request.params as { id: string };

    const [video] = await fastify.db`
      SELECT s3_key FROM videos WHERE id = ${id} AND influencer_id = ${influencerId}
    `;
    if (!video) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Video not found' });

    const s3 = getS3Client(fastify);
    await s3.send(new DeleteObjectCommand({ Bucket: fastify.config.AWS_S3_BUCKET, Key: video.s3_key })).catch(() => {});

    await fastify.db`DELETE FROM videos WHERE id = ${id}`;
    return reply.code(204).send();
  });
};

export default videoRoutes;
