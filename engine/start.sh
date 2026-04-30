#!/bin/bash
echo "=== Engine Diagnostics ==="
echo "PORT env: ${PORT:-not set}"
echo "PWD: $(pwd)"
echo "Python: $(python --version)"
echo "Files in /app/engine/:"
ls -la /app/engine/
echo ""
echo "Testing import..."
python -c "from engine.api import app; print('Import OK')"
echo ""
echo "Testing health endpoint locally..."
python -c "
from engine.api import app
from fastapi.testclient import TestClient
client = TestClient(app)
r = client.get('/api/engine/health')
print(f'Health check: {r.status_code} {r.json()}')
"
echo ""
echo "Starting uvicorn on port 8000..."
exec python -m uvicorn engine.api:app --host 0.0.0.0 --port 8000 --log-level info
