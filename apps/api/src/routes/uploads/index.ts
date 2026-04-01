import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

const PresignBody = z.object({
  contentType: z.string(),
  filename: z.string(),
});

const uploadRoutes: FastifyPluginAsync = async (fastify) => {
  function getS3() {
    return new S3Client({
      region: fastify.config.AWS_REGION,
      credentials: {
        accessKeyId: fastify.config.AWS_ACCESS_KEY_ID,
        secretAccessKey: fastify.config.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  function presign(bucket: string, key: string, contentType: string) {
    return getSignedUrl(
      getS3(),
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: 3600 }
    );
  }

  // POST /v1/uploads/avatar-presign
  fastify.post('/avatar-presign', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = PresignBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'contentType and filename required' });

    const ext = body.data.filename.split('.').pop() ?? 'jpg';
    const key = `avatars/${request.user.sub}/${uuidv4()}.${ext}`;
    const uploadUrl = await presign(fastify.config.AWS_S3_BUCKET, key, body.data.contentType);
    const publicUrl = `https://${fastify.config.AWS_CLOUDFRONT_DOMAIN}/${key}`;

    return reply.send({ uploadUrl, key, publicUrl });
  });

  // POST /v1/uploads/video-presign
  fastify.post('/video-presign', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const body = PresignBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'contentType and filename required' });

    const ext = body.data.filename.split('.').pop() ?? 'mp4';
    const key = `videos/${request.user.influencerId}/${uuidv4()}.${ext}`;
    const uploadUrl = await presign(fastify.config.AWS_S3_BUCKET, key, body.data.contentType);
    const publicUrl = `https://${fastify.config.AWS_CLOUDFRONT_DOMAIN}/${key}`;

    return reply.send({ uploadUrl, key, publicUrl });
  });

  // POST /v1/uploads/image-presign (cover images, thumbnails)
  fastify.post('/image-presign', { preHandler: [fastify.requireRole('influencer')] }, async (request, reply) => {
    const body = PresignBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'contentType and filename required' });

    const ext = body.data.filename.split('.').pop() ?? 'jpg';
    const key = `images/${request.user.influencerId}/${uuidv4()}.${ext}`;
    const uploadUrl = await presign(fastify.config.AWS_S3_BUCKET, key, body.data.contentType);
    const publicUrl = `https://${fastify.config.AWS_CLOUDFRONT_DOMAIN}/${key}`;

    return reply.send({ uploadUrl, key, publicUrl });
  });
};

export default uploadRoutes;
