from __future__ import annotations

from dataclasses import dataclass
import re

from bs4 import BeautifulSoup

from ..fetcher import RawPage
from ..constants import ABILITY_LIST_URL
from ..generations import clean_name, extract_battle_effect, extract_generation_changes, extract_intro_names
from ..images import ImageAsset
from ..text import clean_inline_text, clean_summary, normalize_text, to_simplified
from ..urls import build_ability_page_url, to_absolute_url


@dataclass(frozen=True)
class AbilitySeed:
    name_zh: str
    detail_url: str
    number: int = 0
    generation: int = 3
    name_ja: str | None = None
    name_en: str | None = None
    description: str | None = None


def _unique_by_number_keep_last(seeds: list[AbilitySeed]) -> list[AbilitySeed]:
    """按编号去重，如果编号重复则保留最后一条。"""
    seen: dict[int, int] = {}  # number -> index in result
    result: list[AbilitySeed] = []
    for item in seeds:
        if item.number in seen:
            result[seen[item.number]] = item
        else:
            seen[item.number] = len(result)
            result.append(item)
    return result


# 特性列表页中 7 个表格对应的世代编号（丰缘=3, 神奥=4, 合众=5, 卡洛斯=6, 阿罗拉=7, 伽勒尔=8, 帕底亚=9）
_ABILITY_TABLE_GENERATIONS = [3, 4, 5, 6, 7, 8, 9]


def parse_ability_list_page(html: str) -> list[AbilitySeed]:
    """解析特性列表页的 HTML 表格，提取编号、名称、说明等信息。"""
    soup = BeautifulSoup(html or "", "html.parser")
    seeds: list[AbilitySeed] = []
    table_index = 0
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if not rows:
            continue
        header = [clean_inline_text(cell.get_text(" ", strip=True)) for cell in rows[0].find_all(["th", "td"])]
        if not {"编号", "中文名", "英文名"}.issubset(set(header)):
            continue
        generation = _ABILITY_TABLE_GENERATIONS[table_index] if table_index < len(_ABILITY_TABLE_GENERATIONS) else 9
        table_index += 1
        col = {name: header.index(name) for name in header}
        for row in rows[1:]:
            cells_tags = row.find_all(["th", "td"])
            cells = [clean_inline_text(cell.get_text(" ", strip=True)) for cell in cells_tags]
            num_idx = col.get("编号", 0)
            name_idx = col.get("中文名", 1)
            if len(cells) <= max(num_idx, name_idx):
                continue
            num_raw = cells[num_idx]
            num_match = re.match(r"\d{3}", num_raw)
            if not num_match:
                continue
            num_str = num_match.group(0)
            name_zh = cells[name_idx]
            if not _looks_like_chinese_name(name_zh):
                continue
            anchor = cells_tags[name_idx].find("a") if name_idx < len(cells_tags) else None
            detail_url = to_absolute_url(str(anchor.get("href"))) if anchor and anchor.get("href") else build_ability_page_url(name_zh)
            seeds.append(
                AbilitySeed(
                    name_zh=name_zh,
                    number=int(num_str),
                    name_ja=cells[col["日文名"]] if "日文名" in col and col["日文名"] < len(cells) else None,
                    name_en=cells[col["英文名"]] if "英文名" in col and col["英文名"] < len(cells) else None,
                    generation=generation,
                    description=cells[col["说明"]] if "说明" in col and col["说明"] < len(cells) else None,
                    detail_url=detail_url,
                )
            )
    return _unique_by_number_keep_last(seeds)


def _looks_like_chinese_name(value: str) -> bool:
    return bool(value and re.search(r"[\u4e00-\u9fff]", value) and not re.search(r"世代|相關|相关|目录|Deutsch|Español", value))


def normalize_ability_detail_page(page: RawPage, seed: AbilitySeed) -> dict:
    text = normalize_text(page.html)
    name_ja, name_en = extract_intro_names(text, seed.name_zh)
    # 详情页 "特性效果 > 对战中" = 详细对战效果描述
    effect_detail = (
        to_simplified(clean_summary(extract_battle_effect(page.html, "特性效果")))
        or None
    )
    # 列表页 "说明" 字段 = 简短描述
    description = to_simplified(seed.description) or "暂无说明"
    # 只收集 "特性变更" 章节的内容（跨世代变更记录）
    # wiki 页面标题可能是简体或繁体，也可能叫"效果变更"
    generations: dict[str, dict] = {}
    for heading in ("特性变更", "特性變更", "效果变更", "效果變更"):
        changes = extract_generation_changes(page.html, heading)
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
                    "notes": f"来自 52Poké {heading}章节。",
                }
            break
    return {
        "number": seed.number,
        "name_zh": seed.name_zh,
        "name_ja": clean_name(seed.name_ja) if seed.name_ja else name_ja,
        "name_en": clean_name(seed.name_en) if seed.name_en else name_en,
        "description": description,
        "effect_detail": effect_detail,
        "introduced_generation": seed.generation,
        "generations": sorted(generations.values(), key=lambda item: item["generation"]),
        "source": page,
    }
