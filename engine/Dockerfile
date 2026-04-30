FROM python:3.12-slim

WORKDIR /app

COPY engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY engine/ ./engine/
RUN chmod +x /app/engine/start.sh

# Verify import at build time
RUN python -c "from engine.api import app; print('Import OK')"

EXPOSE 8000

CMD ["/bin/bash", "/app/engine/start.sh"]
