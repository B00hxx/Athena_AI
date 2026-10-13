"""
End-to-end test against a running stack: real Marker, real embeddings, real Ollama model.

    make up            # or make gpu
    ATHENA_E2E_URL=http://localhost:3000/api python -m pytest backend/tests/e2e -v

Skipped unless ATHENA_E2E_URL is set. Creates a throwaway user and deletes its document afterwards.
"""
import json
import os
import time
import uuid

import httpx
import pytest

from ..helpers import LECTURE, make_pdf

BASE_URL = os.getenv("ATHENA_E2E_URL")
pytestmark = [pytest.mark.e2e, pytest.mark.skipif(not BASE_URL, reason="set ATHENA_E2E_URL to run")]


@pytest.fixture(scope="module")
def api():
    with httpx.Client(base_url=BASE_URL, timeout=600) as client:
        assert client.get("/health/ready").json()["status"] == "ok", "stack is not ready"
        email = f"e2e-{uuid.uuid4().hex[:8]}@example.com"
        tokens = client.post("/auth/signup", json={"email": email, "password": "password123"}).json()
        client.headers["Authorization"] = f"Bearer {tokens['access']}"
        yield client


@pytest.fixture(scope="module")
def document(api):
    doc = api.post("/documents", files={"file": ("lecture.pdf", make_pdf(LECTURE), "application/pdf")}).json()
    deadline = time.time() + 600
    while doc["status"] == "processing":
        assert time.time() < deadline, "ingestion timed out"
        time.sleep(2)
        doc = api.get(f"/documents/{doc['id']}").json()
    yield doc
    api.delete(f"/documents/{doc['id']}")


def test_document_is_ingested(document):
    assert document["status"] == "ready", document["error"]
    assert document["num_chunks"] >= 3


def test_question_is_answered_from_the_right_page(api, document):
    events = []
    with api.stream("POST", "/chat", json={"document_id": document["id"],
                                           "question": "Which enzyme fixes carbon dioxide, and where?"}) as response:
        assert response.status_code == 200
        events = [json.loads(line) for line in response.iter_lines() if line.strip()]

    assert events[0]["type"] == "sources"
    assert events[0]["sources"][0]["page"] == 3
    assert events[-1]["type"] == "done", events[-1]
    answer = "".join(e["content"] for e in events if e["type"] == "token")
    assert "rubisco" in answer.lower()


def test_flashcards_are_generated(api, document):
    response = api.post("/flashcards/generate", json={"document_id": document["id"], "num_cards": 5})
    assert response.status_code == 200, response.text
    cards = response.json()
    assert 1 <= len(cards) <= 5
    assert all(c["question"] and c["answer"] for c in cards)
