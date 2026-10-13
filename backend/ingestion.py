"""
Background ingestion. Parsing a PDF with Marker can take minutes, so uploads return immediately
and the work happens on a single worker thread (the models are too memory-hungry to run in parallel).
Documents left in "processing" by a restart are picked up again on startup.
"""
import logging
from concurrent.futures import ThreadPoolExecutor

from . import models, pipeline
from .config import UPLOAD_DIR
from .database import SessionLocal

log = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ingest")


def pdf_path(document_id: str):
    return UPLOAD_DIR / f"{document_id}.pdf"


def markdown_path(document_id: str):
    return UPLOAD_DIR / f"{document_id}.md"


def submit(document_id: str) -> None:
    _executor.submit(_ingest, document_id)


def _ingest(document_id: str) -> None:
    db = SessionLocal()
    try:
        doc = db.get(models.Document, document_id)
        if doc is None:
            return
        log.info("Ingesting %s (%s)", document_id, doc.filename)
        try:
            pages = pipeline.parse_pdf(pdf_path(document_id))
            markdown_path(document_id).write_text(
                "\n\n".join(f"<!-- page {n} -->\n{text}" for n, text in pages), encoding="utf-8"
            )
            chunks = pipeline.chunk_pages(pages)
            if not chunks:
                raise ValueError("No readable text found in this PDF.")
            num_chunks = pipeline.index_document(document_id, chunks)
        except Exception as e:
            log.exception("Ingestion failed for %s", document_id)
            db.rollback()
            doc = db.get(models.Document, document_id)
            if doc is not None:
                doc.status = models.Document.STATUS_FAILED
                doc.error = str(e)[:500] or e.__class__.__name__
                db.commit()
            pipeline.delete_document(document_id)
            return

        db.expire_all()
        doc = db.get(models.Document, document_id)
        if doc is None:  # deleted while we were processing it
            pipeline.delete_document(document_id)
            return
        doc.status = models.Document.STATUS_READY
        doc.num_chunks = num_chunks
        doc.error = None
        db.commit()
        log.info("Ingested %s: %d pages, %d chunks", document_id, len(pages), num_chunks)
    finally:
        db.close()


def _warm_up() -> None:
    try:
        pipeline.warm_up()
        log.info("RAG models loaded")
    except Exception:
        log.exception("Model warm-up failed; models will load on first use")


def start() -> None:
    """Warm up the models, then resume documents interrupted by a restart."""
    _executor.submit(_warm_up)
    db = SessionLocal()
    try:
        pending = db.query(models.Document.id).filter(
            models.Document.status == models.Document.STATUS_PROCESSING
        ).all()
    finally:
        db.close()
    for (document_id,) in pending:
        log.info("Resuming ingestion of %s", document_id)
        submit(document_id)


def shutdown() -> None:
    _executor.shutdown(wait=False, cancel_futures=True)
