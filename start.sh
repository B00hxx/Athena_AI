#!/bin/bash
# Local development: Postgres + Ollama in Docker, backend and frontend on the host with hot reload.
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "No .env found: copy .env.example to .env and fill in DB_PASSWORD and SECRET_KEY first."
    exit 1
fi

# Function to handle cleanup on exit
cleanup() {
    echo "Stopping all services..."
    kill $(jobs -p) 2>/dev/null
    exit
}

# Trap SIGINT (Ctrl+C) and call cleanup
trap cleanup SIGINT SIGTERM

echo "Starting Postgres and Ollama (Docker)..."
docker compose up -d db ollama ollama-pull

echo "Starting Backend..."
(
    if [ ! -d "backend/venv" ]; then
        echo "Creating virtual environment..."
        python3 -m venv backend/venv
        source backend/venv/bin/activate
        echo "Installing dependencies (PyTorch first, then the rest)..."
        pip install torch==2.9.1
        pip install -r backend/requirements.txt
    else
        source backend/venv/bin/activate
    fi
    # Run uvicorn from the project root so 'backend' is treated as a package
    uvicorn backend.main:app --reload --reload-dir backend --host 0.0.0.0 --port 8000
) &

echo "Starting Frontend..."
if [ ! -d "node_modules" ]; then
    npm install
fi
npm run dev

# Wait for all background processes
wait
