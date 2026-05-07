#!/bin/bash
cd "$(dirname "$0")"
echo "🍞 Avvio Breaking Bread..."
lsof -ti:8001 | xargs kill -9 2>/dev/null || true
echo "Apri il browser su: http://localhost:8001"
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
