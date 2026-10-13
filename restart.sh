#!/bin/bash
# Restart the local development servers started by start.sh

echo "🛑 Stopping local dev servers..."
pkill -f "uvicorn backend.main:app" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 2

echo "🚀 Starting services..."
exec "$(dirname "$0")/start.sh"
