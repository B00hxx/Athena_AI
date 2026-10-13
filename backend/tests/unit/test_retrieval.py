"""Indexing and retrieval against a real (temporary) ChromaDB collection."""
import uuid

from backend import pipeline
from backend.pipeline import Chunk


def _index(chunks):
    document_id = str(uuid.uuid4())
    pipeline.index_document(document_id, chunks)
    return document_id


def test_retrieve_ranks_the_relevant_chunk_first():
    doc = _index([
        Chunk("Photosystem II splits water and releases oxygen.", 2, "Light Reactions"),
        Chunk("RuBisCO fixes carbon dioxide in the stroma.", 3, "Calvin Cycle"),
        Chunk("Chlorophyll absorbs blue and red light.", 1, "Pigments"),
    ])

    results = pipeline.retrieve(doc, "Which enzyme fixes carbon dioxide?", k=3)

    assert results[0]["page"] == 3
    assert results[0]["section"] == "Calvin Cycle"
    assert results[0]["score"] > results[-1]["score"]
    assert {"text", "page", "section", "chunk_index", "score"} <= results[0].keys()


def test_retrieve_only_searches_the_given_document():
    mine = _index([Chunk("Mitochondria produce ATP through respiration.", 1, "")])
    _index([Chunk("Mitochondria produce ATP through respiration, the powerhouse.", 1, "")])

    results = pipeline.retrieve(mine, "mitochondria ATP", k=10)

    assert len(results) == 1


def test_document_chunks_are_returned_in_reading_order():
    chunks = [Chunk(f"Passage number {i} of the document text.", i + 1, "") for i in range(12)]
    doc = _index(chunks)

    assert [c["chunk_index"] for c in pipeline.document_chunks(doc)] == list(range(12))


def test_reindexing_replaces_previous_chunks():
    doc = _index([Chunk("old passage about frogs and ponds", 1, "")])
    pipeline.index_document(doc, [Chunk("new passage about stars and galaxies", 1, "")])

    texts = [c["text"] for c in pipeline.document_chunks(doc)]
    assert texts == ["new passage about stars and galaxies"]


def test_delete_document_removes_its_vectors():
    doc = _index([Chunk("a passage that will be deleted soon", 1, "")])
    pipeline.delete_document(doc)
    assert pipeline.document_chunks(doc) == []


def test_section_heading_is_part_of_the_embedding_text():
    assert pipeline._embedding_text(Chunk("body", 1, "Calvin Cycle")) == "Calvin Cycle\nbody"
    assert pipeline._embedding_text(Chunk("body", 1, "")) == "body"
