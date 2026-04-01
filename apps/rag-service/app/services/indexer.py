"""
Document indexer: fetches a plan from the DB, chunks and embeds it,
then upserts into document_chunks.
"""

import json
import uuid
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.core.config import settings
from app.core.database import get_pool
from app.services.embeddings import embed_texts


def plan_content_to_text(content: dict) -> str:
    """
    Serialize structured JSONB plan content to labelled plain text.
    Each section becomes a clearly labelled block, improving retrieval quality.

    Input:  {"sections": [{"id": "...", "heading": "Workout Plan", "body": "Monday: squat..."}]}
    Output: "[SECTION: Workout Plan]\nMonday: squat...\n\n[SECTION: Diet Guidelines]\n..."
    """
    sections = content.get("sections", [])
    parts: list[str] = []
    for section in sections:
        heading = section.get("heading", "")
        body = section.get("body", "")
        if heading:
            parts.append(f"[SECTION: {heading}]\n{body}")
        else:
            parts.append(body)
    return "\n\n".join(parts)


async def index_plan(plan_id: str, influencer_id: str) -> None:
    """
    Full re-index of a plan:
    1. Fetch plan from DB
    2. Convert JSONB to labelled text
    3. Chunk with RecursiveCharacterTextSplitter
    4. Delete existing chunks for this plan
    5. Embed in batches
    6. Insert new chunks
    """
    pool = await get_pool()

    async with pool.acquire() as conn:
        # 1. Fetch plan
        plan = await conn.fetchrow(
            "SELECT id, title, category, content FROM plans WHERE id = $1 AND influencer_id = $2",
            uuid.UUID(plan_id),
            uuid.UUID(influencer_id),
        )
        if not plan:
            raise ValueError(f"Plan {plan_id} not found for influencer {influencer_id}")

        content = json.loads(plan["content"]) if isinstance(plan["content"], str) else plan["content"]
        raw_text = plan_content_to_text(content)

        if not raw_text.strip():
            # Nothing to index; just clear existing chunks
            await conn.execute(
                "DELETE FROM document_chunks WHERE plan_id = $1",
                uuid.UUID(plan_id),
            )
            return

        # 2. Chunk
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
            length_function=len,
        )
        chunks = splitter.split_text(raw_text)

        # 3. Delete old chunks
        await conn.execute(
            "DELETE FROM document_chunks WHERE plan_id = $1",
            uuid.UUID(plan_id),
        )

        # 4. Embed
        embeddings = await embed_texts(chunks)

        # 5. Insert new chunks
        records = [
            (
                uuid.uuid4(),                     # id
                uuid.UUID(influencer_id),         # influencer_id
                uuid.UUID(plan_id),               # plan_id
                idx,                              # chunk_index
                chunk,                            # content
                embeddings[idx],                  # embedding (vector)
                json.dumps({                      # metadata
                    "plan_title": plan["title"],
                    "category": plan["category"],
                    "chunk_index": idx,
                }),
                "indexed",                        # status
            )
            for idx, chunk in enumerate(chunks)
        ]

        await conn.executemany(
            """
            INSERT INTO document_chunks
                (id, influencer_id, plan_id, chunk_index, content, embedding, metadata, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
            records,
        )

        print(f"Indexed plan {plan_id}: {len(chunks)} chunks")
