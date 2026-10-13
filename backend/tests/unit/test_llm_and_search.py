from types import SimpleNamespace

from backend import llm, search


def _client_with(models):
    return lambda: SimpleNamespace(list=lambda: SimpleNamespace(models=[SimpleNamespace(model=m) for m in models]))


def test_model_status_ready_when_model_is_pulled(monkeypatch):
    monkeypatch.setattr(llm, "OLLAMA_MODEL", "gemma:7b")
    monkeypatch.setattr(llm, "_client", _client_with(["gemma:7b", "other:1b"]))
    assert llm.model_status() == (True, "gemma:7b")


def test_model_without_tag_matches_latest(monkeypatch):
    monkeypatch.setattr(llm, "OLLAMA_MODEL", "mistral")
    monkeypatch.setattr(llm, "_client", _client_with(["mistral:latest"]))
    assert llm.model_status()[0] is True


def test_model_status_reports_missing_model(monkeypatch):
    monkeypatch.setattr(llm, "OLLAMA_MODEL", "gemma:7b")
    monkeypatch.setattr(llm, "_client", _client_with(["other:1b"]))
    ok, detail = llm.model_status()
    assert not ok and "not pulled" in detail


def test_model_status_reports_unreachable_server(monkeypatch):
    def boom():
        raise ConnectionError("refused")
    monkeypatch.setattr(llm, "_client", lambda: SimpleNamespace(list=boom))
    ok, detail = llm.model_status()
    assert not ok and "unreachable" in detail


def test_stream_yields_only_non_empty_tokens(monkeypatch):
    parts = [SimpleNamespace(message=SimpleNamespace(content=c)) for c in ["Hel", "", "lo"]]
    monkeypatch.setattr(llm, "_client", lambda: SimpleNamespace(chat=lambda **kw: iter(parts)))
    assert list(llm.stream([{"role": "user", "content": "hi"}])) == ["Hel", "lo"]


def test_search_maps_result_fields(monkeypatch):
    class FakeDDGS:
        def text(self, query, max_results):
            return [{"title": "T", "body": "B", "href": "https://x.org"}]
    monkeypatch.setattr(search, "DDGS", FakeDDGS)
    assert search.search_web("q") == [{"title": "T", "snippet": "B", "url": "https://x.org"}]


def test_search_failure_returns_empty_list(monkeypatch):
    class BrokenDDGS:
        def text(self, query, max_results):
            raise RuntimeError("rate limited")
    monkeypatch.setattr(search, "DDGS", BrokenDDGS)
    assert search.search_web("q") == []
