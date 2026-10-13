# Shortcuts for the Docker stack. Run `make help` for the list.
COMPOSE     := docker compose
COMPOSE_GPU := docker compose -f docker-compose.yml -f docker-compose.gpu.yml

.PHONY: help env up gpu down logs ps health pull clean dev test test-backend test-frontend test-e2e

help:            ## Show this help
	@grep -E '^[a-z0-9-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-14s %s\n", $$1, $$2}'

env:             ## Create .env with freshly generated secrets
	@test -f .env && echo ".env already exists" || ( \
		sed -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$$(openssl rand -hex 16)|" \
		    -e "s|^SECRET_KEY=.*|SECRET_KEY=$$(openssl rand -base64 48 | tr -d '\n/+=')|" \
		    .env.example > .env && echo "Created .env" )

up: env          ## Build and start everything (CPU)
	$(COMPOSE) up -d --build

gpu: env         ## Build and start everything on an NVIDIA GPU
	$(COMPOSE_GPU) up -d --build

down:            ## Stop the stack (data is kept)
	$(COMPOSE) down

logs:            ## Follow backend logs
	$(COMPOSE) logs -f backend

ps:              ## Show container status
	$(COMPOSE) ps

health:          ## Check that the API, database and LLM are ready
	@curl -s http://localhost:$${API_PORT:-8000}/health/ready; echo

pull:            ## Pull another Ollama model, e.g. make pull MODEL=llama3.1:8b
	$(COMPOSE) exec ollama ollama pull $(MODEL)

clean:           ## Stop the stack and DELETE all data (users, documents, models)
	$(COMPOSE) down -v

dev:             ## Local dev: db + ollama in Docker, backend and frontend with hot reload
	./start.sh

test: test-backend test-frontend  ## Run all unit + integration tests (in Docker, nothing to install)

test-backend:    ## Backend unit + integration tests (pytest, with coverage)
	docker build -q --target test -t athenaai-backend:test ./backend
	docker run --rm athenaai-backend:test python -m pytest backend/tests -p no:cacheprovider --cov=backend --cov-report=term-missing:skip-covered

test-frontend:   ## Frontend tests (Vitest), in a throwaway Node container
	docker run --rm -v "$$PWD":/src:ro node:22-alpine sh -c '\
		mkdir /app && cd /src && tar cf - --exclude=node_modules --exclude=dist --exclude=coverage . | tar xf - -C /app && \
		cd /app && npm ci --no-audit --no-fund --loglevel=error && npm run lint && npm test'

test-e2e:        ## End-to-end tests against the running stack (real models; run `make up` first)
	docker build -q --target test -t athenaai-backend:test ./backend
	docker run --rm --network host -e ATHENA_E2E_URL=http://localhost:$${APP_PORT:-3000}/api \
		athenaai-backend:test python -m pytest backend/tests/e2e -v -p no:cacheprovider
