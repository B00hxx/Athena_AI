"""Thin wrapper around the Ollama client so every call uses the same host, model and options."""
from functools import lru_cache
from typing import Iterator, Optional

from ollama import Client

from .config import OLLAMA_HOST, OLLAMA_KEEP_ALIVE, OLLAMA_MODEL, OLLAMA_NUM_CTX


@lru_cache(maxsize=1)
def _client() -> Client:
    return Client(host=OLLAMA_HOST)


def _options(temperature: float) -> dict:
    return {"num_ctx": OLLAMA_NUM_CTX, "temperature": temperature}


def complete(messages: list[dict], temperature: float = 0.3, format: Optional[dict | str] = None) -> str:
    response = _client().chat(
        model=OLLAMA_MODEL,
        messages=messages,
        options=_options(temperature),
        keep_alive=OLLAMA_KEEP_ALIVE,
        format=format,
    )
    return response.message.content


def stream(messages: list[dict], temperature: float = 0.3) -> Iterator[str]:
    for part in _client().chat(
        model=OLLAMA_MODEL,
        messages=messages,
        options=_options(temperature),
        keep_alive=OLLAMA_KEEP_ALIVE,
        stream=True,
    ):
        if part.message.content:
            yield part.message.content


def model_status() -> tuple[bool, str]:
    """Return (ready, detail) for the health check."""
    try:
        names = {m.model for m in _client().list().models}
    except Exception as e:
        return False, f"Ollama unreachable at {OLLAMA_HOST}: {e}"
    wanted = OLLAMA_MODEL if ":" in OLLAMA_MODEL else f"{OLLAMA_MODEL}:latest"
    if wanted not in names:
        return False, f"Model {OLLAMA_MODEL} is not pulled yet"
    return True, OLLAMA_MODEL
