from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class CrawlerPaths:
    root: Path = repo_root()

    @property
    def default_db_path(self) -> Path:
        return self.root / "data" / "sqlite" / "localdex.sqlite"

    @property
    def default_raw_dir(self) -> Path:
        return self.root / "data" / "raw"

