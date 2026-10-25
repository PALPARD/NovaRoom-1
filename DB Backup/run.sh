#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-5050}"

echo "=============================================="
echo "      MongoDB Backup & Migration Helper       "
echo "=============================================="
echo "Starting web helper at: http://localhost:${PORT}"
echo "Press Ctrl+C to stop the server."
echo "=============================================="

python3 "${DIR}/server.py" --port "${PORT}"
