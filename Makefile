# Shortcuts for the Docker stack. Run `make help` for the list.
COMPOSE     := docker compose
COMPOSE_GPU := docker compose -f docker-compose.yml -f docker-compose.gpu.yml

.PHONY: help env up gpu down logs ps health pull clean dev

help:            ## Show this help
	@grep -E '^[a-z]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-8s %s\n", $$1, $$2}'

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
