from __future__ import annotations

import re

from bs4 import BeautifulSoup, Tag

from .constants import CHINESE_GENERATIONS, GENERATION_NAMES, GAME_VERSION_INFO
from .text import clean_inline_text, clean_summary, unique_by_key


def generation_from_dex_number(dex_number: int) -> int:
    """根据全国图鉴编号推断初登场世代。

    使用每个世代最后一个编号的精确分界：
    第1世代: 001-151 (151只)
    第2世代: 152-251 (100只)
    第3世代: 252-386 (135只)
    第4世代: 387-493 (107只)
    第5世代: 494-649 (156只)
    第6世代: 650-721 (72只)
    第7世代: 722-809 (88只)
    第8世代: 810-905 (96只)
    第9世代: 906-1025 (120只)
    """
    if dex_number <= 151:
        return 1
    if dex_number <= 251:
        return 2
    if dex_number <= 386:
        return 3
    if dex_number <= 493:
        return 4
    if dex_number <= 649:
        return 5
    if dex_number <= 721:
        return 6
    if dex_number <= 809:
        return 7
    if dex_number <= 905:
        return 8
    if dex_number <= 1025:
        return 9
    # 未来世代（第10世代+）暂时返回 10
    return 10


def generation_from_heading(value: str | None) -> int | None:
    matched = re.search(r"第([一二三四五六七八九])世代", value or "")
    return CHINESE_GENERATIONS.get(matched.group(1)) if matched else None


def generation_to_chinese(value: int) -> str | None:
    return GENERATION_NAMES.get(value)


def _normalize_punctuation(text: str) -> str:
    """将常见全角标点转为半角，用于版本名匹配标准化。"""
    table = str.maketrans("！？，。：；", "!?,.:;")
    return text.translate(table)


def generation_from_game_version(line: str) -> tuple[int, str] | None:
    """从游戏版本名（如"《白金》"、"《劍／盾》"）推断 (世代编号, game_version_code)。

    只有当行的主要内容就是版本名时才识别为标记。
    如果行中除了版本名还有大量其他文字，则不视为标记行。
    """
    matched = re.search(r"[《「](.+?)[》」]", line)
    if not matched:
        return None
    version_name = matched.group(1).strip()
    # 标准化全角标点为半角（如 "Let's Go！皮卡丘" → "Let's Go! 皮卡丘"）
    version_name = _normalize_punctuation(version_name)
    # 去掉版本名及书名号后，检查剩余内容长度
    remaining = line[:matched.start()] + line[matched.end():]
    remaining = re.sub(r"[\s《》「」]+", "", remaining)
    # 如果剩余内容超过 4 个字符，说明这行不是纯标题行
    if len(remaining) > 4:
        return None
    # 先尝试完整匹配
    if version_name in GAME_VERSION_INFO:
        return GAME_VERSION_INFO[version_name]
    # 再尝试部分匹配，优先选择最长的匹配键（更具体的匹配优先）
    # 例如 "Let's Go! 皮卡丘／Let's Go! 伊布" 应匹配 "Let's Go! 皮卡丘"(len=12) 而非 "皮卡丘"(len=3)
    best_match: tuple[int, str] | None = None
    best_key_len = 0
    for key, info in GAME_VERSION_INFO.items():
        if key in version_name or version_name in key:
            if len(key) > best_key_len:
                best_key_len = len(key)
                best_match = info
    return best_match


def is_version_exclusive_marker(line: str) -> bool:
    """判断标题行是否为"仅在XXX中"格式，即版本独占标记。"""
    stripped = line.strip()
    return stripped.startswith("仅在") or stripped.startswith("僅在")


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
    # 处理无书名号的格式，如 "仅在传说 阿尔宙斯" / "仅在传说 Z-A"
    bare = re.sub(r"^仅在|^僅在|中$", "", line).strip()
    if bare and bare != line:
        bare_normalized = _normalize_punctuation(bare)
        if bare_normalized in GAME_VERSION_INFO:
            return GAME_VERSION_INFO[bare_normalized]
        # 尝试最长匹配
        best_match: tuple[int, str] | None = None
        best_key_len = 0
        for key, info in GAME_VERSION_INFO.items():
            if key in bare_normalized or bare_normalized in key:
                if len(key) > best_key_len:
                    best_key_len = len(key)
                    best_match = info
        if best_match:
            return best_match
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


def extract_generation_changes(html: str, heading: str, *, heading_level: int = 2) -> list[dict[str, object]]:
    """从 HTML 中提取世代变更记录。

    直接操作 DOM 而非纯文本，避免 <b>/<a> 等内联标签导致文本被
    换行分隔从而丢失数值的问题。

    heading_level: 目标标题的级别，默认为 2（h2）。
    当 heading_level=2 时，在 h2 到下一个 h2 之间查找 h3 世代标记。
    当 heading_level=3 时，在 h3 到下一个 h3/h2 之间查找 h4 世代标记。

    变更章节的典型 HTML 结构（h2 级别）：
      <h2>效果变更</h2>
      <h3>第六世代</h3>
      <ul><li>ＰＰ：<b>30</b> → <b>20</b></li></ul>

    或（h3 级别，如不融冰）：
      <h2>效果</h2>
      <ul>...</ul>
      <h3>效果变更</h3>
      <h4>第四世代</h4>
      <ul><li>威力提升 10% → 20%</li></ul>
    """
    soup = BeautifulSoup(html or "", "html.parser")

    # 找到目标标题
    heading_tag_name = f"h{heading_level}"
    marker_tag_name = f"h{heading_level + 1}"
    # 同级或更高级别的标题都作为章节结束标记
    stop_tag_names = {f"h{i}" for i in range(1, heading_level + 1)}

    heading_tag = None
    for tag in soup.find_all(heading_tag_name):
        tag_text = re.sub(r"\[.*?\]", "", clean_inline_text(tag.get_text(" ", strip=True))).strip()
        if tag_text == heading:
            heading_tag = tag
            break
    if not heading_tag:
        return []

    # 收集标题到下一个同级/更高级标题之间的所有兄弟元素
    section_elements: list[Tag] = []
    for sibling in heading_tag.next_siblings:
        if isinstance(sibling, Tag):
            if sibling.name in stop_tag_names:
                break
            section_elements.append(sibling)

    records: list[dict[str, object]] = []
    current_generation: int | None = None
    current_game_version: str | None = None
    current_version_exclusive: bool = False
    buffer: list[str] = []

    def flush() -> None:
        nonlocal buffer
        if current_generation and buffer:
            summary = clean_summary(" ".join(buffer), 500)
            if summary:
                record: dict[str, object] = {
                    "generation": current_generation,
                    "summary": summary,
                    "version_exclusive": current_version_exclusive,
                }
                if current_game_version:
                    record["game_version_code"] = current_game_version
                records.append(record)
        buffer = []

    for elem in section_elements:
        if elem.name == marker_tag_name:
            # 世代标记或游戏版本标记
            line = clean_inline_text(elem.get_text(" ", strip=True))
            marker = detect_generation_marker(line)
            if marker:
                flush()
                current_generation, current_game_version = marker
                current_version_exclusive = is_version_exclusive_marker(line)
            continue

        if not current_generation:
            continue

        if elem.name == "ul":
            # <ul> 列表：每个 <li> 是一条变更描述
            for li in elem.find_all("li", recursive=False):
                text = clean_inline_text(li.get_text(" ", strip=True))
                if text:
                    buffer.append(text)
        elif elem.name == "dl":
            # <dl> 定义列表：dt + dd 组合
            for child in elem.children:
                if isinstance(child, Tag) and child.name in ("dt", "dd"):
                    text = clean_inline_text(child.get_text(" ", strip=True))
                    if text:
                        buffer.append(text)
        elif elem.name == "table":
            # 表格（如 LA 版本的详细数据）：提取所有单元格文本
            rows_text = []
            for tr in elem.find_all("tr"):
                cells = [clean_inline_text(td.get_text(" ", strip=True))
                         for td in tr.find_all(["th", "td"])]
                row_text = " ".join(c for c in cells if c)
                if row_text:
                    rows_text.append(row_text)
            if rows_text:
                buffer.append(" ".join(rows_text))
        elif elem.name in ("p", "div"):
            text = clean_inline_text(elem.get_text(" ", strip=True))
            if text:
                buffer.append(text)

    flush()
    return unique_by_key(records, lambda item: f"{item['generation']}|{item.get('game_version_code', '')}|{item['summary']}")


def section_text_by_heading(html: str, heading: str, level: int = 2) -> str:
    soup = BeautifulSoup(html or "", "html.parser")
    heading_tag = None
    for tag in soup.find_all(f"h{level}"):
        if heading in tag.get_text(" ", strip=True):
            heading_tag = tag
            break
    if not heading_tag:
        return ""
    # 同级或更高级别的标题都作为章节结束标记
    stop_tag_names = {f"h{i}" for i in range(1, level + 1)}
    chunks: list[str] = []
    for sibling in heading_tag.next_siblings:
        if isinstance(sibling, Tag) and sibling.name in stop_tag_names:
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


def clean_name(value: str) -> str:
    """Strip invisible control characters (LRM, RLM, ZWSP, etc.) and whitespace."""
    return re.sub(r"[\u200b-\u200f\u2028-\u202f\ufeff]", "", value).strip()


def extract_intro_names(text: str, fallback_name_zh: str) -> tuple[str | None, str | None]:
    """Extract Japanese and English names from a wiki page's normalized text.

    Strategy 1 (parenthetical): Match the standard intro format
        「名称（日文︰XXX，英文︰YYY）」
    Strategy 2 (card layout): Match the infobox card format
        「名称\\nJapaneseName\\n ...\\nEnglishName\\n」
    """
    escaped = re.escape(fallback_name_zh)

    # --- Strategy 1: parenthetical intro format ---
    # Exclusion set: commas, parentheses (both half/full-width), newlines, and CJK chars.
    # NFKC normalizes ）to ), so we must exclude both explicitly.
    _STOP = r"，,）)\n\u4e00-\u9fff"
    paren_match = re.search(
        rf"{escaped}\s*[(（]日文[︰:：]\s*([^{_STOP}]+)[，,][\s\S]{{0,40}}?英文[︰:：]\s*([^{_STOP}]+)",
        text,
    )
    if paren_match:
        return clean_name(paren_match.group(1)), clean_name(paren_match.group(2))

    # --- Strategy 2: card/infobox layout (name on separate lines) ---
    # Pattern: ZhName\nJaName(+optional LRM)\n(optional whitespace line)\nEnName(+optional LRM)\n
    card_match = re.search(
        rf"^{escaped}\n(.+)\n\s*\n([A-Z][A-Za-z0-9 \-']+)[\u200b-\u200f]*\n",
        text,
        re.MULTILINE,
    )
    if card_match:
        return clean_name(card_match.group(1)), clean_name(card_match.group(2))

    return None, None
