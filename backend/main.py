import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from . import ingestion, llm
from .config import CORS_ORIGINS, UPLOAD_DIR
from .database import Base, engine
from .routers import auth, chat, documents, flashcards

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ingestion.start()
    yield
    ingestion.shutdown()


app = FastAPI(
    title="Athena AI API",
    description="Upload PDFs, chat with them through a local RAG pipeline, and study with generated flashcards.",
    version="1.0.0",
    lifespan=lifespan,
)

if CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(flashcards.router)


@app.get("/")
def read_root():
    return {"message": "Welcome to Athena AI API", "docs": "/docs"}


@app.get("/health/live", tags=["health"])
def live():
    """The process is up (used by the container healthcheck)."""
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
def ready():
    """Dependencies are reachable: database and the Ollama model."""
    checks = {}
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"
    llm_ok, llm_detail = llm.model_status()
    checks["llm"] = "ok" if llm_ok else llm_detail

    healthy = all(v == "ok" for v in checks.values())
    return JSONResponse(status_code=200 if healthy else 503, content={"status": "ok" if healthy else "degraded", **checks})
