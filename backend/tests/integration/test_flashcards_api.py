from ..helpers import signup, upload


def _ready_doc(client):
    headers = signup(client)
    return headers, upload(client, headers).json()["id"]


def _generate(client, headers, doc_id, **body):
    return client.post("/flashcards/generate", headers=headers, json={"document_id": doc_id, **body})


def test_generate_creates_and_stores_cards(client):
    headers, doc_id = _ready_doc(client)

    response = _generate(client, headers, doc_id, num_cards=3)

    assert response.status_code == 200
    cards = response.json()
    assert [c["answer"] for c in cards] == ["In the stroma.", "RuBisCO.", "Water."]
    assert all(c["needs_review"] is False and c["times_reviewed"] == 0 for c in cards)
    assert client.get(f"/flashcards/{doc_id}", headers=headers).json() == cards


def test_prompt_uses_document_material_and_requested_count(client, fake_llm):
    headers, doc_id = _ready_doc(client)

    _generate(client, headers, doc_id, num_cards=500, topic="enzymes")

    prompt = fake_llm.calls[-1][0]["content"]
    assert "exactly 30 study flashcards" in prompt  # clamped to the maximum
    assert "Focus specifically on: enzymes" in prompt
    assert "RuBisCO" in prompt


def test_extra_cards_from_the_model_are_trimmed(client):
    headers, doc_id = _ready_doc(client)
    assert len(_generate(client, headers, doc_id, num_cards=2).json()) == 2


def test_regenerating_replaces_the_previous_set(client, fake_llm):
    headers, doc_id = _ready_doc(client)
    _generate(client, headers, doc_id)
    fake_llm.completion = '{"flashcards": [{"question": "Only one?", "answer": "Yes."}]}'

    _generate(client, headers, doc_id)

    assert [c["question"] for c in client.get(f"/flashcards/{doc_id}", headers=headers).json()] == ["Only one?"]


def test_unusable_model_output_returns_502_and_keeps_old_cards(client, fake_llm):
    headers, doc_id = _ready_doc(client)
    _generate(client, headers, doc_id)
    fake_llm.completion = "Sorry, I can't help with that."

    response = _generate(client, headers, doc_id)

    assert response.status_code == 502
    assert len(client.get(f"/flashcards/{doc_id}", headers=headers).json()) == 3


def test_llm_failure_returns_502(client, fake_llm):
    headers, doc_id = _ready_doc(client)
    fake_llm.error = TimeoutError("too slow")
    assert _generate(client, headers, doc_id).status_code == 502


def test_reviewing_a_card_updates_its_state(client):
    headers, doc_id = _ready_doc(client)
    card = _generate(client, headers, doc_id).json()[0]

    first = client.patch(f"/flashcards/{card['id']}", headers=headers, json={"needs_review": True}).json()
    second = client.patch(f"/flashcards/{card['id']}", headers=headers, json={"needs_review": False}).json()

    assert first["needs_review"] is True and first["times_reviewed"] == 1
    assert second["needs_review"] is False and second["times_reviewed"] == 2
    assert second["last_reviewed"] is not None


def test_flashcards_are_private(client):
    headers, doc_id = _ready_doc(client)
    card = _generate(client, headers, doc_id).json()[0]
    intruder = signup(client, "intruder@example.com")

    assert _generate(client, intruder, doc_id).status_code == 404
    assert client.get(f"/flashcards/{doc_id}", headers=intruder).status_code == 404
    assert client.patch(f"/flashcards/{card['id']}", headers=intruder, json={"needs_review": True}).status_code == 404


def test_unknown_card_returns_404(client):
    headers, _ = _ready_doc(client)
    assert client.patch("/flashcards/999999", headers=headers, json={"needs_review": True}).status_code == 404
