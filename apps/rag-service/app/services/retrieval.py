"""
RAG retrieval: embed query, run pgvector ANN search filtered by influencer_id.
"""

import uuid
from app.core.database import get_pool
from app.services.embeddings import embed_query
from app.core.config import settings


async def retrieve_chunks(influencer_id: str, query: str) -> list[dict]:
    """
    Embed the query and find the top-K most semantically similar chunks
    for a specific influencer.
    """
    query_embedding = await embed_query(query)
    pool = await get_pool()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, content, metadata,
                   1 - (embedding <=> $1::vector) AS similarity
            FROM document_chunks
            WHERE influencer_id = $2
              AND status = 'indexed'
              AND embedding IS NOT NULL
            ORDER BY embedding <=> $1::vector
            LIMIT $3
            """,
            query_embedding,
            uuid.UUID(influencer_id),
            settings.retrieval_top_k,
        )

    return [
        {
            "id": str(row["id"]),
            "content": row["content"],
            "metadata": row["metadata"],
            "similarity": float(row["similarity"]),
        }
        for row in rows
    ]
