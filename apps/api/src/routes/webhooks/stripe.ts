import { FastifyPluginAsync } from 'fastify';
import Stripe from 'stripe';

const stripeWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Raw body required for Stripe signature verification
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    done(null, body);
  });

  fastify.post('/stripe', async (request, reply) => {
    const stripe = new Stripe(fastify.config.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });
    const sig = request.headers['stripe-signature'] as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body as Buffer,
        sig,
        fastify.config.STRIPE_WEBHOOK_SECRET
      );
    } catch {
      return reply.code(400).send({ error: 'Invalid webhook signature' });
    }

    const subscription = event.data.object as Stripe.Subscription;

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const metadata = subscription.metadata as { accountId?: string; influencerId?: string; type?: string };
        const accountId = metadata.accountId
          ?? await getAccountIdFromCustomer(fastify, subscription.customer as string);

        if (!accountId) break;

        await fastify.db`
          INSERT INTO subscriptions (
            account_id, stripe_subscription_id, stripe_price_id, status,
            current_period_start, current_period_end, cancel_at_period_end, influencer_id
          )
          VALUES (
            ${accountId},
            ${subscription.id},
            ${subscription.items.data[0].price.id},
            ${subscription.status},
            ${new Date(subscription.current_period_start * 1000).toISOString()},
            ${new Date(subscription.current_period_end * 1000).toISOString()},
            ${subscription.cancel_at_period_end},
            ${metadata.influencerId ?? null}
          )
          ON CONFLICT (stripe_subscription_id) DO UPDATE SET
            status = EXCLUDED.status,
            stripe_price_id = EXCLUDED.stripe_price_id,
            current_period_start = EXCLUDED.current_period_start,
            current_period_end = EXCLUDED.current_period_end,
            cancel_at_period_end = EXCLUDED.cancel_at_period_end,
            updated_at = now()
        `;

        // Invalidate subscription cache
        await fastify.redis.del(`sub:influencer:${accountId}`);
        if (metadata.influencerId) {
          await fastify.redis.del(`sub:user:${accountId}:${metadata.influencerId}`);
          // Update follower count
          await fastify.db`
            UPDATE influencer_profiles SET
              follower_count = (
                SELECT COUNT(*) FROM subscriptions
                WHERE influencer_id = ${metadata.influencerId} AND status IN ('active', 'trialing')
              )
            WHERE id = ${metadata.influencerId}
          `;
        }
        break;
      }

      case 'customer.subscription.deleted': {
        await fastify.db`
          UPDATE subscriptions SET status = 'canceled', updated_at = now()
          WHERE stripe_subscription_id = ${subscription.id}
        `;
        // Invalidate subscription cache
        const [sub] = await fastify.db`
          SELECT account_id, influencer_id FROM subscriptions WHERE stripe_subscription_id = ${subscription.id}
        `;
        if (sub) {
          await fastify.redis.del(`sub:influencer:${sub.account_id}`);
          if (sub.influencer_id) {
            await fastify.redis.del(`sub:user:${sub.account_id}:${sub.influencer_id}`);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await fastify.db`
          UPDATE subscriptions SET status = 'past_due', updated_at = now()
          WHERE stripe_subscription_id = ${invoice.subscription}
        `;
        break;
      }
    }

    return reply.send({ received: true });
  });
};

async function getAccountIdFromCustomer(fastify: { db: any }, customerId: string): Promise<string | null> {
  const [account] = await fastify.db`
    SELECT id FROM accounts WHERE stripe_customer_id = ${customerId}
  `;
  return account?.id ?? null;
}

export default stripeWebhookRoutes;
