from backend.prompts import FLASHCARD_SCHEMA, RAG_SYSTEM_PROMPT, build_flashcard_messages, build_rag_messages

CHUNKS = [
    {"text": "RuBisCO fixes CO2.", "page": 3, "section": "The Calvin Cycle"},
    {"text": "Water is split.", "page": 2, "section": None},
]


def test_rag_messages_order_system_history_then_question():
    history = [{"role": "user", "content": "earlier q"}, {"role": "assistant", "content": "earlier a"}]
    messages = build_rag_messages("What fixes CO2?", CHUNKS, history, [])

    assert messages[0] == {"role": "system", "content": RAG_SYSTEM_PROMPT}
    assert messages[1:3] == history
    assert messages[-1]["role"] == "user"
    assert messages[-1]["content"].endswith("Question: What fixes CO2?")


def test_excerpts_are_numbered_with_page_and_section():
    content = build_rag_messages("q", CHUNKS, [], [])[-1]["content"]

    assert '[1] (page 3, section "The Calvin Cycle")\nRuBisCO fixes CO2.' in content
    assert "[2] (page 2)\nWater is split." in content


def test_web_results_are_labelled_separately():
    web = [{"title": "Wiki", "url": "https://example.org", "snippet": "Calvin cycle info"}]
    content = build_rag_messages("q", CHUNKS, [], web)[-1]["content"]

    assert "Web results:" in content
    assert "[W1] Wiki (https://example.org)\nCalvin cycle info" in content


def test_no_excerpts_is_stated_explicitly():
    assert "(no relevant excerpts found)" in build_rag_messages("q", [], [], [])[-1]["content"]


def test_flashcard_prompt_includes_count_topic_and_material():
    content = build_flashcard_messages(CHUNKS, 7, "enzymes")[0]["content"]

    assert "exactly 7 study flashcards" in content
    assert "Focus specifically on: enzymes" in content
    assert "RuBisCO fixes CO2." in content and "Water is split." in content
    assert FLASHCARD_SCHEMA["required"] == ["flashcards"]


def test_flashcard_prompt_without_topic_has_no_focus_line():
    assert "Focus specifically" not in build_flashcard_messages(CHUNKS, 5, "")[0]["content"]
