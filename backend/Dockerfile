FROM ghcr.io/astral-sh/uv:python3.11-alpine

WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy the dependency lock files
COPY backend/pyproject.toml backend/uv.lock ./

# Install dependencies without installing the project itself
RUN uv sync --frozen --no-install-project

# Copy application source
COPY backend/ .

# Install the project
RUN uv sync --frozen

# Install gunicorn for production process manager
RUN uv pip install gunicorn

# Expose port (Railway/Render inject PORT; defaults to 8000 locally)
ENV PORT=8000 WEB_CONCURRENCY=2
EXPOSE 8000

# Run backend using gunicorn. Shell form so $PORT / $WEB_CONCURRENCY expand.
CMD exec /app/.venv/bin/gunicorn app.main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:${PORT} --workers ${WEB_CONCURRENCY} --timeout 120
