"""Runtime configuration, read once from the environment."""
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "postgresql://lineready:lineready@localhost:5433/lineready")
    data_core: Path = Path(os.getenv("DATA_CORE", "../01 Core"))
    data_supp: Path = Path(os.getenv("DATA_SUPP", "../02 Supplementary"))
    cache_dir: Path = Path(os.getenv("CACHE_DIR", "var"))
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    llm_model: str = os.getenv("LLM_MODEL", "claude-opus-5-5")
    demo_now: datetime = datetime.fromisoformat(os.getenv("DEMO_NOW", "2026-11-20T21:00:00"))
    station: str = os.getenv("STATION", "SHJ")
    llm_narrate_top: int = int(os.getenv("LLM_NARRATE_TOP", "5"))   # AI summaries per brief (token budget)

    @property
    def llm_enabled(self) -> bool:
        return bool(self.anthropic_api_key)


settings = Settings()
