"""Test utilities: a tiny PDF writer, a deterministic embedder, and API shortcuts."""
import hashlib
import json
import re
import textwrap

import numpy as np

# A 3-page lecture used across the tests. Each page has a distinct topic so retrieval is checkable.
LECTURE = [
    ("Lecture 4: Photosynthesis", [
        "Photosynthesis is the process by which plants, algae and some bacteria convert light energy "
        "into chemical energy stored in glucose. It takes place mainly in the chloroplasts of leaf cells.",
        "Chlorophyll a is the primary pigment; it absorbs mostly blue and red light and reflects green light.",
    ]),
    ("The Light-Dependent Reactions", [
        "The light-dependent reactions occur in the thylakoid membranes. Photosystem II absorbs light and "
        "splits water by photolysis, releasing oxygen as a by-product.",
        "The proton gradient drives ATP synthase, producing ATP by chemiosmosis. NADP+ is reduced to NADPH.",
    ]),
    ("The Calvin Cycle", [
        "The Calvin cycle takes place in the stroma of the chloroplast.",
        "The enzyme RuBisCO fixes carbon dioxide by attaching it to ribulose bisphosphate, a five-carbon sugar.",
    ]),
]


def make_pdf(pages: list[tuple[str, list[str]]]) -> bytes:
    """Build a minimal, valid PDF with a real text layer (one title + paragraphs per page)."""
    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    objs: list[bytes] = []

    def add(b: bytes) -> int:
        objs.append(b)
        return len(objs)

    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    pages_id = len(objs) + 1 + 2 * len(pages)
    kids = []
    for title, paragraphs in pages:
        lines = [f"BT /F1 18 Tf 60 760 Td ({esc(title)}) Tj ET"] if title else []
        y = 720
        for p in paragraphs:
            for line in textwrap.wrap(p, 85):
                lines.append(f"BT /F1 11 Tf 60 {y} Td ({esc(line)}) Tj ET")
                y -= 16
            y -= 10
        stream = "\n".join(lines).encode("latin-1")
        content = add(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        kids.append(add(
            b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 612 792] /Contents %d 0 R "
            b"/Resources << /Font << /F1 %d 0 R >> >> >>" % (pages_id, content, font)
        ))
    add(b"<< /Type /Pages /Kids [" + b" ".join(b"%d 0 R" % k for k in kids) + b"] /Count %d >>" % len(kids))
    catalog = add(b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id)

    out = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + obj + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, catalog, xref)
    return out


class FakeEmbedder:
    """Deterministic hashed bag-of-words embeddings: texts sharing words get similar vectors."""
    DIM = 512

    def encode(self, texts, normalize_embeddings=True, batch_size=32):
        out = np.zeros((len(texts), self.DIM), dtype=np.float32)
        for i, text in enumerate(texts):
            for word in re.findall(r"[a-z0-9]+", text.lower()):
                if len(word) > 2:
                    out[i, int(hashlib.md5(word.encode()).hexdigest(), 16) % self.DIM] += 1
            norm = np.linalg.norm(out[i])
            if norm:
                out[i] /= norm
            else:
                out[i, 0] = 1.0
        return out


def signup(client, email: str = "student@example.com", password: str = "password123") -> dict:
    """Create a user and return Authorization headers."""
    response = client.post("/auth/signup", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access']}"}


def upload(client, headers, pdf: bytes | None = None, filename: str = "lecture.pdf"):
    return client.post(
        "/documents",
        headers=headers,
        files={"file": (filename, pdf if pdf is not None else make_pdf(LECTURE), "application/pdf")},
    )


def parse_stream(response) -> list[dict]:
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]
