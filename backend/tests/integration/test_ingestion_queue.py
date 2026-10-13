"""The ingestion queue: isolated parser processes, cancellation on delete, timeouts, queue positions."""
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import ingestion, pipeline
from backend.main import app

from ..helpers import LECTURE, make_pdf, signup, upload


# Child-process targets must be importable module-level functions (spawn pickles them by name)
def slow_child(path, conn):
    time.sleep(60)


def crashing_child(path, conn):
    import os
    os._exit(3)


def failing_child(path, conn):
    conn.send(("error", "ValueError: broken PDF"))
    conn.close()


def test_isolated_parse_returns_pages_from_a_real_child_process(tmp_path):
    pdf = tmp_path / "lecture.pdf"
    pdf.write_bytes(make_pdf(LECTURE))

    pages = ingestion.parse_isolated("doc", pdf, timeout_s=60)

    assert [n for n, _ in pages] == [1, 2, 3]
    assert "RuBisCO" in pages[2][1]


def test_isolated_parse_times_out():
    started = time.monotonic()
    with pytest.raises(TimeoutError):
        ingestion.parse_isolated("doc", Path("x.pdf"), timeout_s=1, target=slow_child)
    assert time.monotonic() - started < 15


def test_parser_crash_is_reported():
    with pytest.raises(RuntimeError, match="exit code 3"):
        ingestion.parse_isolated("doc", Path("x.pdf"), timeout_s=30, target=crashing_child)


def test_parser_errors_are_passed_through():
    with pytest.raises(RuntimeError, match="broken PDF"):
        ingestion.parse_isolated("doc", Path("x.pdf"), timeout_s=30, target=failing_child)


def test_cancel_kills_a_running_parser():
    ingestion._queue.append("running-doc")
    errors = []
    worker = threading.Thread(target=lambda: errors.append(
        pytest.raises(ingestion.IngestionCancelled, ingestion.parse_isolated,
                      "running-doc", Path("x.pdf"), 60, slow_child)))
    try:
        worker.start()
        deadline = time.monotonic() + 30
        while "running-doc" not in ingestion._running:
            assert time.monotonic() < deadline
            time.sleep(0.05)
        process = ingestion._running["running-doc"]

        ingestion.cancel("running-doc")
        worker.join(timeout=15)

        assert not worker.is_alive()
        assert not process.is_alive()
    finally:
        ingestion._queue.remove("running-doc")
        ingestion._cancelled.discard("running-doc")


def test_deleting_a_document_mid_parse_unblocks_the_queue(fresh_db, fake_llm, monkeypatch):
    """The bug this guards against: a deleted PDF kept the single worker busy, so later uploads never started."""
    monkeypatch.setattr(pipeline, "PDF_PARSER", "marker")  # use the isolated-process path
    monkeypatch.setattr(ingestion, "_warm_up", lambda: None)  # don't download Marker's real models
    monkeypatch.setattr(ingestion, "parse_isolated",
                        lambda doc_id, path, timeout_s, target=slow_child: _real_parse_isolated(doc_id, path, timeout_s, slow_child))

    with TestClient(app) as client:
        headers = signup(client)
        stuck = upload(client, headers, filename="huge.pdf").json()
        waiting = upload(client, headers, filename="letter.pdf").json()

        deadline = time.monotonic() + 30
        while stuck["id"] not in ingestion._running:
            assert time.monotonic() < deadline, "parser never started"
            time.sleep(0.05)
        doc = client.get(f"/documents/{waiting['id']}", headers=headers).json()
        assert doc["queue_position"] == 1
        assert client.get(f"/documents/{stuck['id']}", headers=headers).json()["queue_position"] == 0

        # The second upload should be picked up as soon as the first is deleted
        monkeypatch.setattr(pipeline, "PDF_PARSER", "pdftext")
        assert client.delete(f"/documents/{stuck['id']}", headers=headers).status_code == 204

        deadline = time.monotonic() + 30
        while (status := client.get(f"/documents/{waiting['id']}", headers=headers).json()["status"]) == "processing":
            assert time.monotonic() < deadline, "queue stayed blocked after delete"
            time.sleep(0.1)
        assert status == "ready"


_real_parse_isolated = ingestion.parse_isolated


def test_deleting_a_queued_document_removes_it_from_the_line(fresh_db, fake_llm, monkeypatch):
    gate = threading.Event()
    real_parse = pipeline.parse_pdf
    monkeypatch.setattr(pipeline, "parse_pdf", lambda path: gate.wait(30) and real_parse(path))

    with TestClient(app) as client:
        headers = signup(client)
        first = upload(client, headers, filename="first.pdf").json()
        second = upload(client, headers, filename="second.pdf").json()
        third = upload(client, headers, filename="third.pdf").json()
        assert client.get(f"/documents/{third['id']}", headers=headers).json()["queue_position"] == 2

        client.delete(f"/documents/{second['id']}", headers=headers)

        assert client.get(f"/documents/{third['id']}", headers=headers).json()["queue_position"] == 1
        gate.set()
        deadline = time.monotonic() + 30
        while client.get(f"/documents/{third['id']}", headers=headers).json()["status"] == "processing":
            assert time.monotonic() < deadline
            time.sleep(0.1)
        assert client.get(f"/documents/{first['id']}", headers=headers).json()["status"] == "ready"


def test_ready_documents_have_no_queue_position(client):
    headers = signup(client)
    doc = upload(client, headers).json()
    assert client.get(f"/documents/{doc['id']}", headers=headers).json()["queue_position"] is None


def test_gpu_is_freed_before_marker_runs(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(pipeline, "PDF_PARSER", "marker")
    monkeypatch.setattr(ingestion, "FREE_GPU_FOR_INGESTION", True)
    monkeypatch.setattr(ingestion.llm, "unload", lambda: calls.append("unload"))
    monkeypatch.setattr(ingestion, "parse_isolated", lambda *a, **k: calls.append("parse") or [])

    ingestion._parse("doc")

    assert calls == ["unload", "parse"]
