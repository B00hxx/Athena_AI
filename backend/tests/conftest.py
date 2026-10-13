"""
Shared fixtures. The app runs for real (FastAPI, SQLAlchemy, ChromaDB, pdftext parsing, background
ingestion); only the two model-backed pieces are faked so tests are fast and deterministic:
  - the sentence-transformers embedder -> FakeEmbedder (hashed bag-of-words)
  - the Ollama LLM -> FakeLLM (canned answers, records the prompts it receives)
"""
import os
import re
import tempfile

# Configure the app before any backend module is imported (config is read at import time)
_TMP = tempfile.mkdtemp(prefix="athena-tests-")
os.environ.update({
    "DATABASE_URL": f"sqlite:///{_TMP}/test.db",
    "DATA_DIR": _TMP,
    "SECRET_KEY": "test-secret-key-not-for-production-0123456789",
    "PDF_PARSER": "pdftext",
    "OLLAMA_MODEL": "test-model",
    "CORS_ORIGINS": "",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend import ingestion, llm, pipeline  # noqa: E402
from backend.database import Base, engine  # noqa: E402
from backend.main import app  # noqa: E402

from .helpers import FakeEmbedder  # noqa: E402


class FakeLLM:
    def __init__(self):
        self.answer = "RuBisCO fixes carbon dioxide in the stroma [1]."
        self.completion = (
            '{"flashcards": [{"question": "Where does the Calvin cycle happen?", "answer": "In the stroma."},'
            ' {"question": "Which enzyme fixes CO2?", "answer": "RuBisCO."},'
            ' {"question": "What does photosystem II split?", "answer": "Water."}]}'
        )
        self.error: Exception | None = None
        self.calls: list[list[dict]] = []

    def stream(self, messages, temperature=0.3):
        self.calls.append(messages)
        if self.error:
            raise self.error
        yield from re.findall(r"\S+\s*", self.answer)

    def complete(self, messages, temperature=0.3, format=None):
        self.calls.append(messages)
        if self.error:
            raise self.error
        return self.completion


@pytest.fixture(autouse=True)
def fake_embedder(monkeypatch):
    monkeypatch.setattr(pipeline, "_embedder", lambda: FakeEmbedder())


@pytest.fixture
def fake_llm(monkeypatch):
    fake = FakeLLM()
    monkeypatch.setattr(llm, "stream", fake.stream)
    monkeypatch.setattr(llm, "complete", fake.complete)
    monkeypatch.setattr(llm, "model_status", lambda: (True, "test-model"))
    return fake


@pytest.fixture
def sync_ingestion(monkeypatch):
    """Run ingestion inline instead of on the worker thread, so uploads are 'ready' on return."""
    monkeypatch.setattr(ingestion, "submit", ingestion._ingest)


@pytest.fixture
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


@pytest.fixture
def client(fresh_db, fake_llm, sync_ingestion):
    with TestClient(app) as c:
        yield c
