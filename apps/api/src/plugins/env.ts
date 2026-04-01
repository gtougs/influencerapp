import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    config: {
      DATABASE_URL: string;
      REDIS_URL: string;
      JWT_ACCESS_SECRET: string;
      JWT_REFRESH_SECRET: string;
      OPENAI_API_KEY: string;
      STRIPE_SECRET_KEY: string;
      STRIPE_WEBHOOK_SECRET: string;
      STRIPE_PRICE_INFLUENCER_MONTHLY: string;
      STRIPE_PRICE_USER_MONTHLY: string;
      AWS_ACCESS_KEY_ID: string;
      AWS_SECRET_ACCESS_KEY: string;
      AWS_S3_BUCKET: string;
      AWS_CLOUDFRONT_DOMAIN: string;
      AWS_REGION: string;
      RAG_SERVICE_URL: string;
      RAG_SERVICE_SECRET: string;
      RESEND_API_KEY: string;
      NODE_ENV: string;
    };
  }
}

const envPlugin: FastifyPluginAsync = async (fastify) => {
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  fastify.decorate('config', {
    DATABASE_URL: process.env.DATABASE_URL!,
    REDIS_URL: process.env.REDIS_URL!,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET!,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? '',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    STRIPE_PRICE_INFLUENCER_MONTHLY: process.env.STRIPE_PRICE_INFLUENCER_MONTHLY ?? '',
    STRIPE_PRICE_USER_MONTHLY: process.env.STRIPE_PRICE_USER_MONTHLY ?? '',
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? '',
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    AWS_S3_BUCKET: process.env.AWS_S3_BUCKET ?? '',
    AWS_CLOUDFRONT_DOMAIN: process.env.AWS_CLOUDFRONT_DOMAIN ?? '',
    AWS_REGION: process.env.AWS_REGION ?? 'us-east-1',
    RAG_SERVICE_URL: process.env.RAG_SERVICE_URL ?? 'http://localhost:8001',
    RAG_SERVICE_SECRET: process.env.RAG_SERVICE_SECRET ?? '',
    RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
    NODE_ENV: process.env.NODE_ENV ?? 'development',
  });
};

export default fp(envPlugin, { name: 'env' });
