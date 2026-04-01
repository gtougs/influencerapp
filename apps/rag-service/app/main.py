from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.core.database import get_pool, close_pool
from app.api.index import router as index_router
from app.api.chat import router as chat_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB connection pool on startup
    await get_pool()
    yield
    # Clean up on shutdown
    await close_pool()


app = FastAPI(
    title="Influencer App — RAG Service",
    description="Internal service for document indexing and AI chat",
    version="0.1.0",
    lifespan=lifespan,
    # Don't expose docs in production
    docs_url="/docs" if True else None,
)

app.include_router(index_router)
app.include_router(chat_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
