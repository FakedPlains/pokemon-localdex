from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata

from bs4 import BeautifulSoup, Tag

from ..fetcher import RawPage
from ..constants import ITEM_LIST_URL
from ..generations import extract_generation_changes, extract_intro_names, section_text_by_heading
from ..images import ImageAsset, extract_file_name, extract_image_candidates
from ..text import clean_inline_text, clean_summary, normalize_text, slugify, to_simplified, unique_by_key
from ..urls import build_item_page_url, normalize_media_url, to_absolute_url


@dataclass(frozen=True)
class ItemSeed:
    name_zh: str
    detail_url: str
    name_ja: str | None = None
    name_en: str | None = None
    category: str | None = None
    effect_summary: str | None = None
    introduced_generation: int | None = None


# 道具列表页中需要爬取的目标分类（wiki 页面 h2/h3 标题文本）
# 注意：wiki 页面中 Z 可能是全角 Ｚ（U+FF3A）
_TARGET_ITEM_CATEGORIES = {
    "携带物品": "携带物品",
    "攜帶物品": "携带物品",
    "超级石": "超级石",
    "超級石": "超级石",
    "宝可梦使用的Z纯晶": "Z纯晶",
    "寶可夢使用的Z純晶": "Z纯晶",
    "宝可梦使用的\uff3a纯晶": "Z纯晶",
    "寶可夢使用的\uff3a純晶": "Z纯晶",
    "树果": "树果",
    "樹果": "树果",
}


def parse_item_list_page(html: str) -> list[ItemSeed]:
    table_seeds = _parse_item_list_tables(html)
    if table_seeds:
        return table_seeds

    seeds = _parse_item_seeds_from_links(html)
    text_seeds = _parse_item_table_text(html)
    for item in text_seeds:
        previous = seeds.get(item.name_zh)
        seeds[item.name_zh] = ItemSeed(
            name_zh=item.name_zh,
            detail_url=previous.detail_url if previous else item.detail_url,
            name_ja=item.name_ja,
            name_en=item.name_en,
            category=item.category or (previous.category if previous else None),
            effect_summary=item.effect_summary or (previous.effect_summary if previous else None),
        )
    return sorted(seeds.values(), key=lambda item: item.name_zh)


def _looks_like_chinese_name(value: str) -> bool:
    return bool(value and re.search(r"[\u4e00-\u9fff]", value) and not re.search(r"世代|相關|相关|目录|Deutsch|Español", value))


def _parse_item_list_tables(html: str) -> list[ItemSeed]:
    soup = BeautifulSoup(html or "", "html.parser")
    seeds: list[ItemSeed] = []
    # 遍历所有 h2/h3 标题，找到目标分类后解析其后的表格
    current_category: str | None = None
    for element in soup.find_all(["h2", "h3", "table"]):
        if element.name in ("h2", "h3"):
            heading_text = clean_inline_text(element.get_text(" ", strip=True))
            # 去掉 [编辑] 等后缀
            heading_text = re.sub(r"\[.*?\]", "", heading_text).strip()
            # NFKC 标准化（全角→半角）后再匹配
            heading_normalized = unicodedata.normalize("NFKC", heading_text)
            # 检查是否匹配目标分类
            matched_category = None
            for key, value in _TARGET_ITEM_CATEGORIES.items():
                if key in heading_normalized:
                    matched_category = value
                    break
            if matched_category:
                current_category = matched_category
            else:
                # 遇到非目标的 h2 或 h3 标题，都重置分类
                # 例如 h3 "邮件"/"糖果"/"护符"/"材料" 不应继承前面的 "携带物品"
                current_category = None
            continue
        # element.name == "table"
        if not current_category:
            continue
        rows = element.find_all("tr")
        if not rows:
            continue
        header = [clean_inline_text(cell.get_text(" ", strip=True)) for cell in rows[0].find_all(["th", "td"])]
        if "中文" not in header or "英文" not in header or not any(cell in header for cell in ["道具說明", "道具说明"]):
            continue
        index = {name: header.index(name) for name in header}
        summary_index = index.get("道具說明", index.get("道具说明"))
        for row in rows[1:]:
            cells_tags = row.find_all(["th", "td"])
            cells = [clean_inline_text(cell.get_text(" ", strip=True)) for cell in cells_tags]
            if len(cells) <= max(index["中文"], index["英文"], summary_index or 0):
                continue
            name_zh = cells[index["中文"]]
            if not _looks_like_chinese_name(name_zh):
                continue
            anchor = cells_tags[index["中文"]].find("a") if index["中文"] < len(cells_tags) else None
            detail_url = to_absolute_url(str(anchor.get("href"))) if anchor and anchor.get("href") else build_item_page_url(name_zh)
            seeds.append(ItemSeed(
                name_zh=name_zh,
                name_ja=cells[index["日文"]] if "日文" in index and index["日文"] < len(cells) else None,
                name_en=cells[index["英文"]] if index["英文"] < len(cells) else None,
                effect_summary=cells[summary_index] if summary_index is not None and summary_index < len(cells) else None,
                category=current_category,
                detail_url=detail_url,
            ))
    return unique_by_key(seeds, lambda item: item.name_zh)


def _parse_item_seeds_from_links(html: str) -> dict[str, ItemSeed]:
    soup = BeautifulSoup(html or "", "html.parser")
    seeds: dict[str, ItemSeed] = {}
    for anchor in soup.find_all("a"):
        title = clean_inline_text(anchor.get("title"))
        if not title.endswith("（道具）"):
            continue
        label = clean_inline_text(anchor.get_text(" ", strip=True))
        name_zh = label if label and "[" not in label else title.removesuffix("（道具）")
        if not name_zh or re.search(r"道具|列表|分类|页面", name_zh):
            continue
        seeds[name_zh] = ItemSeed(name_zh=name_zh, detail_url=to_absolute_url(str(anchor.get("href") or "")))
    return seeds


def _parse_item_table_text(html: str) -> list[ItemSeed]:
    lines = [line.strip() for line in normalize_text(html).splitlines() if line.strip()]
    items: list[ItemSeed] = []
    current_category = ""
    for line in lines:
        if line.startswith("### "):
            current_category = line.replace("###", "", 1).strip()
            continue
        matched = re.match(r"^([^\s]+)\s+([^\s]+)\s+([A-Za-z0-9.'\- ]+)\s+(.+)$", line)
        if not matched:
            continue
        name_zh, name_ja, name_en, summary = matched.groups()
        if name_zh in {"中文", "日文", "英文", "道具說明"}:
            continue
        items.append(
            ItemSeed(
                name_zh=name_zh,
                name_ja=name_ja,
                name_en=name_en.strip(),
                effect_summary=summary.strip(),
                category=current_category or "未分类",
                detail_url=build_item_page_url(name_zh),
            )
        )
    return items


def _detect_introduced_generation(html: str, text: str) -> int | None:
    """从道具详情页推断初登场世代。"""
    # 尝试从信息框中提取"引入世代"
    match = re.search(r"第([一二三四五六七八九])世代", text)
    if match:
        from ..constants import CHINESE_GENERATIONS
        return CHINESE_GENERATIONS.get(match.group(1))
    return None


def _pick_item_image(html: str, seed: ItemSeed) -> str | None:
    from urllib.parse import unquote
    english = re.sub(r"[^A-Za-z0-9]+", "", seed.name_en or "").lower()
    zh_name = seed.name_zh  # 中文名原文，用于匹配 URL 编码的文件名
    zh_slug = slugify(seed.name_zh).replace("-", "")
    ranked = []
    for url in extract_image_candidates(html):
        file_name = extract_file_name(url).lower()
        # 对 URL 编码的文件名进行解码，以便匹配中文名
        decoded_name = unquote(extract_file_name(url))
        score = 0
        if english and english in file_name:
            score += 7
        # 中文名匹配（解码后的文件名中包含道具中文名）
        if zh_name and zh_name in decoded_name:
            score += 8
        elif zh_slug and zh_slug in file_name:
            score += 4
        # 优先选择 Dream_ 开头的道具图标（高清 Dream World Sprite）
        if file_name.startswith("dream_") and "sprite" in file_name:
            score += 5
        # 其次选择 Bag_ 开头的道具图标（Sprite）
        elif file_name.startswith("bag_") and "sprite" in file_name:
            score += 3
        elif "bag" in file_name or "item" in file_name:
            score += 2
        if "icon" in file_name:
            score += 2
        # 惩罚通用图标（pocket_icon 是分类图标，不是具体道具图标）
        if "pocket_icon" in file_name:
            score -= 6
        if "type" in file_name or "move" in file_name:
            score -= 5
        # 优先选择较新世代的图片（SV > LA > BDSP > Sprite）
        if "_sv_" in file_name:
            score += 1
        if score > 0:
            ranked.append((score, len(file_name), url))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return ranked[0][2] if ranked else None


def _section_text_by_exact_heading(
    html: str, heading: str, level: int = 2, *, exclude_subheadings: list[str] | None = None
) -> str:
    """与 section_text_by_heading 类似，但使用精确匹配标题文本。
    避免「效果」匹配到「效果变更」等包含该子串的标题。

    exclude_subheadings: 如果指定，遇到这些子标题（level+1 级别）时停止收集内容。
    例如提取 h2「效果」时排除 h3「效果变更」子章节。
    """
    soup = BeautifulSoup(html or "", "html.parser")
    heading_tag = None
    for tag in soup.find_all(f"h{level}"):
        tag_text = clean_inline_text(tag.get_text(" ", strip=True))
        # 去掉 [编辑] 等后缀后精确匹配
        tag_text = re.sub(r"\[.*?\]", "", tag_text).strip()
        if tag_text == heading:
            heading_tag = tag
            break
    if not heading_tag:
        return ""
    sub_level = f"h{level + 1}"
    exclude_set = set(exclude_subheadings) if exclude_subheadings else set()
    chunks: list[str] = []
    for sibling in heading_tag.next_siblings:
        if isinstance(sibling, Tag):
            if sibling.name == f"h{level}":
                break
            # 遇到需要排除的子标题时停止收集
            if exclude_set and sibling.name == sub_level:
                sub_text = re.sub(r"\[.*?\]", "", clean_inline_text(sibling.get_text(" ", strip=True))).strip()
                if sub_text in exclude_set:
                    break
            chunks.append(sibling.get_text("\n", strip=True))
        elif str(sibling).strip():
            chunks.append(str(sibling).strip())
    return "\n".join(item for item in chunks if item).strip()


def normalize_item_detail_page(page: RawPage, seed: ItemSeed) -> dict:
    text = normalize_text(page.html)
    name_ja, name_en = extract_intro_names(text, seed.name_zh)
    # 效果摘要：优先用详情页「效果」章节，其次用列表页的道具说明
    effect_summary = (
        to_simplified(clean_summary(seed.effect_summary))
        or "暂无说明"
    )
    # 效果详情：
    # - 树果类道具：只提取 h2「效果」→ h3「携带」子章节（携带效果）
    # - 其他道具：优先提取 h3「效果」（超级石等道具的效果在 h3 级别），
    #   找不到时再尝试 h2「效果」（精确匹配，避免误匹配到「效果变更」）
    if seed.category == "树果":
        carry_text = section_text_by_heading(page.html, "携带", level=3)
        effect_detail = to_simplified(clean_summary(carry_text, max_length=2000)) or None
    else:
        # 先尝试 h3「效果」精确匹配（超级石、Z纯晶等道具的效果描述在此级别）
        h3_effect = _section_text_by_exact_heading(page.html, "效果", level=3)
        if h3_effect:
            effect_detail = to_simplified(clean_summary(h3_effect, max_length=2000)) or None
        else:
            # 再尝试 h2「效果」精确匹配，避免匹配到「效果变更」
            # 同时排除 h3「效果变更」子章节（如不融冰：h2效果下包含h3效果变更）
            h2_effect = _section_text_by_exact_heading(page.html, "效果", level=2, exclude_subheadings=["效果变更", "效果變更"])
            if h2_effect:
                effect_detail = to_simplified(clean_summary(h2_effect, max_length=2000)) or None
            else:
                # 尝试 h2「使用效果」（部分超级石使用此标题）
                use_effect = _section_text_by_exact_heading(page.html, "使用效果", level=2)
                if use_effect:
                    effect_detail = to_simplified(clean_summary(use_effect, max_length=2000)) or None
                else:
                    # 最后尝试 h2「游戏中」（部分超级石的效果直接放在此章节下）
                    game_text = _section_text_by_exact_heading(page.html, "游戏中", level=2)
                    effect_detail = to_simplified(clean_summary(game_text, max_length=2000)) or None if game_text else None
    bag_info = section_text_by_heading(page.html, "包包信息")
    category = seed.category
    category_match = re.search(r"口袋\s+([^\n ]+)", bag_info or text)
    if not category and category_match:
        category = to_simplified(category_match.group(1).strip())
    # 世代变更记录（「效果变更」章节）
    # 先尝试 h2 级别的「效果变更」（大多数道具），再尝试 h3 级别（如不融冰：h3 在 h2「效果」下面）
    generations: dict[str, dict] = {}
    for heading in ("效果变更", "效果變更"):
        changes = extract_generation_changes(page.html, heading, heading_level=2)
        if not changes:
            changes = extract_generation_changes(page.html, heading, heading_level=3)
        if changes:
            for change in changes:
                gen = int(change["generation"])
                gv_code = change.get("game_version_code")
                key = f"{gen}|{gv_code or ''}"
                generations[key] = {
                    "generation": gen,
                    "description": to_simplified(str(change["summary"])) or str(change["summary"]),
                    "game_version_code": gv_code,
                    "version_exclusive": bool(change.get("version_exclusive", False)),
                    "notes": to_simplified(f"来自 52Poké {heading}章节。"),
                }
            break
    # 初登场世代
    introduced_generation = seed.introduced_generation or _detect_introduced_generation(page.html, text)
    raw_image_url = _pick_item_image(page.html, seed)
    image_url = normalize_media_url(raw_image_url) if raw_image_url else None
    return {
        "name_zh": seed.name_zh,
        "name_ja": name_ja or seed.name_ja,
        "name_en": name_en or seed.name_en,
        "category": category,
        "effect_summary": effect_summary,
        "effect_detail": effect_detail,
        "introduced_generation": introduced_generation,
        "image_url": image_url,
        "generations": sorted(generations.values(), key=lambda item: item["generation"]),
        "image": ImageAsset(image_url, f"{seed.name_zh}图片", image_url) if image_url else None,
        "source": page,
    }
