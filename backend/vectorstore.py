"""ChromaDB access. One collection holds the chunks of every document, keyed by document_id metadata."""
from functools import lru_cache

import chromadb
from chromadb.config import Settings

from .config import VECTOR_DB_PATH

COLLECTION_NAME = "document_chunks"


@lru_cache(maxsize=1)
def get_collection():
    VECTOR_DB_PATH.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(VECTOR_DB_PATH), settings=Settings(anonymized_telemetry=False))
    # Embeddings are computed by the pipeline (sentence-transformers) and normalized,
    # so Chroma needs no embedding function and cosine distance is the natural metric
    return client.get_or_create_collection(
        name=COLLECTION_NAME, metadata={"hnsw:space": "cosine"}, embedding_function=None
    )
