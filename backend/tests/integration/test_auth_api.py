from ..helpers import signup


def test_signup_returns_tokens_and_user(client):
    response = client.post("/auth/signup", json={"email": "new@example.com", "password": "password123"})

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == "new@example.com"
    assert body["access"] and body["refresh"]


def test_duplicate_signup_is_rejected(client):
    signup(client, "dup@example.com")
    response = client.post("/auth/signup", json={"email": "dup@example.com", "password": "password123"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"


def test_signup_validates_password(client):
    response = client.post("/auth/signup", json={"email": "a@example.com", "password": "short"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][-1] == "password"


def test_login_with_correct_and_wrong_password(client):
    signup(client, "login@example.com", "password123")

    assert client.post("/auth/login", json={"email": "login@example.com", "password": "password123"}).status_code == 200
    wrong = client.post("/auth/login", json={"email": "login@example.com", "password": "nope-nope"})
    assert wrong.status_code == 401
    unknown = client.post("/auth/login", json={"email": "ghost@example.com", "password": "password123"})
    assert unknown.status_code == 401


def test_refresh_issues_working_tokens(client):
    tokens = client.post("/auth/signup", json={"email": "r@example.com", "password": "password123"}).json()

    refreshed = client.post("/auth/refresh", json={"refresh": tokens["refresh"]})

    assert refreshed.status_code == 200
    headers = {"Authorization": f"Bearer {refreshed.json()['access']}"}
    assert client.get("/documents", headers=headers).status_code == 200


def test_tokens_cannot_be_used_as_the_other_type(client):
    tokens = client.post("/auth/signup", json={"email": "t@example.com", "password": "password123"}).json()

    assert client.post("/auth/refresh", json={"refresh": tokens["access"]}).status_code == 401
    as_access = client.get("/documents", headers={"Authorization": f"Bearer {tokens['refresh']}"})
    assert as_access.status_code == 401


def test_protected_endpoints_require_a_token(client):
    for method, path in [("get", "/documents"), ("post", "/chat"), ("post", "/flashcards/generate"),
                         ("get", "/flashcards/abc"), ("patch", "/flashcards/1")]:
        assert getattr(client, method)(path).status_code == 401, path
