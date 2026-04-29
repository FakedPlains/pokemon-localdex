from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata
from urllib.parse import quote

from bs4 import BeautifulSoup, Tag
import opencc

# 繁体→简体转换器（单例）
_T2S_CONVERTER = opencc.OpenCC("t2s")


def to_simplified(text: str | None) -> str | None:
    """将繁体中文转换为简体中文。"""
    if not text:
        return text
    return _T2S_CONVERTER.convert(text)


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

# 游戏版本名 → (世代, game_version_code) 映射
# 用于解析"特性变更"/"招式变更"章节中的游戏版本子标题
GAME_VERSION_INFO: dict[str, tuple[int, str]] = {
    "红绿蓝": (1, "RG"), "紅綠藍": (1, "RG"), "红绿": (1, "RG"), "紅綠": (1, "RG"),
    "皮卡丘": (1, "Y"), "黄": (1, "Y"),
    "金银": (2, "GS"), "金銀": (2, "GS"), "水晶": (2, "C"),
    "红宝石": (3, "RS"), "紅寶石": (3, "RS"), "蓝宝石": (3, "RS"), "藍寶石": (3, "RS"),
    "绿宝石": (3, "E"), "綠寶石": (3, "E"),
    "火红": (3, "FRLG"), "火紅": (3, "FRLG"), "叶绿": (3, "FRLG"), "葉綠": (3, "FRLG"),
    "钻石": (4, "DP"), "鑽石": (4, "DP"), "珍珠": (4, "DP"),
    "白金": (4, "Pt"),
    "心金": (4, "HGSS"), "魂银": (4, "HGSS"), "魂銀": (4, "HGSS"),
    "黑": (5, "BW"), "白": (5, "BW"), "黑2": (5, "B2W2"), "白2": (5, "B2W2"),
    "X": (6, "XY"), "Y": (6, "XY"),
    "欧米伽红宝石": (6, "ORAS"), "歐米伽紅寶石": (6, "ORAS"),
    "阿尔法蓝宝石": (6, "ORAS"), "阿爾法藍寶石": (6, "ORAS"),
    "太阳": (7, "SM"), "太陽": (7, "SM"), "月亮": (7, "SM"),
    "究极之日": (7, "USUM"), "究極之日": (7, "USUM"),
    "究极之月": (7, "USUM"), "究極之月": (7, "USUM"),
    "Let's Go! 皮卡丘": (7, "LPLE"), "Let's Go! 伊布": (7, "LPLE"),
    "剑": (8, "SWSH"), "劍": (8, "SWSH"), "盾": (8, "SWSH"),
    "劍／盾": (8, "SWSH"), "剑／盾": (8, "SWSH"),
    "晶灿钻石": (8, "BDSP"), "晶燦鑽石": (8, "BDSP"), "明亮珍珠": (8, "BDSP"),
    "晶灿钻石／明亮珍珠": (8, "BDSP"),
    "传说 阿尔宙斯": (8, "LA"), "傳說 阿爾宙斯": (8, "LA"),
    "朱": (9, "SV"), "紫": (9, "SV"), "朱／紫": (9, "SV"),
    "零之秘宝": (9, "SVT"),
    "Champions": (99, "CHAMP"),
}
# 向后兼容：仅世代映射
GAME_VERSION_GENERATION: dict[str, int] = {k: v[0] for k, v in GAME_VERSION_INFO.items()}

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


def extract_battle_effect(html: str, parent_heading: str = "特性效果") -> str:
    """从特性详情页提取「对战中」的效果描述。

    页面结构有三种情况：
    1. h2「特性效果」下有 h3「对战中」/「對戰中」子标题 → 只取该 h3 到下一个 h3/h2 之间的内容
    2. h2「特性效果」下有其他 h3 子标题但没有「对战中」→ 取 h2 到第一个 h3 之间的内容（即对战部分）
    3. h2「特性效果」下没有任何 h3 子标题 → 取整个 h2 章节内容
    """
    soup = BeautifulSoup(html or "", "html.parser")

    # 找到 h2「特性效果」
    parent_tag = None
    for tag in soup.find_all("h2"):
        if parent_heading in tag.get_text(" ", strip=True):
            parent_tag = tag
            break
    if not parent_tag:
        return ""

    # 先尝试找 h3「对战中」/「對戰中」
    battle_h3 = None
    for sibling in parent_tag.next_siblings:
        if isinstance(sibling, Tag) and sibling.name == "h2":
            break
        if isinstance(sibling, Tag) and sibling.name == "h3":
            heading_text = sibling.get_text(" ", strip=True)
            if "对战中" in heading_text or "對戰中" in heading_text:
                battle_h3 = sibling
                break

    if battle_h3:
        # 情况 1：取 h3「对战中」到下一个 h3/h2 之间的内容
        chunks: list[str] = []
        for sibling in battle_h3.next_siblings:
            if isinstance(sibling, Tag) and sibling.name in ("h2", "h3"):
                break
            if isinstance(sibling, Tag):
                chunks.append(sibling.get_text("\n", strip=True))
            elif str(sibling).strip():
                chunks.append(str(sibling).strip())
        return "\n".join(item for item in chunks if item).strip()

    # 没有「对战中」h3，检查是否有其他 h3 子标题
    has_h3 = False
    for sibling in parent_tag.next_siblings:
        if isinstance(sibling, Tag) and sibling.name == "h2":
            break
        if isinstance(sibling, Tag) and sibling.name == "h3":
            has_h3 = True
            break

    chunks = []
    for sibling in parent_tag.next_siblings:
        if isinstance(sibling, Tag) and sibling.name == "h2":
            break
        if has_h3 and isinstance(sibling, Tag) and sibling.name == "h3":
            # 情况 2：遇到第一个 h3 就停止（h3 之前的内容就是对战效果）
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


def generation_from_game_version(line: str) -> tuple[int, str] | None:
    """从游戏版本名（如"《白金》"、"《劍／盾》"）推断 (世代编号, game_version_code)。

    只有当行的主要内容就是版本名时才识别为标记。
    如果行中除了版本名还有大量其他文字，则不视为标记行。
    """
    matched = re.search(r"[《「](.+?)[》」]", line)
    if not matched:
        return None
    version_name = matched.group(1).strip()
    # 去掉版本名及书名号后，检查剩余内容长度
    remaining = line[:matched.start()] + line[matched.end():]
    remaining = re.sub(r"[\s《》「」]+", "", remaining)
    # 如果剩余内容超过 4 个字符，说明这行不是纯标题行
    if len(remaining) > 4:
        return None
    # 先尝试完整匹配
    if version_name in GAME_VERSION_INFO:
        return GAME_VERSION_INFO[version_name]
    # 再尝试部分匹配（如"劍／盾"匹配"劍"）
    for key, info in GAME_VERSION_INFO.items():
        if key in version_name or version_name in key:
            return info
    return None


def detect_generation_marker(line: str) -> tuple[int, str | None] | None:
    """从行文本中检测世代标记，支持"第X世代"和游戏版本名两种格式。
    返回 (generation, game_version_code) 或 None。
    世代格式时 game_version_code 为 None。
    """
    generation = generation_from_heading(line)
    if generation:
        return (generation, None)
    result = generation_from_game_version(line)
    if result:
        return result
    return None


def _rejoin_split_markers(text: str) -> str:
    """将被换行拆开的书名号标记和分数合并回来。

    例如 "《\\n黑２／白２\\n》\\n描述" -> "《黑２／白２》\\n描述"
    例如 "1\\n⁄\\n16" -> "1⁄16"
    """
    # 合并 《...》 中被换行拆开的内容
    text = re.sub(r"《\s*\n\s*(.+?)\s*\n\s*》", r"《\1》", text)
    # 合并 「...」 中被换行拆开的内容
    text = re.sub(r"「\s*\n\s*(.+?)\s*\n\s*」", r"「\1」", text)
    # 合并被换行拆开的分数：数字\n⁄\n数字 -> 数字⁄数字
    text = re.sub(r"(\d+)\s*\n\s*⁄\s*\n\s*(\d+)", r"\1⁄\2", text)
    return text


def extract_generation_changes(html: str, heading: str) -> list[dict[str, object]]:
    section = section_text_by_heading(html, heading)
    if not section:
        return []
    # 预处理：合并被换行拆开的书名号标记
    section = _rejoin_split_markers(section)
    records: list[dict[str, object]] = []
    current_generation: int | None = None
    current_game_version: str | None = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal buffer
        if current_generation and buffer:
            summary = clean_summary(" ".join(buffer), 500)
            if summary:
                record: dict[str, object] = {
                    "generation": current_generation,
                    "summary": summary,
                }
                if current_game_version:
                    record["game_version_code"] = current_game_version
                records.append(record)
        buffer = []

    for line in [item.strip() for item in section.splitlines() if item.strip()]:
        marker = detect_generation_marker(line)
        if marker:
            flush()
            current_generation, current_game_version = marker
            continue
        if current_generation and not line.isdigit():
            buffer.append(line)
    flush()
    return unique_by_key(records, lambda item: f"{item['generation']}|{item.get('game_version_code', '')}|{item['summary']}")


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
