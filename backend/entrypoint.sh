#!/bin/bash
set -e

echo "→ Esperando Postgres..."
until pg_isready -h postgres -U "${POSTGRES_USER:-finanzas}" -d "${POSTGRES_DB:-finanzas}" -q; do
  sleep 1
done
echo "✓ Postgres listo"

echo "→ Inicializando..."
uv run python -m app.scripts.bootstrap

echo "→ Iniciando servidor..."
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
