from datetime import timedelta

import pytest
from fastapi import HTTPException

from backend import auth


def test_password_hash_roundtrip():
    hashed = auth.get_password_hash("correct horse")
    assert hashed != "correct horse"
    assert auth.verify_password("correct horse", hashed)
    assert not auth.verify_password("wrong horse", hashed)


def test_access_and_refresh_tokens_decode_to_email():
    assert auth.decode_token(auth.create_access_token("a@b.co"), "access") == "a@b.co"
    assert auth.decode_token(auth.create_refresh_token("a@b.co"), "refresh") == "a@b.co"


@pytest.mark.parametrize("token_factory, expected_type", [
    (auth.create_refresh_token, "access"),  # a refresh token must not work as an access token
    (auth.create_access_token, "refresh"),
])
def test_token_type_is_enforced(token_factory, expected_type):
    with pytest.raises(HTTPException) as exc:
        auth.decode_token(token_factory("a@b.co"), expected_type)
    assert exc.value.status_code == 401


def test_expired_token_is_rejected():
    token = auth._create_token("a@b.co", "access", timedelta(seconds=-1))
    with pytest.raises(HTTPException):
        auth.decode_token(token, "access")


def test_tampered_token_is_rejected():
    token = auth.create_access_token("a@b.co")
    with pytest.raises(HTTPException):
        auth.decode_token(token[:-2] + ("AA" if token[-2:] != "AA" else "BB"), "access")
