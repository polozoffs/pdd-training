# Multi-stage Dockerfile for PDD Application
# Production-ready configuration for remote deployment

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# Copy package files and install dependencies (including dev dependencies for build)
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

# Copy frontend source and build
COPY frontend/ ./
RUN npm run build

# Stage 2: Production
FROM python:3.11-slim

# Install system dependencies and curl for health checks
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r pddapp && useradd -r -g pddapp pddapp

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy data directory (questions and images)
COPY data/ ./data/

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create startup script with proper production settings
RUN echo '#!/bin/sh\n\
set -e\n\
cd /app/backend\n\
exec uvicorn main:app \\\n\
  --host 0.0.0.0 \\\n\
  --port 8000 \\\n\
  --workers 2 \\\n\
  --log-level info\n\
' > /app/start.sh && chmod +x /app/start.sh

# Set proper permissions
RUN chown -R pddapp:pddapp /app

# Switch to non-root user
USER pddapp

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8000/api/stats || exit 1

CMD ["/app/start.sh"]
