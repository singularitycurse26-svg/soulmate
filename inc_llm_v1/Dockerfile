FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml setup.py ./
RUN pip install --no-cache-dir -e ".[full]"

COPY . .

EXPOSE 8547

CMD ["uvicorn", "inc_llm.server:app", "--host", "0.0.0.0", "--port", "8547"]
