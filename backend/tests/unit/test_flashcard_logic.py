import pytest

from backend import pipeline
from backend.routers import flashcards as fc


@pytest.mark.parametrize("raw", [
    '{"flashcards": [{"question": "Q1", "answer": "A1"}, {"question": "Q2", "answer": "A2"}]}',
    '[{"question": "Q1", "answer": "A1"}, {"question": "Q2", "answer": "A2"}]',
    'Sure! ```json\n{"flashcards": [{"question": "Q1", "answer": "A1"}, {"question": "Q2", "answer": "A2"}]}\n```',
])
def test_parse_flashcards_accepts_common_llm_formats(raw):
    assert fc._parse_flashcards(raw) == [{"question": "Q1", "answer": "A1"}, {"question": "Q2", "answer": "A2"}]


def test_parse_flashcards_drops_incomplete_cards_and_trims():
    raw = '{"flashcards": [{"question": " Q1 ", "answer": " A1 "}, {"question": "no answer"}, "junk", {"answer": "x"}]}'
    assert fc._parse_flashcards(raw) == [{"question": "Q1", "answer": "A1"}]


def test_parse_flashcards_rejects_text_without_json():
    with pytest.raises(ValueError):
        fc._parse_flashcards("I could not generate flashcards, sorry.")


def _chunks(n, size=100):
    return [{"text": "x" * size, "page": i + 1, "section": None, "chunk_index": i} for i in range(n)]


def test_material_without_topic_is_spread_across_the_document(monkeypatch):
    monkeypatch.setattr(pipeline, "document_chunks", lambda doc_id: _chunks(100))
    monkeypatch.setattr(fc, "FLASHCARD_CONTEXT_CHARS", 1000)

    selected = fc._select_material("doc", topic="")

    indexes = [c["chunk_index"] for c in selected]
    assert len(indexes) == 10
    assert indexes[0] == 0 and indexes[-1] >= 85  # covers the end of the document, not just the start
    assert sum(len(c["text"]) for c in selected) <= 1000


def test_short_documents_use_every_chunk(monkeypatch):
    monkeypatch.setattr(pipeline, "document_chunks", lambda doc_id: _chunks(3))
    assert [c["chunk_index"] for c in fc._select_material("doc", topic="")] == [0, 1, 2]


def test_material_with_topic_uses_retrieval_in_reading_order(monkeypatch):
    retrieved = [_chunks(10)[i] for i in (7, 2, 5)]
    seen = {}

    def fake_retrieve(doc_id, query, k):
        seen.update(query=query, k=k)
        return retrieved

    monkeypatch.setattr(pipeline, "retrieve", fake_retrieve)

    selected = fc._select_material("doc", topic="enzymes")

    assert seen == {"query": "enzymes", "k": 20}
    assert [c["chunk_index"] for c in selected] == [2, 5, 7]


def test_material_always_includes_at_least_one_chunk(monkeypatch):
    monkeypatch.setattr(pipeline, "document_chunks", lambda doc_id: _chunks(1, size=50_000))
    assert len(fc._select_material("doc", topic="")) == 1
