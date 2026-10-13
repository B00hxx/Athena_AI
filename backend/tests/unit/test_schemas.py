import pytest
from pydantic import ValidationError

from backend.schemas import AskRequest, UserCreate


@pytest.mark.parametrize("password, ok", [
    ("short", False),
    ("exactly8", True),
    ("x" * 72, True),
    ("x" * 73, False),
    ("é" * 37, False),  # 74 bytes in UTF-8: bcrypt's limit is in bytes, not characters
])
def test_password_length_rules(password, ok):
    if ok:
        UserCreate(email="a@b.co", password=password)
    else:
        with pytest.raises(ValidationError):
            UserCreate(email="a@b.co", password=password)


def test_invalid_email_is_rejected():
    with pytest.raises(ValidationError):
        UserCreate(email="not-an-email", password="password123")


def test_question_is_trimmed_and_cannot_be_blank():
    assert AskRequest(document_id="d", question="  why?  ").question == "why?"
    with pytest.raises(ValidationError):
        AskRequest(document_id="d", question="   ")


def test_web_search_is_off_by_default():
    assert AskRequest(document_id="d", question="q").enable_search is False
