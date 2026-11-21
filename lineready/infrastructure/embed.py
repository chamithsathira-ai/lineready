"""Local text embeddings (BGE-small, 384 dims, ONNX on CPU). Free, no data leaves the server."""
from __future__ import annotations

import os
from functools import lru_cache

MODEL = "BAAI/bge-small-en-v1.5"
DIM = 384


@lru_cache(maxsize=1)
def _model():
    from fastembed import TextEmbedding
    # 4 threads measured fastest (265 texts/s); the default oversubscribes the CPU and runs ~15x slower.
    return TextEmbedding(MODEL, cache_dir=os.getenv("FASTEMBED_CACHE_PATH", "/opt/models"),
                         threads=int(os.getenv("EMBED_THREADS", "4")))


def embed(texts: list[str]) -> list[list[float]]:
    return [v.tolist() for v in _model().embed(texts, batch_size=64)]


def vec_literal(v: list[float]) -> str:
    """pgvector text form, passed as a parameter and cast with ::vector."""
    return "[" + ",".join(f"{x:.6f}" for x in v) + "]"
