import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const ExerciseSchema = z.object({
  exerciseName: z.string().min(1).max(100),
  sets: z.number().int().positive().optional(),
  reps: z.number().int().positive().optional(),
  weightKg: z.number().positive().optional(),
  durationSecs: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
});

const CreateWorkoutBody = z.object({
  loggedAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  planId: z.string().uuid().optional(),
  exercises: z.array(ExerciseSchema).min(0),
});

const workoutRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/workouts
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = CreateWorkoutBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: body.error.issues[0].message });
    }
    const { loggedAt, notes, planId, exercises } = body.data;

    const [log] = await fastify.db`
      INSERT INTO workout_logs (account_id, logged_at, notes, plan_id)
      VALUES (${request.user.sub}, ${loggedAt ?? new Date().toISOString()}, ${notes ?? null}, ${planId ?? null})
      RETURNING *
    `;

    if (exercises.length > 0) {
      await fastify.db`
        INSERT INTO workout_exercises ${fastify.db(
          exercises.map((e) => ({
            log_id: log.id,
            exercise_name: e.exerciseName,
            sets: e.sets ?? null,
            reps: e.reps ?? null,
            weight_kg: e.weightKg ?? null,
            duration_secs: e.durationSecs ?? null,
            notes: e.notes ?? null,
          }))
        )}
      `;
    }

    const exerciseRows = await fastify.db`
      SELECT * FROM workout_exercises WHERE log_id = ${log.id} ORDER BY rowid
    `;

    return reply.code(201).send({ ...log, exercises: exerciseRows });
  });

  // GET /v1/workouts
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(query.page ?? '1'));
    const limit = Math.min(50, parseInt(query.limit ?? '20'));
    const offset = (page - 1) * limit;
    const from = query.from;
    const to = query.to;

    const logs = await fastify.db`
      SELECT * FROM workout_logs
      WHERE account_id = ${request.user.sub}
        AND (${from ?? ''} = '' OR logged_at >= ${from ?? ''})
        AND (${to ?? ''} = '' OR logged_at <= ${to ?? ''})
      ORDER BY logged_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ count }] = await fastify.db`
      SELECT COUNT(*) FROM workout_logs
      WHERE account_id = ${request.user.sub}
        AND (${from ?? ''} = '' OR logged_at >= ${from ?? ''})
        AND (${to ?? ''} = '' OR logged_at <= ${to ?? ''})
    `;

    return reply.send({ logs, total: parseInt(count), page, limit });
  });

  // GET /v1/workouts/:id
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [log] = await fastify.db`
      SELECT * FROM workout_logs WHERE id = ${id} AND account_id = ${request.user.sub}
    `;
    if (!log) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Log not found' });

    const exercises = await fastify.db`SELECT * FROM workout_exercises WHERE log_id = ${id}`;
    return reply.send({ ...log, exercises });
  });

  // DELETE /v1/workouts/:id
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await fastify.db`
      DELETE FROM workout_logs WHERE id = ${id} AND account_id = ${request.user.sub}
    `;
    if (result.count === 0) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Log not found' });
    return reply.code(204).send();
  });
};

export default workoutRoutes;
