"""
RAG chat service: retrieves relevant chunks, builds the prompt with persona,
and streams the GPT-4o response as SSE.
"""

import uuid
import json
from typing import AsyncGenerator
from openai import AsyncOpenAI
from app.core.config import settings
from app.core.database import get_pool
from app.services.retrieval import retrieve_chunks
from app.services.embeddings import get_openai_client


DEFAULT_PERSONA = (
    "You are a knowledgeable and supportive fitness coach. "
    "Answer questions clearly and practically. "
    "When you don't know something, say so honestly."
)


async def get_influencer_persona(influencer_id: str) -> str:
    """Fetch the influencer's persona_prompt from the database."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT ip.persona_prompt, a.display_name
            FROM influencer_profiles ip
            JOIN accounts a ON a.id = ip.account_id
            WHERE ip.id = $1
            """,
            uuid.UUID(influencer_id),
        )
    if not row:
        return DEFAULT_PERSONA

    persona = row["persona_prompt"] or ""
    name = row["display_name"] or "the coach"

    if persona:
        return (
            f"You are {name}, a fitness coach. {persona}\n\n"
            "Only use the provided knowledge context to answer questions. "
            "If a question is outside that knowledge, say so honestly and offer what general guidance you can."
        )
    return (
        f"You are {name}, a fitness coach. "
        "Answer questions about workouts, diet, and habits clearly and practically. "
        "Only use the provided knowledge context to answer questions."
    )


async def get_chat_history(session_id: str) -> list[dict]:
    """Fetch the last N messages from a chat session."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT role, content FROM chat_messages
            WHERE session_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            uuid.UUID(session_id),
            settings.chat_history_limit,
        )
    # Reverse to chronological order
    return [{"role": row["role"], "content": row["content"]} for row in reversed(rows)]


def build_system_prompt(persona: str, chunks: list[dict]) -> str:
    """Build the system prompt with persona + retrieved knowledge."""
    knowledge_blocks = "\n\n".join(
        f"[Source: {chunk['metadata'].get('plan_title', 'Unknown')} — {chunk['metadata'].get('category', '')}]\n{chunk['content']}"
        for chunk in chunks
    )

    return (
        f"{persona}\n\n"
        "--- KNOWLEDGE CONTEXT ---\n"
        f"{knowledge_blocks}\n"
        "--- END KNOWLEDGE CONTEXT ---\n\n"
        "Use ONLY the above knowledge context to answer questions. "
        "Do not make up information not present in the context. "
        "If the answer isn't in the context, say so and offer general guidance."
    )


async def stream_chat_response(
    session_id: str,
    influencer_id: str,
    user_message: str,
) -> AsyncGenerator[str, None]:
    """
    Full RAG chat pipeline, yields SSE-formatted data lines.

    Yields:
        - 'data: {"token": "..."}'  for each streamed token
        - 'data: {"chunkIds": [...]}'  once, with retrieved chunk IDs
        - 'data: [DONE]'  at the end
    """
    # 1. Retrieve relevant chunks
    chunks = await retrieve_chunks(influencer_id, user_message)
    chunk_ids = [c["id"] for c in chunks]

    # Emit chunk IDs first (client can use for transparency)
    yield f"data: {json.dumps({'chunkIds': chunk_ids})}\n\n"

    # 2. Build prompt
    persona = await get_influencer_persona(influencer_id)
    system_prompt = build_system_prompt(persona, chunks)
    history = await get_chat_history(session_id)

    messages = [
        {"role": "system", "content": system_prompt},
        *history,
        {"role": "user", "content": user_message},
    ]

    # 3. Stream GPT-4o response
    client = get_openai_client()
    stream = await client.chat.completions.create(
        model=settings.chat_model,
        messages=messages,  # type: ignore
        stream=True,
        max_tokens=1024,
        temperature=0.7,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            yield f"data: {json.dumps({'token': delta.content})}\n\n"

    yield "data: [DONE]\n\n"
