#!/usr/bin/env bash
set -euo pipefail

# Function to check if Ollama is responding
check_ollama() {
    curl -s http://localhost:11434/api/tags >/dev/null
    return $?
}

# Start Ollama with llava-llama3 in the background
ollama run llava-llama3 &
OLLAMA_PID=$!
# Ensure background process is terminated on exit
trap 'kill $OLLAMA_PID' EXIT

# Wait for Ollama to be responsive
echo "Waiting for Ollama to initialize..."
while ! check_ollama; do
    sleep 1
done
echo "Ollama is ready!"

# Start the Node.js server
npm start
