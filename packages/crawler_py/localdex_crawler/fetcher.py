from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import time
from typing import Any
from urllib.parse import urlparse, urlencode, parse_qs, urlunparse

import requests


USER_AGENT = (
    "PokemonLocalDexCrawler/0.1 "
    "(local research cache; source https://wiki.52poke.com/)"
)


class PageNotFoundError(Exception):
    """Raised when a wiki page returns 404."""
    pass


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
    def __init__(
        self,
        raw_dir: Path,
        refresh_raw: bool = False,
        timeout: int = 30,
        request_interval: float = 1.0,
    ):
        self.raw_dir = raw_dir
        self.refresh_raw = refresh_raw
        self.timeout = timeout
        self.request_interval = request_interval
        self._last_request_time: float = 0
        self.raw_dir.mkdir(parents=True, exist_ok=True)

    def load_or_fetch(self, cache_key: str, url: str) -> RawPage:
        """加载缓存页面或从网络获取。

        如果页面返回 404，抛出 PageNotFoundError。
        """
        cache_path = self.raw_dir / f"{cache_key}.json"
        if cache_path.exists() and not self.refresh_raw:
            return RawPage.from_json(json.loads(cache_path.read_text(encoding="utf-8")))

        self._rate_limit()
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

    def _rate_limit(self) -> None:
        """确保两次网络请求之间有足够间隔。"""
        if self.request_interval <= 0:
            return
        elapsed = time.monotonic() - self._last_request_time
        if elapsed < self.request_interval:
            time.sleep(self.request_interval - elapsed)
        self._last_request_time = time.monotonic()

    @staticmethod
    def _ensure_zh_hans(url: str) -> str:
        """为 52pokewiki URL 追加 variant=zh-hans 参数，确保返回简体中文内容。"""
        parsed = urlparse(url)
        if "52poke.com" not in parsed.netloc:
            return url
        qs = parse_qs(parsed.query)
        if "variant" in qs:
            return url
        qs["variant"] = ["zh-hans"]
        new_query = urlencode(qs, doseq=True)
        return urlunparse(parsed._replace(query=new_query))

    def _fetch_html(self, url: str) -> str:
        """获取页面 HTML。404 时抛出 PageNotFoundError。"""
        url = self._ensure_zh_hans(url)
        try:
            response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=self.timeout)
            if response.status_code == 404:
                raise PageNotFoundError(f"Page not found: {url}")
            response.raise_for_status()
            response.encoding = response.encoding or "utf-8"
            return response.text
        except PageNotFoundError:
            raise
        except requests.RequestException:
            # Some macOS sandbox/Python combinations fail DNS while system curl works.
            try:
                completed = subprocess.run(
                    [
                        "curl",
                        "-L",
                        "-sS",
                        "--fail",
                        "-w", "%{http_code}",
                        "--connect-timeout",
                        str(min(self.timeout, 15)),
                        "--max-time",
                        str(max(self.timeout, 15)),
                        "-A",
                        USER_AGENT,
                        url,
                    ],
                    capture_output=True,
                )
                # curl --fail returns exit code 22 for HTTP errors >= 400
                if completed.returncode == 22:
                    raise PageNotFoundError(f"Page not found: {url}")
                completed.check_returncode()
                return completed.stdout.decode("utf-8", errors="replace")
            except subprocess.CalledProcessError as e:
                raise PageNotFoundError(f"Page not found: {url}") from e

    @staticmethod
    def _extract_title(html: str) -> str:
        start = html.lower().find("<title>")
        end = html.lower().find("</title>", start)
        if start < 0 or end < 0:
            return ""
        return html[start + len("<title>"):end].strip()
