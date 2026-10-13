from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if len(v.encode('utf-8')) > 72:
            raise ValueError('Password is too long (max 72 bytes)')
        return v

class UserLogin(UserBase):
    password: str

class User(UserBase):
    id: int
    is_active: bool

    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: str | None = None


class Document(BaseModel):
    id: str
    filename: str
    size: int
    status: str
    error: Optional[str] = None
    num_chunks: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatMessage(BaseModel):
    id: int
    role: str
    content: str
    sources: Optional[list[dict[str, Any]]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AskRequest(BaseModel):
    document_id: str
    question: str
    enable_search: bool = False

    @field_validator('question')
    @classmethod
    def not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Question cannot be empty')
        return v


class Flashcard(BaseModel):
    id: int
    question: str
    answer: str
    needs_review: bool
    times_reviewed: int
    last_reviewed: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class GenerateFlashcardsRequest(BaseModel):
    document_id: str
    num_cards: int = 10
    topic: str = ""


class UpdateFlashcardRequest(BaseModel):
    needs_review: bool
