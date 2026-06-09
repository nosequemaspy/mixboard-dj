#!/bin/bash
set -e

echo "=== MixBoard Setup ==="

# Backend
echo "Setting up backend..."
cd "$(dirname "$0")/../backend"
python3 -m venv ../venv 2>/dev/null || python -m venv ../venv
source ../venv/bin/activate
pip install -r requirements.txt

# Frontend
echo "Setting up frontend..."
cd "$(dirname "$0")/../frontend"
npm install

echo "=== Setup complete ==="
echo "Run ./scripts/start.sh to start the application"
