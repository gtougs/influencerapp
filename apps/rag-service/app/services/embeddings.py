"""
Embedding service using OpenAI text-embedding-3-small.
Provides batched embedding for both indexing and query-time use.
"""

from openai import AsyncOpenAI
from app.core.config import settings

_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts in batches of 100. Returns list of embedding vectors."""
    if not texts:
        return []

    client = get_openai_client()
    all_embeddings: list[list[float]] = []

    # OpenAI recommends batches of <= 2048 inputs, but 100 is safe for large texts
    batch_size = 100
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        response = await client.embeddings.create(
            model=settings.embedding_model,
            input=batch,
        )
        all_embeddings.extend([item.embedding for item in response.data])

    return all_embeddings


async def embed_query(text: str) -> list[float]:
    """Embed a single query string."""
    results = await embed_texts([text])
    return results[0]
