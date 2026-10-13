from backend import llm


def test_liveness(client):
    assert client.get("/health/live").json() == {"status": "ok"}


def test_ready_when_database_and_model_are_up(client):
    response = client.get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "llm": "ok"}


def test_not_ready_when_model_is_missing(client, monkeypatch):
    monkeypatch.setattr(llm, "model_status", lambda: (False, "Model gemma:7b is not pulled yet"))

    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["llm"] == "Model gemma:7b is not pulled yet"
    assert response.json()["database"] == "ok"


def test_openapi_lists_all_routers(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path in ["/auth/login", "/documents", "/chat", "/flashcards/generate", "/health/ready"]:
        assert path in paths
