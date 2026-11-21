# Two images from one file:
#   --target build   laptop/CI: parses the data pack, computes embeddings, exports the knowledge-base file
#   (default) runtime   server: API only, no parsers, no model (embeddings are precomputed in the KB file)

FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
COPY requirements.txt .
RUN pip install -r requirements.txt && useradd --create-home --uid 10001 app

FROM base AS build
COPY requirements-build.txt .
RUN pip install -r requirements-build.txt
ENV FASTEMBED_CACHE_PATH=/opt/models
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5', cache_dir='/opt/models')" \
    && chmod -R a+rX /opt/models
COPY . .
RUN chown -R app /app
USER app
CMD ["uvicorn", "lineready.interfaces.api:app", "--host", "0.0.0.0", "--port", "8000"]

FROM base AS runtime
COPY lineready ./lineready
USER app
EXPOSE 8000
CMD ["uvicorn", "lineready.interfaces.api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers"]
