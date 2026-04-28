from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
from typing import Any

import requests


USER_AGENT = (
    "PokemonLocalDexCrawler/0.1 "
    "(local research cache; source https://wiki.52poke.com/)"
)


@dataclass(frozen=True)
class RawPage:
    url: str
    title: str
    fetched_at: str
    html: str

    @classmethod
    def from_json(cls, payload: dict[str, Any]) -> "RawPage":
        return cls(
            url=str(payload.get("url") or ""),
            title=str(payload.get("title") or ""),
            fetched_at=str(payload.get("fetchedAt") or payload.get("fetched_at") or ""),
            html=str(payload.get("html") or ""),
        )

    def to_json(self) -> dict[str, str]:
        return {
            "url": self.url,
            "title": self.title,
            "fetchedAt": self.fetched_at,
            "html": self.html,
        }


class PageFetcher:
    def __init__(self, raw_dir: Path, refresh_raw: bool = False, timeout: int = 30):
        self.raw_dir = raw_dir
        self.refresh_raw = refresh_raw
        self.timeout = timeout
        self.raw_dir.mkdir(parents=True, exist_ok=True)

    def load_or_fetch(self, cache_key: str, url: str) -> RawPage:
        cache_path = self.raw_dir / f"{cache_key}.json"
        if cache_path.exists() and not self.refresh_raw:
            return RawPage.from_json(json.loads(cache_path.read_text(encoding="utf-8")))

        html = self._fetch_html(url)
        page = RawPage(
            url=url,
            title=self._extract_title(html),
            fetched_at=datetime.now(timezone.utc).isoformat(),
            html=html,
        )
        cache_path.write_text(
            json.dumps(page.to_json(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return page

    def _fetch_html(self, url: str) -> str:
        try:
            response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=self.timeout)
            response.raise_for_status()
            response.encoding = response.encoding or "utf-8"
            return response.text
        except requests.RequestException:
            # Some macOS sandbox/Python combinations fail DNS while system curl works.
            completed = subprocess.run(
                [
                    "curl",
                    "-L",
                    "-sS",
                    "--fail",
                    "--connect-timeout",
                    str(min(self.timeout, 15)),
                    "--max-time",
                    str(max(self.timeout, 15)),
                    "-A",
                    USER_AGENT,
                    url,
                ],
                check=True,
                capture_output=True,
            )
            return completed.stdout.decode("utf-8", errors="replace")

    @staticmethod
    def _extract_title(html: str) -> str:
        start = html.lower().find("<title>")
        end = html.lower().find("</title>", start)
        if start < 0 or end < 0:
            return ""
        return html[start + len("<title>"):end].strip()
