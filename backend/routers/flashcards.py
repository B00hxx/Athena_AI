import json
import logging
from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import llm, models, pipeline, schemas
from ..auth import get_current_user
from ..config import FLASHCARD_CONTEXT_CHARS
from ..database import get_db
from ..deps import get_owned_document
from ..prompts import FLASHCARD_SCHEMA, build_flashcard_messages

log = logging.getLogger(__name__)

router = APIRouter(prefix="/flashcards", tags=["flashcards"])

MAX_CARDS = 30


def _select_material(document_id: str, topic: str) -> list[dict]:
    """
    Pick the text to build cards from, within the character budget:
    - with a topic: the chunks most relevant to it (retrieval)
    - without: chunks spread evenly across the document, so cards cover all of it, not just the start
    """
    if topic:
        candidates = pipeline.retrieve(document_id, topic, k=20)
    else:
        chunks = pipeline.document_chunks(document_id)
        avg_len = max(sum(len(c["text"]) for c in chunks) // max(len(chunks), 1), 1)
        wanted = max(FLASHCARD_CONTEXT_CHARS // avg_len, 1)
        step = max(len(chunks) / wanted, 1)
        candidates = [chunks[int(i * step)] for i in range(min(wanted, len(chunks)))]

    selected, used = [], 0
    for c in candidates:
        if used + len(c["text"]) > FLASHCARD_CONTEXT_CHARS and selected:
            break
        selected.append(c)
        used += len(c["text"])
    if topic:  # present retrieved chunks in reading order
        selected.sort(key=lambda c: c["chunk_index"])
    return selected


def _parse_flashcards(response_text: str) -> List[Dict]:
    """Extract flashcards from the LLM output, tolerating code fences or a bare JSON array."""
    start = min((i for i in (response_text.find('{'), response_text.find('[')) if i != -1), default=-1)
    if start == -1:
        raise ValueError("No JSON in response")
    data = json.loads(response_text[start:max(response_text.rfind('}'), response_text.rfind(']')) + 1])
    cards = data.get("flashcards", []) if isinstance(data, dict) else data
    return [
        {"question": str(c["question"]).strip(), "answer": str(c["answer"]).strip()}
        for c in cards
        if isinstance(c, dict) and c.get("question") and c.get("answer")
    ]


# Plain `def` so the blocking LLM call runs in the threadpool
@router.post("/generate", response_model=list[schemas.Flashcard])
def generate_flashcards(
    body: schemas.GenerateFlashcardsRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Generate a new flashcard set for a document (replacing the previous one)."""
    doc = get_owned_document(db, user, body.document_id, require_ready=True)
    num_cards = max(1, min(body.num_cards, MAX_CARDS))
    topic = body.topic.strip()

    material = _select_material(doc.id, topic)
    if not material:
        raise HTTPException(status_code=422, detail="No content found for that topic in this document.")

    try:
        response_text = llm.complete(
            build_flashcard_messages(material, num_cards, topic), temperature=0.4, format=FLASHCARD_SCHEMA
        )
    except Exception as e:
        log.exception("Flashcard generation failed")
        raise HTTPException(status_code=502, detail=f"Failed to generate flashcards: {e}")

    try:
        cards = _parse_flashcards(response_text)[:num_cards]
    except (ValueError, KeyError, json.JSONDecodeError):
        cards = []
    if not cards:
        raise HTTPException(status_code=502, detail="The model returned no usable flashcards. Please try again.")

    db.query(models.Flashcard).filter(models.Flashcard.document_id == doc.id).delete()
    rows = [models.Flashcard(document_id=doc.id, **card) for card in cards]
    db.add_all(rows)
    db.commit()
    return rows


@router.get("/{document_id}", response_model=list[schemas.Flashcard])
def get_flashcards(document_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """The current flashcard set of a document (empty if none was generated yet)."""
    return get_owned_document(db, user, document_id).flashcards


@router.patch("/{flashcard_id}", response_model=schemas.Flashcard)
def update_flashcard(
    flashcard_id: int,
    body: schemas.UpdateFlashcardRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Record a review: whether the card still needs review."""
    card = db.get(models.Flashcard, flashcard_id)
    if card is None or card.document.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    card.needs_review = body.needs_review
    card.times_reviewed += 1
    card.last_reviewed = datetime.now(timezone.utc)
    db.commit()
    db.refresh(card)
    return card
