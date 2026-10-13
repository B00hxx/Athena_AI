"""Prompt construction for the RAG chat and flashcard generation."""

RAG_SYSTEM_PROMPT = """You are Athena, a friendly and precise study assistant.
You answer questions about a document the student uploaded, using the numbered excerpts provided with each question.

Rules:
- Base your answer on the excerpts. Cite the excerpts you use inline, like [1] or [2][3].
- If the excerpts do not contain the answer, say so plainly. You may then add general knowledge, but label it clearly as not coming from the document.
- Web results, when present, are marked [W1], [W2]... Use them only to complement the document.
- Explain like a good tutor: clear structure, short paragraphs, Markdown formatting (lists, bold key terms, tables when useful).
- Never invent page numbers, quotes or facts."""


def _format_excerpts(chunks: list[dict]) -> str:
    blocks = []
    for i, c in enumerate(chunks, start=1):
        location = f"page {c['page']}" + (f", section \"{c['section']}\"" if c.get("section") else "")
        blocks.append(f"[{i}] ({location})\n{c['text']}")
    return "\n\n".join(blocks)


def _format_web(results: list[dict]) -> str:
    return "\n\n".join(f"[W{i}] {r['title']} ({r['url']})\n{r['snippet']}" for i, r in enumerate(results, start=1))


def build_rag_messages(question: str, chunks: list[dict], history: list[dict], web_results: list[dict]) -> list[dict]:
    """
    history: previous turns as [{'role': 'user'|'assistant', 'content': ...}]. Only the current
    question carries excerpts, which keeps the context window small across long conversations.
    """
    context = "Document excerpts:\n\n" + (_format_excerpts(chunks) if chunks else "(no relevant excerpts found)")
    if web_results:
        context += "\n\nWeb results:\n\n" + _format_web(web_results)
    return [
        {"role": "system", "content": RAG_SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": f"{context}\n\n---\n\nQuestion: {question}"},
    ]


FLASHCARD_SCHEMA = {
    "type": "object",
    "properties": {
        "flashcards": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"question": {"type": "string"}, "answer": {"type": "string"}},
                "required": ["question", "answer"],
            },
        }
    },
    "required": ["flashcards"],
}


def build_flashcard_messages(chunks: list[dict], num_cards: int, topic: str) -> list[dict]:
    focus = f"\nFocus specifically on: {topic}" if topic else ""
    material = "\n\n".join(c["text"] for c in chunks)
    return [
        {
            "role": "user",
            "content": f"""Create exactly {num_cards} study flashcards from the course material below.{focus}

Guidelines:
- Cover the most important concepts, definitions, processes and facts, spread across the whole material.
- Each question must be specific and answerable from the material alone.
- Answers should be concise (1-3 sentences) but complete.
- Do not repeat the same idea twice.

Respond with JSON of the form {{"flashcards": [{{"question": "...", "answer": "..."}}]}}.

Course material:
{material}""",
        }
    ]
