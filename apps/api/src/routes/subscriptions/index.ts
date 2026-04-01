import { FastifyPluginAsync } from 'fastify';
import Stripe from 'stripe';
import { z } from 'zod';

const CreateUserSubBody = z.object({
  influencerId: z.string().uuid(),
});

const subscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  const getStripe = () => new Stripe(fastify.config.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });

  async function getOrCreateCustomer(stripe: Stripe, accountId: string, email: string): Promise<string> {
    const [account] = await fastify.db`SELECT stripe_customer_id FROM accounts WHERE id = ${accountId}`;
    if (account.stripe_customer_id) return account.stripe_customer_id;

    const customer = await stripe.customers.create({ email, metadata: { accountId } });
    await fastify.db`UPDATE accounts SET stripe_customer_id = ${customer.id} WHERE id = ${accountId}`;
    return customer.id;
  }

  // POST /v1/subscriptions/influencer — start $50/mo sub
  fastify.post('/influencer', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'influencer') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Influencer accounts only' });
    }

    const [account] = await fastify.db`SELECT email FROM accounts WHERE id = ${request.user.sub}`;
    const stripe = getStripe();
    const customerId = await getOrCreateCustomer(stripe, request.user.sub, account.email);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: fastify.config.STRIPE_PRICE_INFLUENCER_MONTHLY, quantity: 1 }],
      success_url: `${process.env.WEB_URL ?? 'http://localhost:3000'}/dashboard?subscribed=1`,
      cancel_url: `${process.env.WEB_URL ?? 'http://localhost:3000'}/pricing`,
      metadata: { accountId: request.user.sub, type: 'influencer' },
    });

    return reply.send({ checkoutUrl: session.url });
  });

  // POST /v1/subscriptions/user — start $2/mo sub to an influencer
  fastify.post('/user', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = CreateUserSubBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: body.error.issues[0].message });
    }
    const { influencerId } = body.data;

    const [influencer] = await fastify.db`SELECT id FROM influencer_profiles WHERE id = ${influencerId} AND is_published = true`;
    if (!influencer) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Influencer not found' });

    const [account] = await fastify.db`SELECT email FROM accounts WHERE id = ${request.user.sub}`;
    const stripe = getStripe();
    const customerId = await getOrCreateCustomer(stripe, request.user.sub, account.email);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: fastify.config.STRIPE_PRICE_USER_MONTHLY, quantity: 1 }],
      success_url: `${process.env.MOBILE_DEEP_LINK ?? 'myapp://'}subscribed?influencerId=${influencerId}`,
      cancel_url: `${process.env.MOBILE_DEEP_LINK ?? 'myapp://'}discover`,
      metadata: { accountId: request.user.sub, influencerId, type: 'user' },
    });

    return reply.send({ checkoutUrl: session.url });
  });

  // GET /v1/subscriptions/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const subscriptions = await fastify.db`
      SELECT s.*, ip.handle, a.display_name
      FROM subscriptions s
      LEFT JOIN influencer_profiles ip ON ip.id = s.influencer_id
      LEFT JOIN accounts a ON a.id = ip.account_id
      WHERE s.account_id = ${request.user.sub}
      ORDER BY s.created_at DESC
    `;
    return reply.send({ subscriptions });
  });

  // POST /v1/subscriptions/portal — Stripe Customer Portal
  fastify.post('/portal', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const [account] = await fastify.db`SELECT stripe_customer_id FROM accounts WHERE id = ${request.user.sub}`;
    if (!account.stripe_customer_id) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'No billing account found' });
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: account.stripe_customer_id,
      return_url: `${process.env.WEB_URL ?? 'http://localhost:3000'}/dashboard/settings`,
    });

    return reply.send({ portalUrl: session.url });
  });
};

export default subscriptionRoutes;
