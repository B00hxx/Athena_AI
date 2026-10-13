import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent

# Load variables from the project-level .env (docker-compose passes them in directly)
load_dotenv(PROJECT_DIR / ".env")


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, default))


# --- Database & auth -------------------------------------------------------
# Docker sets DATABASE_URL; for local development it defaults to the compose db on localhost:DB_PORT
DATABASE_URL = os.getenv("DATABASE_URL") or (
    f"postgresql://athena_user:{os.getenv('DB_PASSWORD', '')}@localhost:{os.getenv('DB_PORT', '5433')}/athena_db"
)

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    print("WARNING: SECRET_KEY is not set; using a random key. Tokens will be invalidated on restart.")
    SECRET_KEY = secrets.token_urlsafe(48)

ACCESS_TOKEN_EXPIRE_MINUTES = _int("ACCESS_TOKEN_EXPIRE_MINUTES", 60)
REFRESH_TOKEN_EXPIRE_DAYS = _int("REFRESH_TOKEN_EXPIRE_DAYS", 7)

# Only needed when the frontend is served from a different origin than the API
# (the Vite dev server and the nginx container both proxy /api, so usually it isn't).
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

# --- Storage ---------------------------------------------------------------
DATA_DIR = Path(os.getenv("DATA_DIR", PROJECT_DIR / "data"))
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", DATA_DIR / "uploads"))
VECTOR_DB_PATH = Path(os.getenv("VECTOR_DB_PATH", DATA_DIR / "chroma"))
MAX_UPLOAD_MB = _int("MAX_UPLOAD_MB", 10)

# --- LLM (Ollama) ----------------------------------------------------------
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma:7b")
# How long Ollama keeps the model in memory between requests
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m")
# Context window passed to Ollama; must fit the retrieved chunks + history
OLLAMA_NUM_CTX = _int("OLLAMA_NUM_CTX", 8192)

# --- RAG pipeline ----------------------------------------------------------
# "marker" = layout-aware Markdown with OCR (accurate, heavy); "pdftext" = fast text-layer extraction
PDF_PARSER = os.getenv("PDF_PARSER", "marker").lower()
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
CHUNK_SIZE = _int("CHUNK_SIZE", 1000)
CHUNK_OVERLAP = _int("CHUNK_OVERLAP", 150)
RETRIEVAL_TOP_K = _int("RETRIEVAL_TOP_K", 5)
# Previous question/answer pairs sent with each question for follow-ups
CHAT_HISTORY_TURNS = _int("CHAT_HISTORY_TURNS", 3)
# Character budget of document text used to generate one flashcard set
FLASHCARD_CONTEXT_CHARS = _int("FLASHCARD_CONTEXT_CHARS", 12000)
