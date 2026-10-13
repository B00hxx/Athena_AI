from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import models


def get_owned_document(db: Session, user: models.User, document_id: str, require_ready: bool = False) -> models.Document:
    """Fetch a document belonging to the user (404 otherwise, so IDs of other users' documents don't leak)."""
    doc = db.get(models.Document, document_id)
    if doc is None or doc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")
    if require_ready and doc.status != models.Document.STATUS_READY:
        detail = {
            models.Document.STATUS_PROCESSING: "This document is still being processed. Try again in a moment.",
            models.Document.STATUS_FAILED: f"Processing this document failed: {doc.error}",
        }.get(doc.status, "Document is not ready")
        raise HTTPException(status_code=409, detail=detail)
    return doc
