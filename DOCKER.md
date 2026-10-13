# Running Athena AI with Docker

This is the operations guide: what each container does, where data lives, GPU setup, upgrades and backups. For a first start, the [README quick start](README.md#quick-start-docker) is all you need.

## Services

| Service | Image | Role | Ports |
|---|---|---|---|
| `db` | `postgres:16-alpine` | Users, documents, chat history, flashcards | `127.0.0.1:5433` |
| `ollama` | `ollama/ollama` | Serves the LLM | `127.0.0.1:11434` |
| `ollama-pull` | `ollama/ollama` | One-shot job: pulls `OLLAMA_MODEL`, then exits | none |
| `backend` | `athenaai-backend` (built) | FastAPI + RAG pipeline + ingestion worker | `127.0.0.1:8000` |
| `frontend` | `athenaai-frontend` (built) | nginx: React build + `/api` reverse proxy | `0.0.0.0:3000` |

Startup order is enforced with health checks: `db` and `ollama` become healthy, `ollama-pull` finishes, then `backend` starts, and `frontend` waits for the backend's health check. If the backend never comes up, look at `ollama-pull` first.

## Data and volumes

| Volume | Mounted at | Contents | Size (Gemma 7B) |
|---|---|---|---|
| `athenaai_postgres_data` | `/var/lib/postgresql/data` | The database | small |
| `athenaai_app_data` | `/data` (backend) | `uploads/` (PDFs + extracted Markdown), `chroma/` (vector index) | grows with uploads |
| `athenaai_ollama_models` | `/root/.ollama` (ollama) | LLM weights | 5.4 GB |
| `athenaai_model_cache` | `/models` (backend) | Marker/Surya models, embedding model, fonts | 3.5 GB |

`docker compose down` keeps all of it. `docker compose down -v` (or `make clean`) deletes everything, including accounts and documents.

The extracted Markdown of each upload is kept next to the PDF (`/data/uploads/<id>.md`), which is handy for checking what the parser actually saw:

```bash
docker compose exec backend ls /data/uploads
docker compose exec backend cat /data/uploads/<document-id>.md
```

## GPU

With an NVIDIA GPU and the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) installed:

```bash
make gpu
# = docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

The override gives the GPU to both `ollama` (LLM inference) and `backend`, and rebuilds the backend with CUDA 12.8 PyTorch (`TORCH_VARIANT=cu128`, tagged `athenaai-backend:gpu`) so Marker's layout and OCR models run on the GPU too. The CUDA image is larger than the CPU one because it bundles the CUDA runtime libraries.

Marker only holds GPU memory while it parses a PDF (each document is parsed in its own short-lived process). The override also sets `FREE_GPU_FOR_INGESTION=true`, which unloads the LLM from the GPU before each parse so the two never compete for VRAM. On cards that run out of VRAM, WSL and Windows drivers silently fall back to much slower shared memory, which can stretch a one-minute parse to tens of minutes. If your card has 12 GB or more, set `FREE_GPU_FOR_INGESTION=false` in `.env` to keep the LLM loaded.

Check that the GPU is actually in use:

```bash
docker compose exec ollama ollama ps          # PROCESSOR column should say GPU
docker compose exec backend python -c "import torch; print(torch.cuda.is_available())"
```

To avoid typing both `-f` flags, put `COMPOSE_FILE=docker-compose.yml:docker-compose.gpu.yml` in `.env`.

## Changing the model

Set `OLLAMA_MODEL` in `.env` to any model from the [Ollama library](https://ollama.com/library) and run `docker compose up -d`. The `ollama-pull` job downloads it before the backend restarts. Small models (`gemma2:2b`, `qwen2.5:3b`) are much faster on CPU; larger ones (`gemma2:9b`, `llama3.1:8b`) give better answers if you have the VRAM.

## Common commands

```bash
docker compose ps                         # status + health
docker compose logs -f backend            # ingestion progress, errors
docker compose up -d --build              # rebuild after code changes
docker compose exec db psql -U athena_user -d athena_db
curl -s localhost:8000/health/ready       # {"status":"ok","database":"ok","llm":"ok"}
```

## Backups

```bash
# Database
docker compose exec -T db pg_dump -U athena_user athena_db > athena_db.sql

# Uploaded PDFs + vector index
docker run --rm -v athenaai_app_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/athena_data.tgz -C /data .
```

Restore with `psql` and by untarring into the volume. The model volumes don't need backups, since they can be pulled again.

## Upgrading

```bash
git pull
docker compose up -d --build
```

New tables are created on startup. Changes to existing tables need a migration; the project doesn't use Alembic yet, so for now that means a manual `ALTER TABLE` or a fresh database.

## Production checklist

- Strong `DB_PASSWORD` and a random 32+ character `SECRET_KEY` (`make env` generates both).
- TLS in front of port 3000 (Caddy, Traefik or a cloud load balancer).
- Pin `OLLAMA_VERSION` in `.env` instead of `latest`.
- Back up the `postgres_data` and `app_data` volumes regularly.
