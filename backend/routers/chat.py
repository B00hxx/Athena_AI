import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import llm, models, pipeline, schemas
from ..auth import get_current_user
from ..config import CHAT_HISTORY_TURNS, RETRIEVAL_TOP_K
from ..database import SessionLocal, get_db
from ..deps import get_owned_document
from ..prompts import build_rag_messages
from ..search import search_web

log = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


def _event(**payload) -> str:
    return json.dumps(payload) + "\n"


# Plain `def` so retrieval and search run in the threadpool instead of blocking the event loop
@router.post("")
def ask(body: schemas.AskRequest, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """
    Answer a question about a document with retrieval-augmented generation.

    Streams newline-delimited JSON events:
      {"type": "sources", "sources": [...], "web": [...]}   retrieved context, sent first
      {"type": "token", "content": "..."}                   answer text as it is generated
      {"type": "done", "message_id": 123}                   answer saved
      {"type": "error", "detail": "..."}                    generation failed
    """
    doc = get_owned_document(db, user, body.document_id, require_ready=True)

    # Previous turns for follow-up questions ("explain that again", "what about the second one?")
    history_rows = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.document_id == doc.id)
        .order_by(models.ChatMessage.id.desc())
        .limit(CHAT_HISTORY_TURNS * 2)
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in reversed(history_rows)]

    chunks = pipeline.retrieve(doc.id, body.question, RETRIEVAL_TOP_K)
    web_results = search_web(body.question, max_results=3) if body.enable_search else []
    messages = build_rag_messages(body.question, chunks, history, web_results)

    document_id, question = doc.id, body.question

    def generate():
        yield _event(type="sources", sources=chunks, web=web_results)
        answer = []
        try:
            for token in llm.stream(messages):
                answer.append(token)
                yield _event(type="token", content=token)
        except Exception as e:
            log.exception("LLM generation failed")
            yield _event(type="error", detail=f"The language model failed to answer: {e}")
            return

        # Save the question and answer together so a failed answer leaves no dangling question.
        # The request's DB session is closed by now (streaming outlives it), so open a new one.
        with SessionLocal() as session:
            session.add(models.ChatMessage(document_id=document_id, role="user", content=question))
            message = models.ChatMessage(
                document_id=document_id,
                role="assistant",
                content="".join(answer),
                sources=chunks + [{"web": True, **w} for w in web_results],
            )
            session.add(message)
            session.commit()
            yield _event(type="done", message_id=message.id)

    # X-Accel-Buffering tells nginx to pass tokens through immediately
    return StreamingResponse(generate(), media_type="application/x-ndjson", headers={"X-Accel-Buffering": "no"})
