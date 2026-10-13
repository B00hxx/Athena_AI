"""pipeline.chunk_pages: passages must carry an exact page and section, and never cross either."""
import pytest

from backend import pipeline


def test_assigns_page_and_section_from_headings():
    pages = [
        (1, "# Photosynthesis\n\nPlants turn light into chemical energy stored in glucose."),
        (2, "## Calvin Cycle\n\nRuBisCO fixes carbon dioxide in the stroma of the chloroplast."),
    ]
    chunks = pipeline.chunk_pages(pages)

    assert [(c.page, c.section) for c in chunks] == [(1, "Photosynthesis"), (2, "Calvin Cycle")]
    assert "RuBisCO" in chunks[1].text


def test_page_without_heading_inherits_previous_section():
    pages = [
        (1, "## Light Reactions\n\nPhotosystem II splits water and releases oxygen as a by-product."),
        (2, "The proton gradient then drives ATP synthase to produce ATP by chemiosmosis."),
    ]
    chunks = pipeline.chunk_pages(pages)

    assert chunks[1].page == 2
    assert chunks[1].section == "Light Reactions"


def test_multiple_sections_on_one_page_are_split():
    page = (
        "## First Topic\n\nThis paragraph is entirely about the first topic of the page.\n\n"
        "## Second Topic\n\nThis paragraph is entirely about the second topic of the page."
    )
    chunks = pipeline.chunk_pages([(5, page)])

    assert [c.section for c in chunks] == ["First Topic", "Second Topic"]
    assert all(c.page == 5 for c in chunks)
    assert "second" not in chunks[0].text.lower().split("first topic")[-1]


def test_text_before_first_heading_has_no_section():
    chunks = pipeline.chunk_pages([(1, "A preface sentence that comes before any heading at all.\n\n# Intro\n\nBody text of the introduction section.")])
    assert chunks[0].section == ""
    assert chunks[1].section == "Intro"


def test_strips_markdown_emphasis_from_headings():
    chunks = pipeline.chunk_pages([(1, "## **The Calvin Cycle**\n\nRuBisCO fixes carbon dioxide in the stroma.")])
    assert chunks[0].section == "The Calvin Cycle"


def test_skips_tiny_fragments():
    chunks = pipeline.chunk_pages([(1, "12"), (2, "A real sentence with enough characters to keep.")])
    assert [c.page for c in chunks] == [2]


def test_long_sections_are_split_within_size_limit():
    body = " ".join(f"Sentence number {i} about cellular respiration and energy." for i in range(200))
    chunks = pipeline.chunk_pages([(1, "# Respiration\n\n" + body)])

    assert len(chunks) > 5
    assert all(len(c.text) <= pipeline.CHUNK_SIZE for c in chunks)
    assert all(c.section == "Respiration" for c in chunks)


@pytest.mark.parametrize("pages", [[], [(1, "")], [(1, "   \n\n  ")]])
def test_empty_documents_produce_no_chunks(pages):
    assert pipeline.chunk_pages(pages) == []
