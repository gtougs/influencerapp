import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const MealItemSchema = z.object({
  foodName: z.string().min(1).max(200),
  quantityGrams: z.number().positive().optional(),
  calories: z.number().int().nonnegative().optional(),
  proteinG: z.number().nonnegative().optional(),
  carbsG: z.number().nonnegative().optional(),
  fatG: z.number().nonnegative().optional(),
});

const CreateMealBody = z.object({
  loggedAt: z.string().datetime().optional(),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(MealItemSchema).min(0),
});

const mealRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/meals
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = CreateMealBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: body.error.issues[0].message });
    }
    const { loggedAt, mealType, notes, items } = body.data;

    const [log] = await fastify.db`
      INSERT INTO meal_logs (account_id, logged_at, meal_type, notes)
      VALUES (${request.user.sub}, ${loggedAt ?? new Date().toISOString()}, ${mealType ?? null}, ${notes ?? null})
      RETURNING *
    `;

    if (items.length > 0) {
      await fastify.db`
        INSERT INTO meal_items ${fastify.db(
          items.map((i) => ({
            meal_log_id: log.id,
            food_name: i.foodName,
            quantity_grams: i.quantityGrams ?? null,
            calories: i.calories ?? null,
            protein_g: i.proteinG ?? null,
            carbs_g: i.carbsG ?? null,
            fat_g: i.fatG ?? null,
          }))
        )}
      `;
    }

    const itemRows = await fastify.db`SELECT * FROM meal_items WHERE meal_log_id = ${log.id}`;
    return reply.code(201).send({ ...log, items: itemRows });
  });

  // GET /v1/meals
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(query.page ?? '1'));
    const limit = Math.min(50, parseInt(query.limit ?? '20'));
    const offset = (page - 1) * limit;
    const from = query.from;
    const to = query.to;

    const logs = await fastify.db`
      SELECT * FROM meal_logs
      WHERE account_id = ${request.user.sub}
        AND (${from ?? ''} = '' OR logged_at >= ${from ?? ''})
        AND (${to ?? ''} = '' OR logged_at <= ${to ?? ''})
      ORDER BY logged_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const [{ count }] = await fastify.db`
      SELECT COUNT(*) FROM meal_logs
      WHERE account_id = ${request.user.sub}
        AND (${from ?? ''} = '' OR logged_at >= ${from ?? ''})
        AND (${to ?? ''} = '' OR logged_at <= ${to ?? ''})
    `;

    return reply.send({ logs, total: parseInt(count), page, limit });
  });

  // GET /v1/meals/:id
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [log] = await fastify.db`
      SELECT * FROM meal_logs WHERE id = ${id} AND account_id = ${request.user.sub}
    `;
    if (!log) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Log not found' });

    const items = await fastify.db`SELECT * FROM meal_items WHERE meal_log_id = ${id}`;
    return reply.send({ ...log, items });
  });

  // DELETE /v1/meals/:id
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await fastify.db`
      DELETE FROM meal_logs WHERE id = ${id} AND account_id = ${request.user.sub}
    `;
    if (result.count === 0) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Log not found' });
    return reply.code(204).send();
  });

  // GET /v1/meals/summary — daily macro totals
  fastify.get('/summary', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as Record<string, string>;
    const date = query.date ?? new Date().toISOString().split('T')[0];

    const [summary] = await fastify.db`
      SELECT
        COALESCE(SUM(mi.calories), 0)   AS total_calories,
        COALESCE(SUM(mi.protein_g), 0)  AS total_protein,
        COALESCE(SUM(mi.carbs_g), 0)    AS total_carbs,
        COALESCE(SUM(mi.fat_g), 0)      AS total_fat
      FROM meal_logs ml
      JOIN meal_items mi ON mi.meal_log_id = ml.id
      WHERE ml.account_id = ${request.user.sub}
        AND DATE(ml.logged_at) = ${date}
    `;

    return reply.send({
      date,
      totalCalories: parseInt(summary.total_calories),
      totalProtein: parseFloat(summary.total_protein),
      totalCarbs: parseFloat(summary.total_carbs),
      totalFat: parseFloat(summary.total_fat),
    });
  });
};

export default mealRoutes;
