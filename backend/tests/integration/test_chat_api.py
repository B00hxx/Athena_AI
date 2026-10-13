from backend import models
from backend.database import SessionLocal
from backend.routers import chat as chat_router

from ..helpers import parse_stream, signup, upload


def _ready_doc(client):
    headers = signup(client)
    return headers, upload(client, headers).json()["id"]


def _ask(client, headers, doc_id, question, **extra):
    return client.post("/chat", headers=headers, json={"document_id": doc_id, "question": question, **extra})


def test_answer_streams_sources_then_tokens_then_done(client, fake_llm):
    headers, doc_id = _ready_doc(client)

    response = _ask(client, headers, doc_id, "Which enzyme fixes carbon dioxide in the Calvin cycle?")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    events = parse_stream(response)
    assert events[0]["type"] == "sources"
    assert [e["type"] for e in events[1:-1]] == ["token"] * (len(events) - 2)
    assert events[-1]["type"] == "done"
    assert "".join(e["content"] for e in events if e["type"] == "token") == fake_llm.answer


def test_most_relevant_passage_is_retrieved_first(client):
    headers, doc_id = _ready_doc(client)

    sources = parse_stream(_ask(client, headers, doc_id, "Which enzyme fixes carbon dioxide? RuBisCO?"))[0]["sources"]

    assert sources[0]["page"] == 3
    assert "RuBisCO" in sources[0]["text"]
    assert sources[0]["score"] >= sources[-1]["score"]


def test_prompt_contains_the_retrieved_excerpts(client, fake_llm):
    headers, doc_id = _ready_doc(client)

    _ask(client, headers, doc_id, "Where does the Calvin cycle take place?")

    prompt = fake_llm.calls[-1][-1]["content"]
    assert "[1] (page 3)" in prompt
    assert "stroma" in prompt
    assert prompt.endswith("Question: Where does the Calvin cycle take place?")


def test_conversation_is_saved_with_sources(client, fake_llm):
    headers, doc_id = _ready_doc(client)
    _ask(client, headers, doc_id, "What is RuBisCO?")

    messages = client.get(f"/documents/{doc_id}/messages", headers=headers).json()

    assert [(m["role"], m["content"]) for m in messages] == [("user", "What is RuBisCO?"), ("assistant", fake_llm.answer)]
    assert messages[1]["sources"][0]["page"] in {1, 2, 3}


def test_follow_up_questions_include_previous_turns(client, fake_llm):
    headers, doc_id = _ready_doc(client)
    _ask(client, headers, doc_id, "What is RuBisCO?")
    _ask(client, headers, doc_id, "Where does it work?")

    messages = fake_llm.calls[-1]
    assert messages[0]["role"] == "system"
    assert messages[1:3] == [{"role": "user", "content": "What is RuBisCO?"},
                             {"role": "assistant", "content": fake_llm.answer}]
    # Only the current question carries the excerpts
    assert "Document excerpts" not in messages[1]["content"]
    assert "Document excerpts" in messages[-1]["content"]


def test_history_is_limited_to_recent_turns(client, fake_llm, monkeypatch):
    monkeypatch.setattr(chat_router, "CHAT_HISTORY_TURNS", 2)
    headers, doc_id = _ready_doc(client)
    for i in range(5):
        _ask(client, headers, doc_id, f"question {i}")

    history = fake_llm.calls[-1][1:-1]
    assert [m["content"] for m in history if m["role"] == "user"] == ["question 2", "question 3"]


def test_llm_failure_streams_an_error_and_saves_nothing(client, fake_llm):
    headers, doc_id = _ready_doc(client)
    fake_llm.error = ConnectionError("ollama is down")

    events = parse_stream(_ask(client, headers, doc_id, "What is RuBisCO?"))

    assert events[-1]["type"] == "error"
    assert "ollama is down" in events[-1]["detail"]
    assert client.get(f"/documents/{doc_id}/messages", headers=headers).json() == []


def test_web_results_are_streamed_and_saved_when_enabled(client, monkeypatch):
    web = [{"title": "Calvin cycle", "snippet": "Light-independent reactions", "url": "https://example.org"}]
    queries = []
    monkeypatch.setattr(chat_router, "search_web", lambda q, max_results=3: queries.append(q) or web)
    headers, doc_id = _ready_doc(client)

    events = parse_stream(_ask(client, headers, doc_id, "Calvin cycle?", enable_search=True))

    assert queries == ["Calvin cycle?"]
    assert events[0]["web"] == web
    saved = client.get(f"/documents/{doc_id}/messages", headers=headers).json()[1]["sources"]
    assert {"web": True, **web[0]} in saved


def test_web_search_is_not_called_by_default(client, monkeypatch):
    monkeypatch.setattr(chat_router, "search_web", lambda *a, **k: (_ for _ in ()).throw(AssertionError("called")))
    headers, doc_id = _ready_doc(client)
    assert parse_stream(_ask(client, headers, doc_id, "q?"))[-1]["type"] == "done"


def test_cannot_chat_with_a_document_that_is_not_ready(client):
    headers, doc_id = _ready_doc(client)
    with SessionLocal() as db:
        db.get(models.Document, doc_id).status = "processing"
        db.commit()

    response = _ask(client, headers, doc_id, "q?")

    assert response.status_code == 409
    assert "still being processed" in response.json()["detail"]


def test_cannot_chat_with_someone_elses_document(client):
    _, doc_id = _ready_doc(client)
    intruder = signup(client, "intruder@example.com")
    assert _ask(client, intruder, doc_id, "q?").status_code == 404


def test_blank_questions_are_rejected(client):
    headers, doc_id = _ready_doc(client)
    assert _ask(client, headers, doc_id, "   ").status_code == 422
