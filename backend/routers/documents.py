import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from .. import ingestion, models, pipeline, schemas
from ..auth import get_current_user
from ..config import MAX_UPLOAD_MB, UPLOAD_DIR
from ..database import get_db
from ..deps import get_owned_document

router = APIRouter(prefix="/documents", tags=["documents"])

MAX_FILE_SIZE = MAX_UPLOAD_MB * 1024 * 1024


def _out(doc: models.Document) -> schemas.Document:
    out = schemas.Document.model_validate(doc)
    if doc.status == models.Document.STATUS_PROCESSING:
        out.queue_position = ingestion.queue_position(doc.id)
    return out


@router.post("", response_model=schemas.Document, status_code=status.HTTP_202_ACCEPTED)
def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """
    Upload a PDF. Returns immediately with status "processing"; the PDF is parsed, chunked,
    embedded and indexed in the background. Poll GET /documents/{id} until status is "ready".
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    # Read at most one byte past the limit to check size without loading huge files
    contents = file.file.read(MAX_FILE_SIZE + 1)
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File size exceeds maximum limit of {MAX_UPLOAD_MB}MB")
    if not contents.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="File is not a valid PDF")

    document_id = str(uuid.uuid4())
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ingestion.pdf_path(document_id).write_bytes(contents)

    doc = models.Document(
        id=document_id,
        owner_id=user.id,
        filename=(file.filename or "document.pdf")[:255],
        size=len(contents),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    ingestion.submit(document_id)
    return _out(doc)


@router.get("", response_model=list[schemas.Document])
def list_documents(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    docs = (
        db.query(models.Document)
        .filter(models.Document.owner_id == user.id)
        .order_by(models.Document.created_at.desc())
        .all()
    )
    return [_out(d) for d in docs]


@router.get("/{document_id}", response_model=schemas.Document)
def get_document(document_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return _out(get_owned_document(db, user, document_id))


@router.get("/{document_id}/messages", response_model=list[schemas.ChatMessage])
def get_messages(document_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return get_owned_document(db, user, document_id).messages


@router.post("/{document_id}/reprocess", response_model=schemas.Document, status_code=status.HTTP_202_ACCEPTED)
def reprocess_document(document_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Run ingestion again, e.g. after a failure or after changing the parser/chunking settings."""
    doc = get_owned_document(db, user, document_id)
    if doc.status == models.Document.STATUS_PROCESSING:
        raise HTTPException(status_code=409, detail="This document is already being processed")
    doc.status, doc.error = models.Document.STATUS_PROCESSING, None
    db.commit()
    db.refresh(doc)
    ingestion.submit(document_id)
    return _out(doc)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    doc = get_owned_document(db, user, document_id)
    db.delete(doc)
    db.commit()
    ingestion.cancel(document_id)  # stop parsing it if it is queued or in progress
    pipeline.delete_document(document_id)
    ingestion.pdf_path(document_id).unlink(missing_ok=True)
    ingestion.markdown_path(document_id).unlink(missing_ok=True)
