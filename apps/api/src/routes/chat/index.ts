import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { checkUserSubscriptionTo } from '../../services/auth.service.js';

const CreateSessionBody = z.object({
  influencerId: z.string().uuid(),
});

const SendMessageBody = z.object({
  content: z.string().min(1).max(4000),
});

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/chat/sessions
  fastify.post('/sessions', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = CreateSessionBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: body.error.issues[0].message });
    }
    const { influencerId } = body.data;

    const hasSub = await checkUserSubscriptionTo(fastify, request.user.sub, influencerId);
    if (!hasSub && request.user.role !== 'admin') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Subscription to this influencer required' });
    }

    const [session] = await fastify.db`
      INSERT INTO chat_sessions (user_account_id, influencer_id)
      VALUES (${request.user.sub}, ${influencerId})
      RETURNING *
    `;
    return reply.code(201).send(session);
  });

  // GET /v1/chat/sessions
  fastify.get('/sessions', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const sessions = await fastify.db`
      SELECT cs.*, ip.handle, a.display_name, a.avatar_url
      FROM chat_sessions cs
      JOIN influencer_profiles ip ON ip.id = cs.influencer_id
      JOIN accounts a ON a.id = ip.account_id
      WHERE cs.user_account_id = ${request.user.sub}
      ORDER BY cs.last_message_at DESC
    `;
    return reply.send({ sessions });
  });

  // GET /v1/chat/sessions/:id/messages
  fastify.get('/sessions/:id/messages', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [session] = await fastify.db`
      SELECT * FROM chat_sessions WHERE id = ${id} AND user_account_id = ${request.user.sub}
    `;
    if (!session) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found' });

    const messages = await fastify.db`
      SELECT id, session_id, role, content, created_at
      FROM chat_messages
      WHERE session_id = ${id}
      ORDER BY created_at ASC
    `;
    return reply.send({ messages });
  });

  // POST /v1/chat/sessions/:id/messages — SSE streaming chat
  fastify.post('/sessions/:id/messages', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = SendMessageBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: body.error.issues[0].message });
    }

    const [session] = await fastify.db`
      SELECT * FROM chat_sessions WHERE id = ${id} AND user_account_id = ${request.user.sub}
    `;
    if (!session) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found' });

    // Save user message
    await fastify.db`
      INSERT INTO chat_messages (session_id, role, content)
      VALUES (${id}, 'user', ${body.data.content})
    `;
    await fastify.db`
      UPDATE chat_sessions SET last_message_at = now() WHERE id = ${id}
    `;

    // Set up SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');

    // Stream from RAG service
    let fullResponse = '';
    let retrievedChunkIds: string[] = [];

    try {
      const ragResponse = await fetch(`${fastify.config.RAG_SERVICE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': fastify.config.RAG_SERVICE_SECRET,
        },
        body: JSON.stringify({
          sessionId: id,
          influencerId: session.influencer_id,
          message: body.data.content,
        }),
      });

      if (!ragResponse.ok || !ragResponse.body) {
        reply.raw.write(`data: ${JSON.stringify({ error: 'RAG service unavailable' })}\n\n`);
        reply.raw.end();
        return;
      }

      const reader = ragResponse.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE chunks from RAG service
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                fullResponse += parsed.token;
                reply.raw.write(`data: ${JSON.stringify({ token: parsed.token })}\n\n`);
              }
              if (parsed.chunkIds) {
                retrievedChunkIds = parsed.chunkIds;
              }
            } catch {
              // not JSON, forward as-is
            }
          }
        }
      }
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
    }

    // Persist assistant message
    if (fullResponse) {
      await fastify.db`
        INSERT INTO chat_messages (session_id, role, content, retrieved_chunk_ids)
        VALUES (${id}, 'assistant', ${fullResponse}, ${retrievedChunkIds.length > 0 ? retrievedChunkIds : null})
      `;
    }

    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
  });

  // DELETE /v1/chat/sessions/:id
  fastify.delete('/sessions/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.db`DELETE FROM chat_sessions WHERE id = ${id} AND user_account_id = ${request.user.sub}`;
    return reply.code(204).send();
  });
};

export default chatRoutes;
