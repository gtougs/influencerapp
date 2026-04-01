from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/influencerapp"
    openai_api_key: str = ""
    rag_service_secret: str = ""
    redis_url: str = "redis://localhost:6379"

    # Embedding model (text-embedding-3-small = 1536 dims)
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    # Chat model
    chat_model: str = "gpt-4o"

    # RAG retrieval settings
    retrieval_top_k: int = 6
    chat_history_limit: int = 10  # last N messages to include in context

    # Chunking settings
    chunk_size: int = 512
    chunk_overlap: int = 50

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
