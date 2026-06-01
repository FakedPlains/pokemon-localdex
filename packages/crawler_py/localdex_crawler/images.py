from __future__ import annotations

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

from .urls import normalize_media_url


@dataclass(frozen=True)
class ImageAsset:
    url: str
    alt: str | None = None
    source_url: str | None = None


def extract_file_name(url: str) -> str:
    file_name = url.split("?", 1)[0].split("#", 1)[0].rstrip("/").split("/")[-1]
    return re.sub(r"^\d+px-", "", file_name)


def extract_image_candidates(html: str) -> list[str]:
    soup = BeautifulSoup(html or "", "html.parser")
    urls: set[str] = set()
    for tag in soup.find_all(["img", "source"]):
        values: list[str] = []
        for attr in ("src", "data-src"):
            if tag.get(attr):
                values.append(str(tag.get(attr)))
        if tag.get("srcset"):
            values.extend(item.strip().split()[0] for item in str(tag.get("srcset")).split(",") if item.strip())
        for value in values:
            url = normalize_media_url(value.strip())
            file_name = extract_file_name(url)
            if not re.search(r"\.(png|jpe?g|webp|gif|svg)$", file_name, re.I):
                continue
            if re.search(r"favicon|logo|spritecss|wiki\.png|commons-logo|poweredby_mediawiki|blank\.png", file_name, re.I):
                continue
            urls.add(url)
    return sorted(urls)
