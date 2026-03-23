FROM docker:cli AS docker-cli

FROM python:3.11-slim

# Copy docker CLI from official image so backend can spawn execution containers
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker

# Install curl for docker-compose healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
