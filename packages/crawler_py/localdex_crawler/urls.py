from __future__ import annotations

from urllib.parse import quote

from .generations import generation_to_chinese


def build_move_page_url(name_zh: str) -> str:
    return f"https://wiki.52poke.com/wiki/{quote(name_zh + '（招式）')}"


def build_ability_page_url(name_zh: str) -> str:
    return f"https://wiki.52poke.com/wiki/{quote(name_zh + '（特性）')}"


def build_item_page_url(name_zh: str) -> str:
    return f"https://wiki.52poke.com/wiki/{quote(name_zh + '（道具）')}"


def build_pokemon_page_url(name_zh: str) -> str:
    return f"https://wiki.52poke.com/wiki/{quote(name_zh)}"


def build_learnset_page_url(name_zh: str, generation: int) -> str | None:
    # Champions 使用独立的 URL 格式：喷火龙/Champions招式表
    if generation == 99:
        return f"https://wiki.52poke.com/wiki/{quote(name_zh)}/{quote('Champions招式表')}"
    generation_text = generation_to_chinese(generation)
    if not generation_text:
        return None
    return f"https://wiki.52poke.com/wiki/{quote(name_zh)}/{quote(f'第{generation_text}世代招式表')}"


def to_absolute_url(href: str) -> str:
    if href.startswith("http"):
        return href
    if href.startswith("//"):
        return f"https:{href}"
    return f"https://wiki.52poke.com{href}"


def normalize_media_url(url: str) -> str:
    absolute = to_absolute_url(url)
    if "/thumb/" not in absolute:
        return absolute
    prefix, tail = absolute.split("/thumb/", 1)
    parts = tail.split("/")
    if len(parts) < 3:
        return absolute
    return f"{prefix}/{parts[0]}/{parts[1]}/{parts[2]}"
