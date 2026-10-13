"""
Background ingestion. Parsing a PDF with Marker can take minutes, so uploads return immediately
and documents are processed one at a time, in upload order, on a worker thread.

With Marker, each PDF is parsed in a short-lived child process. That lets us:
  - cancel a document that is deleted mid-parse (kill the process) instead of blocking the queue,
  - enforce a time limit, and survive parser crashes / out-of-memory kills,
  - release Marker's GPU memory as soon as a document is done, so the LLM can use it.

Documents left in "processing" by a restart are picked up again on startup.
"""
import logging
import multiprocessing
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable

from . import llm, models, pipeline
from .config import FREE_GPU_FOR_INGESTION, INGEST_TIMEOUT_MINUTES, UPLOAD_DIR
from .database import SessionLocal

log = logging.getLogger(__name__)

_executor: ThreadPoolExecutor | None = None
_lock = threading.Lock()
_queue: list[str] = []  # documents waiting or in progress, in order; index 0 is being processed
_cancelled: set[str] = set()
_running: dict[str, multiprocessing.Process] = {}
_mp = multiprocessing.get_context("spawn")  # CUDA can't be used in forked processes


class IngestionCancelled(Exception):
    pass


def _get_executor() -> ThreadPoolExecutor:
    # Created lazily (and again after shutdown) so the app can be started more than once per process
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ingest")
    return _executor


def pdf_path(document_id: str):
    return UPLOAD_DIR / f"{document_id}.pdf"


def markdown_path(document_id: str):
    return UPLOAD_DIR / f"{document_id}.md"


# --- Queue -------------------------------------------------------------------

def submit(document_id: str) -> None:
    with _lock:
        if document_id in _queue:
            return
        _queue.append(document_id)
        _cancelled.discard(document_id)
    _get_executor().submit(_ingest, document_id)


def queue_position(document_id: str) -> int | None:
    """0 = being processed now, n = n documents ahead of it, None = not queued."""
    with _lock:
        return _queue.index(document_id) if document_id in _queue else None


def cancel(document_id: str) -> None:
    """Stop processing a document (called when it is deleted)."""
    with _lock:
        if document_id not in _queue:
            return
        if _queue.index(document_id) > 0:  # still waiting: just drop it from the line
            _queue.remove(document_id)
        _cancelled.add(document_id)
        process = _running.get(document_id)
    if process is not None and process.is_alive():
        log.info("Cancelling ingestion of %s", document_id)
        process.kill()


# --- Isolated parsing --------------------------------------------------------

def _parse_child(path: str, conn) -> None:
    """Entry point of the parser process."""
    try:
        conn.send(("ok", pipeline.parse_pdf(Path(path))))
    except BaseException as e:  # noqa: BLE001 - report everything to the parent
        conn.send(("error", f"{e.__class__.__name__}: {e}"))
    finally:
        conn.close()


def parse_isolated(document_id: str, path: Path, timeout_s: float,
                   target: Callable = _parse_child) -> list[tuple[int, str]]:
    """Run the parser in a child process that can be killed on cancel or timeout."""
    receiver, sender = _mp.Pipe(duplex=False)
    process = _mp.Process(target=target, args=(str(path), sender), name=f"parse-{document_id[:8]}")
    process.start()
    sender.close()
    with _lock:
        _running[document_id] = process
    def died() -> Exception:
        if document_id in _cancelled:
            return IngestionCancelled()
        process.join(timeout=5)
        return RuntimeError(
            f"The PDF parser stopped unexpectedly (exit code {process.exitcode}); "
            "the document may be too large for the available memory."
        )

    try:
        deadline = time.monotonic() + timeout_s
        while not receiver.poll(0.5):
            if document_id in _cancelled:
                raise IngestionCancelled()
            if not process.is_alive():
                raise died()
            if time.monotonic() > deadline:
                raise TimeoutError(f"Parsing took longer than {timeout_s / 60:.0f} minutes and was stopped.")
        try:
            status, payload = receiver.recv()
        except EOFError:  # the process exited (or was killed) without sending a result
            raise died()
        if status != "ok":
            raise RuntimeError(payload)
        return payload
    finally:
        with _lock:
            _running.pop(document_id, None)
        if process.is_alive():
            process.kill()
        process.join(timeout=10)
        receiver.close()


def _parse(document_id: str) -> list[tuple[int, str]]:
    if pipeline.PDF_PARSER == "pdftext":  # fast and light: no need for a separate process
        return pipeline.parse_pdf(pdf_path(document_id))
    if FREE_GPU_FOR_INGESTION:
        llm.unload()  # give Marker the whole GPU; the LLM reloads on the next question
    return parse_isolated(document_id, pdf_path(document_id), INGEST_TIMEOUT_MINUTES * 60)


# --- Worker ------------------------------------------------------------------

def _ingest(document_id: str) -> None:
    db = SessionLocal()
    try:
        doc = db.get(models.Document, document_id)
        if doc is None or document_id in _cancelled:
            return
        log.info("Ingesting %s (%s)", document_id, doc.filename)
        started = time.monotonic()
        try:
            pages = _parse(document_id)
            markdown_path(document_id).write_text(
                "\n\n".join(f"<!-- page {n} -->\n{text}" for n, text in pages), encoding="utf-8"
            )
            chunks = pipeline.chunk_pages(pages)
            if not chunks:
                raise ValueError("No readable text found in this PDF.")
            num_chunks = pipeline.index_document(document_id, chunks)
        except IngestionCancelled:
            log.info("Ingestion of %s cancelled", document_id)
            pipeline.delete_document(document_id)
            return
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
        log.info("Ingested %s: %d pages, %d chunks in %.1fs",
                 document_id, len(pages), num_chunks, time.monotonic() - started)
    finally:
        db.close()
        with _lock:
            if document_id in _queue:
                _queue.remove(document_id)
            _cancelled.discard(document_id)


# --- Lifecycle ---------------------------------------------------------------

def _prefetch_child(path: str, conn) -> None:
    """Download Marker's models (first run) without keeping them in the API process."""
    try:
        pipeline.prefetch_marker_models()
        conn.send(("ok", []))
    except BaseException as e:  # noqa: BLE001
        conn.send(("error", f"{e.__class__.__name__}: {e}"))
    finally:
        conn.close()


def _warm_up() -> None:
    try:
        pipeline.warm_up()
        if pipeline.PDF_PARSER != "pdftext":
            parse_isolated("warm-up", Path(), timeout_s=3600, target=_prefetch_child)
        log.info("RAG models ready")
    except Exception:
        log.exception("Model warm-up failed; models will load on first use")


def start() -> None:
    """Warm up the models, then resume documents interrupted by a restart."""
    _get_executor().submit(_warm_up)
    db = SessionLocal()
    try:
        pending = db.query(models.Document.id).filter(
            models.Document.status == models.Document.STATUS_PROCESSING
        ).order_by(models.Document.created_at).all()
    finally:
        db.close()
    for (document_id,) in pending:
        log.info("Resuming ingestion of %s", document_id)
        submit(document_id)


def shutdown() -> None:
    global _executor
    with _lock:
        processes = list(_running.values())
        _queue.clear()
    for process in processes:
        process.kill()
    if _executor is not None:
        _executor.shutdown(wait=False, cancel_futures=True)
        _executor = None
