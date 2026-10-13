import time

from fastapi.testclient import TestClient

from backend import models, pipeline
from backend.config import UPLOAD_DIR
from backend.database import SessionLocal
from backend.main import app
from backend.routers import documents as documents_router

from ..helpers import LECTURE, make_pdf, signup, upload


def test_upload_ingests_the_pdf(client):
    headers = signup(client)

    response = upload(client, headers, filename="photosynthesis.pdf")

    assert response.status_code == 202
    doc = client.get(f"/documents/{response.json()['id']}", headers=headers).json()
    assert doc["status"] == "ready"
    assert doc["filename"] == "photosynthesis.pdf"
    assert doc["num_chunks"] == 3  # one passage per page of the lecture
    assert (UPLOAD_DIR / f"{doc['id']}.pdf").exists()
    assert "RuBisCO" in (UPLOAD_DIR / f"{doc['id']}.md").read_text()
    pages = {c["page"] for c in pipeline.document_chunks(doc["id"])}
    assert pages == {1, 2, 3}


def test_rejects_non_pdf_content_type(client):
    headers = signup(client)
    response = client.post("/documents", headers=headers, files={"file": ("a.txt", b"hello", "text/plain")})
    assert response.status_code == 400


def test_rejects_files_without_pdf_signature(client):
    headers = signup(client)
    response = upload(client, headers, pdf=b"MZ\x90\x00 not really a pdf")
    assert response.status_code == 400
    assert "valid PDF" in response.json()["detail"]


def test_rejects_oversized_files(client, monkeypatch):
    monkeypatch.setattr(documents_router, "MAX_FILE_SIZE", 100)
    headers = signup(client)
    assert upload(client, headers).status_code == 413


def test_stored_filename_is_server_generated(client):
    headers = signup(client)
    doc = upload(client, headers, filename="../../etc/passwd.pdf").json()

    assert doc["filename"] == "../../etc/passwd.pdf"  # kept for display only
    assert (UPLOAD_DIR / f"{doc['id']}.pdf").exists()
    assert not (UPLOAD_DIR.parent.parent / "etc").exists()


def test_pdf_without_text_fails_with_a_reason(client):
    headers = signup(client)
    doc = upload(client, headers, pdf=make_pdf([("", [])])).json()

    doc = client.get(f"/documents/{doc['id']}", headers=headers).json()
    assert doc["status"] == "failed"
    assert "No readable text" in doc["error"]


def test_list_returns_only_my_documents_newest_first(client):
    me, other = signup(client, "me@example.com"), signup(client, "other@example.com")
    first = upload(client, me, filename="first.pdf").json()
    second = upload(client, me, filename="second.pdf").json()
    upload(client, other, filename="theirs.pdf")

    listed = client.get("/documents", headers=me).json()

    assert [d["id"] for d in listed] == [second["id"], first["id"]]


def test_other_users_documents_are_invisible(client):
    owner, intruder = signup(client, "owner@example.com"), signup(client, "intruder@example.com")
    doc_id = upload(client, owner).json()["id"]

    for method, path in [("get", f"/documents/{doc_id}"), ("get", f"/documents/{doc_id}/messages"),
                         ("post", f"/documents/{doc_id}/reprocess"), ("delete", f"/documents/{doc_id}")]:
        assert getattr(client, method)(path, headers=intruder).status_code == 404, path
    assert client.get(f"/documents/{doc_id}", headers=owner).status_code == 200


def test_delete_removes_files_vectors_and_rows(client):
    headers = signup(client)
    doc_id = upload(client, headers).json()["id"]
    client.post("/chat", headers=headers, json={"document_id": doc_id, "question": "What is RuBisCO?"})

    assert client.delete(f"/documents/{doc_id}", headers=headers).status_code == 204

    assert client.get(f"/documents/{doc_id}", headers=headers).status_code == 404
    assert not (UPLOAD_DIR / f"{doc_id}.pdf").exists()
    assert not (UPLOAD_DIR / f"{doc_id}.md").exists()
    assert pipeline.document_chunks(doc_id) == []
    with SessionLocal() as db:
        assert db.query(models.ChatMessage).filter_by(document_id=doc_id).count() == 0


def test_reprocess_reruns_ingestion(client, monkeypatch):
    headers = signup(client)
    doc_id = upload(client, headers).json()["id"]

    monkeypatch.setattr(pipeline, "parse_pdf", lambda path: [(1, "# New\n\nCompletely different replacement content.")])
    response = client.post(f"/documents/{doc_id}/reprocess", headers=headers)

    assert response.status_code == 202
    assert client.get(f"/documents/{doc_id}", headers=headers).json()["num_chunks"] == 1
    assert pipeline.document_chunks(doc_id)[0]["section"] == "New"


def test_failed_ingestion_can_be_retried(client, monkeypatch):
    headers = signup(client)
    real_parser = pipeline.parse_pdf

    def broken(path):
        raise RuntimeError("parser crashed")
    monkeypatch.setattr(pipeline, "parse_pdf", broken)
    doc_id = upload(client, headers).json()["id"]
    assert client.get(f"/documents/{doc_id}", headers=headers).json()["error"] == "parser crashed"

    monkeypatch.setattr(pipeline, "parse_pdf", real_parser)
    client.post(f"/documents/{doc_id}/reprocess", headers=headers)
    assert client.get(f"/documents/{doc_id}", headers=headers).json()["status"] == "ready"


def test_ingestion_runs_in_the_background(fresh_db, fake_llm):
    """Without the sync_ingestion fixture: upload returns 'processing', the worker thread finishes it."""
    with TestClient(app) as client:
        headers = signup(client)
        doc = upload(client, headers).json()
        assert doc["status"] == "processing"

        deadline = time.time() + 30
        while (status := client.get(f"/documents/{doc['id']}", headers=headers).json()["status"]) == "processing":
            assert time.time() < deadline, "ingestion did not finish"
            time.sleep(0.1)
        assert status == "ready"


def test_documents_interrupted_by_a_restart_are_resumed(fresh_db, fake_llm, sync_ingestion):
    with SessionLocal() as db:
        user = models.User(email="resume@example.com", hashed_password="x")
        db.add(user)
        db.flush()
        db.add(models.Document(id="11111111-1111-4111-8111-111111111111", owner_id=user.id,
                               filename="left-behind.pdf", size=1))
        db.commit()
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / "11111111-1111-4111-8111-111111111111.pdf").write_bytes(make_pdf(LECTURE))

    with TestClient(app):  # startup resumes "processing" documents
        pass

    with SessionLocal() as db:
        assert db.get(models.Document, "11111111-1111-4111-8111-111111111111").status == "ready"
