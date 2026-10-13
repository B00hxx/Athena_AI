# syntax=docker/dockerfile:1
FROM python:3.12-slim

# cpu (default, small image) or a CUDA wheel index such as cu128 for GPU hosts
ARG TORCH_VARIANT=cpu
ARG EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/models/huggingface \
    MODEL_CACHE_DIR=/models/datalab \
    FONT_PATH=/models/fonts/GoNotoCurrent-Regular.ttf \
    EMBEDDING_MODEL=${EMBEDDING_MODEL} \
    DATA_DIR=/data

# Shared libraries needed by OpenCV / PDFium at runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install torch==2.9.1 --index-url https://download.pytorch.org/whl/${TORCH_VARIANT}

COPY requirements.txt .
RUN pip install -r requirements.txt

# Bake the small embedding model into the image so the first upload doesn't wait on a download.
# Marker's layout/OCR models are larger and are fetched into the /models volume on first start.
# Marker also needs a font for rendering; by default it writes it into site-packages, which isn't writable
# by the app user, hence FONT_PATH above.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${EMBEDDING_MODEL}')" \
    && python -c "from marker.util import download_font; download_font()"

RUN useradd --create-home --uid 1000 app \
    && mkdir -p /data /models/datalab \
    && chown -R app:app /data /models
# The app uses package-relative imports, so it lives at /app/backend
COPY --chown=app:app . ./backend
USER app

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/live', timeout=4)"

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
