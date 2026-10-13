"""
The RAG pipeline: PDF -> Markdown pages -> chunks -> embeddings -> ChromaDB, and back out again at question time.

    ingest:   parse_pdf() -> chunk_pages() -> index_document()
    question: retrieve()  -> build_rag_messages() -> llm
"""
import logging
import re
import threading
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from langchain_text_splitters import MarkdownTextSplitter

from .config import CHUNK_OVERLAP, CHUNK_SIZE, EMBEDDING_MODEL, PDF_PARSER
from .vectorstore import get_collection

log = logging.getLogger(__name__)

# Marker's models are large and not thread-safe; load once and serialize access
_parse_lock = threading.Lock()

# Marker's paginated output separates pages with "{<page index>}" followed by 48 dashes
_MARKER_PAGE_RE = re.compile(r"^\{(\d+)\}-{48}$", re.MULTILINE)
_HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*#*\s*$", re.MULTILINE)


@dataclass
class Chunk:
    text: str
    page: int
    section: str


# --- 1. Parse ------------------------------------------------------------------

@lru_cache(maxsize=1)
def _marker_converter():
    from marker.converters.pdf import PdfConverter
    from marker.models import create_model_dict

    log.info("Loading Marker models (first run downloads them)...")
    return PdfConverter(artifact_dict=create_model_dict(), config={"paginate_output": True})


def _parse_with_marker(path: Path) -> list[tuple[int, str]]:
    from marker.output import text_from_rendered

    with _parse_lock:
        rendered = _marker_converter()(str(path))
    markdown, _, _ = text_from_rendered(rendered)

    parts = _MARKER_PAGE_RE.split(markdown)
    # split() yields [preamble, page_idx, text, page_idx, text, ...]
    if len(parts) == 1:
        return [(1, markdown)]
    return [(int(parts[i]) + 1, parts[i + 1]) for i in range(1, len(parts) - 1, 2)]


def _parse_with_pdftext(path: Path) -> list[tuple[int, str]]:
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(str(path))
    try:
        return [(i + 1, page.get_textpage().get_text_bounded()) for i, page in enumerate(pdf)]
    finally:
        pdf.close()


def parse_pdf(path: Path) -> list[tuple[int, str]]:
    """Return [(page_number, markdown_text), ...] for a PDF."""
    if PDF_PARSER == "pdftext":
        return _parse_with_pdftext(path)
    return _parse_with_marker(path)


# --- 2. Chunk ------------------------------------------------------------------

def chunk_pages(pages: list[tuple[int, str]]) -> list[Chunk]:
    """
    Split each page into sections at its Markdown headings, then each section into overlapping
    chunks. Chunks never cross a page or section boundary, so every chunk has an exact page
    number and section title to cite. A page that starts mid-section inherits the previous heading.
    """
    splitter = MarkdownTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    chunks: list[Chunk] = []
    section = ""
    for number, page_text in pages:
        text = page_text.strip()
        blocks: list[tuple[str, str]] = []
        pos = 0
        for m in _HEADING_RE.finditer(text):
            if text[pos:m.start()].strip():
                blocks.append((section, text[pos:m.start()]))
            section, pos = m.group(1).strip("*_ "), m.start()
        blocks.append((section, text[pos:]))

        for block_section, body in blocks:
            for piece in splitter.split_text(body):
                piece = piece.strip()
                if len(piece) < 20:  # skip stray page numbers, lone headings etc.
                    continue
                chunks.append(Chunk(text=piece, page=number, section=block_section))
    return chunks


# --- 3. Embed & index ----------------------------------------------------------

@lru_cache(maxsize=1)
def _embedder():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(EMBEDDING_MODEL)


def embed(texts: list[str]) -> list[list[float]]:
    return _embedder().encode(texts, normalize_embeddings=True, batch_size=32).tolist()


def _embedding_text(chunk: Chunk) -> str:
    # Prefixing the section heading gives short chunks the context they need to be found
    return f"{chunk.section}\n{chunk.text}" if chunk.section else chunk.text


def index_document(document_id: str, chunks: list[Chunk], batch_size: int = 256) -> int:
    collection = get_collection()
    delete_document(document_id)  # re-indexing replaces any previous chunks
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start:start + batch_size]
        collection.add(
            ids=[f"{document_id}:{start + i}" for i in range(len(batch))],
            documents=[c.text for c in batch],
            embeddings=embed([_embedding_text(c) for c in batch]),
            metadatas=[
                {"document_id": document_id, "chunk_index": start + i, "page": c.page, "section": c.section}
                for i, c in enumerate(batch)
            ],
        )
    return len(chunks)


def delete_document(document_id: str) -> None:
    get_collection().delete(where={"document_id": document_id})


# --- 4. Retrieve ---------------------------------------------------------------

def _to_source(text: str, meta: dict, score: float | None = None) -> dict:
    source = {
        "text": text,
        "page": meta.get("page"),
        "section": meta.get("section") or None,
        "chunk_index": meta.get("chunk_index"),
    }
    if score is not None:
        source["score"] = round(score, 3)
    return source


def retrieve(document_id: str, query: str, k: int) -> list[dict]:
    """Top-k chunks of one document by cosine similarity to the query."""
    result = get_collection().query(
        query_embeddings=embed([query]),
        n_results=k,
        where={"document_id": document_id},
        include=["documents", "metadatas", "distances"],
    )
    return [
        _to_source(text, meta, 1 - dist)
        for text, meta, dist in zip(result["documents"][0], result["metadatas"][0], result["distances"][0])
    ]


def document_chunks(document_id: str) -> list[dict]:
    """All chunks of a document, in reading order."""
    result = get_collection().get(where={"document_id": document_id}, include=["documents", "metadatas"])
    chunks = [_to_source(text, meta) for text, meta in zip(result["documents"], result["metadatas"])]
    return sorted(chunks, key=lambda c: c["chunk_index"])


def warm_up() -> None:
    """Load the models up front so the first upload isn't slowed down by it."""
    _embedder()
    if PDF_PARSER != "pdftext":
        _marker_converter()
