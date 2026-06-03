"""PokéChamp DB (pokechamdb.com) 页面获取与缓存。

与 fetcher.py 中的 PageFetcher 类似，但针对 pokechamdb.com 的 Next.js App Router SPA。
该站点数据嵌入在 RSC payload（self.__next_f.push([1, "..."])）中，需要获取完整 HTML。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
import time
from typing import Any
from urllib.parse import urlencode

import requests


POKECHAMDB_BASE_URL = "https://pokechamdb.com/zh-Hans"

USER_AGENT = (
    "PokemonLocalDexCrawler/0.1 "
    "(local research cache; source https://pokechamdb.com/)"
)

# 默认请求间隔（秒），对第三方站点友好
# pokechamdb.com 是 Cloudflare Worker SSR，请求过快容易触发 1102 资源限制
DEFAULT_REQUEST_INTERVAL = 4.0
DEFAULT_TIMEOUT = 30


@dataclass(frozen=True)
class PokechamdbPage:
    """一个 pokechamdb 页面的原始缓存数据。"""

    url: str
    fetched_at: str
    html: str

    @classmethod
    def from_json(cls, payload: dict[str, Any]) -> "PokechamdbPage":
        return cls(
            url=str(payload.get("url") or ""),
            fetched_at=str(payload.get("fetchedAt") or payload.get("fetched_at") or ""),
            html=str(payload.get("html") or ""),
        )

    def to_json(self) -> dict[str, str]:
        return {
            "url": self.url,
            "fetchedAt": self.fetched_at,
            "html": self.html,
        }


@dataclass
class PokechamdbFetcher:
    """pokechamdb.com 的页面获取器，支持本地 JSON 缓存。"""

    raw_dir: Path
    refresh_raw: bool = False
    timeout: int = DEFAULT_TIMEOUT
    request_interval: float = DEFAULT_REQUEST_INTERVAL
    _last_request_time: float = field(default=0, init=False, repr=False)

    def __post_init__(self) -> None:
        self.raw_dir.mkdir(parents=True, exist_ok=True)

    def load_or_fetch(self, cache_key: str, url: str) -> PokechamdbPage:
        """加载缓存页面或从网络获取。"""
        cache_path = self.raw_dir / f"{cache_key}.json"
        if cache_path.exists() and not self.refresh_raw:
            return PokechamdbPage.from_json(
                json.loads(cache_path.read_text(encoding="utf-8"))
            )

        self._rate_limit()
        html = self._fetch_html(url)
        page = PokechamdbPage(
            url=url,
            fetched_at=datetime.now(timezone.utc).isoformat(),
            html=html,
        )
        cache_path.write_text(
            json.dumps(page.to_json(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return page

    def fetch_usage_list(self, season: str, fmt: str, event_id: str | None = None) -> PokechamdbPage:
        """获取使用率排名列表页。

        Args:
            season: 赛季编码，如 "M-2"
            fmt: 对战模式，如 "single", "double", "tournament"
            event_id: 赛事 ID（仅 tournament 格式需要）
        """
        params: dict[str, str] = {
            "format": fmt,
            "season": season,
            "view": "pokemon",
        }
        if event_id:
            params["event"] = event_id
        url = f"{POKECHAMDB_BASE_URL}?{urlencode(params)}"
        cache_key = self._list_cache_key(season, fmt, event_id)
        return self.load_or_fetch(cache_key, url)

    def fetch_pokemon_detail(
        self, slug: str, season: str, fmt: str, event_id: str | None = None
    ) -> PokechamdbPage:
        """获取单个宝可梦的使用率详情页。

        Args:
            slug: 宝可梦 slug，如 "garchomp"
            season: 赛季编码
            fmt: 对战模式
            event_id: 赛事 ID
        """
        params: dict[str, str] = {
            "season": season,
            "format": fmt,
        }
        if event_id:
            params["event"] = event_id
        url = f"{POKECHAMDB_BASE_URL}/pokemon/{slug}?{urlencode(params)}"
        cache_key = self._detail_cache_key(slug, season, fmt, event_id)
        return self.load_or_fetch(cache_key, url)

    def _rate_limit(self) -> None:
        """确保两次网络请求之间有足够间隔。"""
        if self.request_interval <= 0:
            return
        elapsed = time.monotonic() - self._last_request_time
        if elapsed < self.request_interval:
            time.sleep(self.request_interval - elapsed)
        self._last_request_time = time.monotonic()

    def _fetch_html(self, url: str) -> str:
        """获取页面 HTML 内容。

        pokechamdb.com 可能有 bot 保护（Cloudflare/Vercel），
        所以使用完整的浏览器 headers，并在 requests 失败时 fallback 到 curl。
        """
        # pokechamdb.com 有 bot 保护，优先使用 curl（支持 brotli 解压）
        # requests 库默认不支持 brotli 且 403 概率高
        try:
            return self._fetch_html_curl(url)
        except Exception:
            # Fallback: try requests with browser-like headers (不设 Accept-Encoding 让 requests 自行处理)
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
            }
            response = requests.get(url, headers=headers, timeout=self.timeout)
            response.raise_for_status()
            response.encoding = response.encoding or "utf-8"
            return response.text

    def _fetch_html_curl(self, url: str) -> str:
        """使用 curl 获取页面（绕过部分 bot 检测）。"""
        import subprocess

        result = subprocess.run(
            [
                "curl",
                "-L",
                "-sS",
                "--compressed",
                "--connect-timeout", str(min(self.timeout, 15)),
                "--max-time", str(max(self.timeout, 30)),
                "-H", "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "-H", "Accept-Language: zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
                "-H", "Sec-Fetch-Dest: document",
                "-H", "Sec-Fetch-Mode: navigate",
                "-H", "Sec-Fetch-Site: none",
                url,
            ],
            capture_output=True,
        )
        result.check_returncode()
        return result.stdout.decode("utf-8", errors="replace")

    @staticmethod
    def _list_cache_key(season: str, fmt: str, event_id: str | None) -> str:
        base = f"pokechamdb-usage-{season}-{fmt}"
        if event_id:
            base += f"-{event_id}"
        return base

    @staticmethod
    def _detail_cache_key(slug: str, season: str, fmt: str, event_id: str | None) -> str:
        base = f"pokechamdb-detail-{slug}-{season}-{fmt}"
        if event_id:
            base += f"-{event_id}"
        return base
