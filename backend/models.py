from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


def _now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)

    documents = relationship("Document", back_populates="owner", cascade="all, delete-orphan")


class Document(Base):
    """An uploaded PDF and the state of its ingestion into the vector store."""
    __tablename__ = "documents"

    STATUS_PROCESSING = "processing"
    STATUS_READY = "ready"
    STATUS_FAILED = "failed"

    id = Column(String(36), primary_key=True)  # uuid4, also the vector-store key
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    filename = Column(String, nullable=False)
    size = Column(Integer, nullable=False)
    status = Column(String(16), default=STATUS_PROCESSING, nullable=False)
    error = Column(Text, nullable=True)
    num_chunks = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    owner = relationship("User", back_populates="documents")
    messages = relationship("ChatMessage", back_populates="document", cascade="all, delete-orphan",
                            order_by="ChatMessage.id")
    flashcards = relationship("Flashcard", back_populates="document", cascade="all, delete-orphan",
                              order_by="Flashcard.id")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False)
    role = Column(String(16), nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)
    sources = Column(JSON, nullable=True)  # retrieved chunks / web results backing an answer
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    document = relationship("Document", back_populates="messages")


class Flashcard(Base):
    __tablename__ = "flashcards"

    id = Column(Integer, primary_key=True)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    needs_review = Column(Boolean, default=False, nullable=False)
    times_reviewed = Column(Integer, default=0, nullable=False)
    last_reviewed = Column(DateTime(timezone=True), nullable=True)

    document = relationship("Document", back_populates="flashcards")
