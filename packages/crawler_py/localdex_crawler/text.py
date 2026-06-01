from __future__ import annotations

import re
import unicodedata

from bs4 import BeautifulSoup

import opencc

# 繁体→简体转换器（单例）
_T2S_CONVERTER = opencc.OpenCC("t2s")


def to_simplified(text: str | None) -> str | None:
    """将繁体中文转换为简体中文。"""
    if not text:
        return text
    return _T2S_CONVERTER.convert(text)


def normalize_text(html: str) -> str:
    soup = BeautifulSoup(html or "", "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    return unicodedata.normalize("NFKC", re.sub(r"\n{3,}", "\n\n", soup.get_text("\n"))).strip()


def clean_inline_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def clean_summary(value: str | None, max_length: int = 700) -> str | None:
    if not value:
        return None
    text = re.sub(r"\[[^\]]+\]", "", value)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"返回.*$", "", text).strip()
    if not text:
        return None
    return text if len(text) <= max_length else f"{text[:max_length].strip()}..."


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKC", value or "")
    text = re.sub(r"[^\w\u4e00-\u9fff]+", "-", text, flags=re.UNICODE)
    return text.strip("-").lower()


def normalize_type_name(value: str | None) -> str | None:
    text = clean_inline_text(value)
    return text or None


def normalize_category(value: str | None) -> str | None:
    """将招式分类标准化为简体中文（物理/特殊/变化）。"""
    text = clean_inline_text(value)
    mapping = {
        "物理": "物理", "physical": "物理",
        "特殊": "特殊", "special": "特殊",
        "变化": "变化", "變化": "变化", "status": "变化",
    }
    return mapping.get(text, mapping.get(text.lower())) if text else None


def normalize_power(value: str | None) -> int | None:
    text = clean_inline_text(value)
    return int(text) if re.fullmatch(r"\d+", text) else None


def normalize_pp(value: str | None) -> int | None:
    text = clean_inline_text(value)
    return int(text) if re.fullmatch(r"\d+", text) else None


def format_accuracy(value: str | None) -> int | None:
    """将命中率文本转换为整数（不含百分号），非数字返回 None。"""
    text = clean_inline_text(value)
    if not text:
        return None
    return int(text) if re.fullmatch(r"\d+", text) else None


def read_number(value: str | None) -> float | None:
    matched = re.search(r"(\d+(?:\.\d+)?)", value or "")
    return float(matched.group(1)) if matched else None


def unique_by_key(items, key_fn):
    seen = set()
    result = []
    for item in items:
        key = key_fn(item)
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result
