from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata
from urllib.parse import quote

from bs4 import BeautifulSoup, Tag


POKEMON_LIST_URL = "https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E5%85%A8%E5%9B%BD%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89/%E7%AE%80%E5%8D%95%E7%89%88"
ITEM_LIST_URL = "https://wiki.52poke.com/wiki/%E9%81%93%E5%85%B7%E5%88%97%E8%A1%A8"
MOVE_LIST_URL = "https://wiki.52poke.com/wiki/%E6%8B%9B%E5%BC%8F%E5%88%97%E8%A1%A8"
ABILITY_LIST_URL = "https://wiki.52poke.com/wiki/%E7%89%B9%E6%80%A7%E5%88%97%E8%A1%A8"

TYPE_ALIASES = {
    "電": "电",
    "飛行": "飞行",
    "蟲": "虫",
    "龍": "龙",
    "惡": "恶",
    "鋼": "钢",
    "格鬥": "格斗",
    "幽靈": "幽灵",
}
POKEMON_TYPES = {
    "一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面",
    "飞行", "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精",
}
MOVE_CATEGORIES = {"physical", "special", "status"}

# 游戏版本名 → 世代映射（用于解析"特性变更"/"招式变更"章节中的游戏版本子标题）
GAME_VERSION_GENERATION: dict[str, int] = {
    "红绿蓝": 1, "紅綠藍": 1, "红绿": 1, "紅綠": 1, "皮卡丘": 1,
    "金银": 2, "金銀": 2, "水晶": 2,
    "红宝石": 3, "紅寶石": 3, "蓝宝石": 3, "藍寶石": 3, "绿宝石": 3, "綠寶石": 3,
    "火红": 3, "火紅": 3, "叶绿": 3, "葉綠": 3,
    "钻石": 4, "鑽石": 4, "珍珠": 4, "白金": 4,
    "心金": 4, "魂银": 4, "魂銀": 4,
    "黑": 5, "白": 5, "黑2": 5, "白2": 5,
    "X": 6, "Y": 6, "欧米伽红宝石": 6, "歐米伽紅寶石": 6, "阿尔法蓝宝石": 6, "阿爾法藍寶石": 6,
    "太阳": 7, "太陽": 7, "月亮": 7, "究极之日": 7, "究極之日": 7, "究极之月": 7, "究極之月": 7,
    "Let's Go! 皮卡丘": 7, "Let's Go! 伊布": 7,
    "剑": 8, "劍": 8, "盾": 8, "劍／盾": 8, "剑／盾": 8,
    "晶灿钻石": 8, "晶燦鑽石": 8, "明亮珍珠": 8, "晶灿钻石／明亮珍珠": 8,
    "传说 阿尔宙斯": 8, "傳說 阿爾宙斯": 8,
    "朱": 9, "紫": 9, "朱／紫": 9, "零之秘宝": 9,
    "Champions": 8,
}

CHINESE_GENERATIONS = {
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
}
GENERATION_NAMES = {value: key for key, value in CHINESE_GENERATIONS.items()}


@dataclass(frozen=True)
class ImageAsset:
    url: str
    alt: str | None = None
    source_url: str | None = None


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKC", value or "")
    text = re.sub(r"[^\w\u4e00-\u9fff]+", "-", text, flags=re.UNICODE)
    return text.strip("-").lower()


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


def normalize_type_name(value: str | None) -> str | None:
    text = clean_inline_text(value)
    return TYPE_ALIASES.get(text, text) or None


def normalize_category(value: str | None) -> str | None:
    text = clean_inline_text(value)
    if text == "物理":
        return "physical"
    if text == "特殊":
        return "special"
    if text == "变化":
        return "status"
    return text.lower() if text else None


def normalize_power(value: str | None) -> int | None:
    text = clean_inline_text(value)
    return int(text) if re.fullmatch(r"\d+", text) else None


def normalize_pp(value: str | None) -> int | None:
    text = clean_inline_text(value)
    return int(text) if re.fullmatch(r"\d+", text) else None


def format_accuracy(value: str | None) -> str | None:
    text = clean_inline_text(value)
    if not text:
        return None
    return f"{text}%" if re.fullmatch(r"\d+", text) else text


def read_number(value: str | None) -> float | None:
    matched = re.search(r"(\d+(?:\.\d+)?)", value or "")
    return float(matched.group(1)) if matched else None


def generation_from_heading(value: str | None) -> int | None:
    matched = re.search(r"第([一二三四五六七八九])世代", value or "")
    return CHINESE_GENERATIONS.get(matched.group(1)) if matched else None


def generation_to_chinese(value: int) -> str | None:
    return GENERATION_NAMES.get(value)


def build_move_page_url(name_zh: str) -> str:
    return f"https://wiki.52poke.com/wiki/{quote(name_zh + '（招式）')}"


def build_ability_page_url(name_zh: str) -> str:
    return f"https://wiki.52poke.com/wiki/{quote(name_zh + '（特性）')}"


def build_item_page_url(name_zh: str) -> str:
    return f"https://wiki.52poke.com/wiki/{quote(name_zh + '（道具）')}"


def build_pokemon_page_url(name_zh: str) -> str:
    return f"https://wiki.52poke.com/wiki/{quote(name_zh)}"


def build_learnset_page_url(name_zh: str, generation: int) -> str | None:
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


def section_text_by_heading(html: str, heading: str, level: int = 2) -> str:
    soup = BeautifulSoup(html or "", "html.parser")
    heading_tag = None
    for tag in soup.find_all(f"h{level}"):
        if heading in tag.get_text(" ", strip=True):
            heading_tag = tag
            break
    if not heading_tag:
        return ""
    chunks: list[str] = []
    for sibling in heading_tag.next_siblings:
        if isinstance(sibling, Tag) and sibling.name == f"h{level}":
            break
        if isinstance(sibling, Tag):
            chunks.append(sibling.get_text("\n", strip=True))
        elif str(sibling).strip():
            chunks.append(str(sibling).strip())
    return "\n".join(item for item in chunks if item).strip()


def extract_intro_names(text: str, fallback_name_zh: str) -> tuple[str | None, str | None]:
    escaped = re.escape(fallback_name_zh)
    matched = re.search(
        rf"{escaped}[\s\S]{{0,80}}?日文[︰:：]\s*([^，,）\n]+)[\s\S]{{0,80}}?英文[︰:：]\s*([^，,）\n]+)",
        text,
    )
    if not matched:
        return None, None
    return matched.group(1).strip(), matched.group(2).strip()


def generation_from_game_version(line: str) -> int | None:
    """从游戏版本名（如"《白金》"、"《劍／盾》"）推断世代编号。"""
    matched = re.search(r"[《「](.+?)[》」]", line)
    if not matched:
        return None
    version_name = matched.group(1).strip()
    # 先尝试完整匹配
    if version_name in GAME_VERSION_GENERATION:
        return GAME_VERSION_GENERATION[version_name]
    # 再尝试部分匹配（如"劍／盾"匹配"劍"）
    for key, gen in GAME_VERSION_GENERATION.items():
        if key in version_name or version_name in key:
            return gen
    return None


def detect_generation_marker(line: str) -> int | None:
    """从行文本中检测世代标记，支持"第X世代"和游戏版本名两种格式。"""
    generation = generation_from_heading(line)
    if generation:
        return generation
    return generation_from_game_version(line)


def extract_generation_changes(html: str, heading: str) -> list[dict[str, object]]:
    section = section_text_by_heading(html, heading)
    if not section:
        return []
    records: list[dict[str, object]] = []
    current_generation: int | None = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal buffer
        if current_generation and buffer:
            summary = clean_summary(" ".join(buffer), 500)
            if summary:
                records.append({"generation": current_generation, "summary": summary})
        buffer = []

    for line in [item.strip() for item in section.splitlines() if item.strip()]:
        generation = detect_generation_marker(line)
        if generation:
            flush()
            current_generation = generation
            continue
        if current_generation and not line.isdigit():
            buffer.append(line)
    flush()
    return unique_by_key(records, lambda item: f"{item['generation']}|{item['summary']}")


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
