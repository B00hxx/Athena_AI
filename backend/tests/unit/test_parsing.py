"""PDF parsing: Marker's paginated output is split into pages; pdftext reads a real text layer."""
import sys
import types
from pathlib import Path

import pytest

from backend import pipeline

from ..helpers import LECTURE, make_pdf

SEP = "-" * 48


@pytest.fixture
def fake_marker(monkeypatch):
    """Stub Marker so the page-splitting logic can be tested without its multi-GB models."""
    def install(markdown: str):
        monkeypatch.setattr(pipeline, "_marker_converter", lambda: (lambda path: "rendered"))
        output = types.ModuleType("marker.output")
        output.text_from_rendered = lambda rendered: (markdown, {}, {})
        monkeypatch.setitem(sys.modules, "marker", sys.modules.get("marker") or types.ModuleType("marker"))
        monkeypatch.setitem(sys.modules, "marker.output", output)
    return install


def test_marker_output_is_split_into_numbered_pages(fake_marker):
    fake_marker(f"\n\n{{0}}{SEP}\n\n# Intro\n\nFirst page.\n\n{{1}}{SEP}\n\nSecond page.\n\n{{2}}{SEP}\n\nThird page.")

    pages = pipeline._parse_with_marker(Path("x.pdf"))

    assert [n for n, _ in pages] == [1, 2, 3]
    assert "First page." in pages[0][1] and "Third page." in pages[2][1]
    assert SEP not in "".join(text for _, text in pages)


def test_marker_output_without_separators_is_one_page(fake_marker):
    fake_marker("# Only\n\nNo pagination markers here.")
    assert pipeline._parse_with_marker(Path("x.pdf")) == [(1, "# Only\n\nNo pagination markers here.")]


def test_pdftext_reads_every_page(tmp_path):
    path = tmp_path / "lecture.pdf"
    path.write_bytes(make_pdf(LECTURE))

    pages = pipeline._parse_with_pdftext(path)

    assert [n for n, _ in pages] == [1, 2, 3]
    assert "Calvin cycle" in pages[2][1]
    assert "RuBisCO" in pages[2][1]


def test_parse_pdf_dispatches_on_setting(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(pipeline, "_parse_with_marker", lambda p: calls.append("marker") or [])
    monkeypatch.setattr(pipeline, "_parse_with_pdftext", lambda p: calls.append("pdftext") or [])

    monkeypatch.setattr(pipeline, "PDF_PARSER", "marker")
    pipeline.parse_pdf(tmp_path / "a.pdf")
    monkeypatch.setattr(pipeline, "PDF_PARSER", "pdftext")
    pipeline.parse_pdf(tmp_path / "a.pdf")

    assert calls == ["marker", "pdftext"]
