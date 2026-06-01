from __future__ import annotations

from dataclasses import dataclass
import re

from bs4 import BeautifulSoup, Tag

from ..fetcher import RawPage
from ..constants import MOVE_LIST_URL, POKEMON_TYPES
from ..generations import (
    detect_generation_marker,
    extract_generation_changes,
    extract_intro_names,
    generation_from_heading,
    section_text_by_heading,
)
from ..images import ImageAsset, extract_file_name, extract_image_candidates
from ..text import (
    clean_inline_text,
    clean_summary,
    format_accuracy,
    normalize_category,
    normalize_power,
    normalize_pp,
    normalize_text,
    to_simplified,
    unique_by_key,
)
from ..urls import build_move_page_url, normalize_media_url, to_absolute_url


@dataclass(frozen=True)
class MoveSeed:
    name_zh: str
    detail_url: str
    number: int = 0
    generation: int = 1
    name_ja: str | None = None
    name_en: str | None = None
    type: str | None = None
    category: str | None = None
    power: int | None = None
    accuracy: int | None = None
    pp: int | None = None
    description: str | None = None


def parse_move_list_page(html: str) -> list[MoveSeed]:
    table_seeds = _parse_move_list_tables(html)
    if table_seeds:
        return table_seeds

    lines = [line.strip() for line in normalize_text(html).splitlines() if line.strip()]
    seeds: list[MoveSeed] = []
    current_generation = 1
    for index, line in enumerate(lines):
        generation = generation_from_heading(line)
        if generation:
            current_generation = generation
            continue
        if not re.fullmatch(r"\d{1,4}", line):
            continue
        row = lines[index + 1:index + 10]
        if len(row) < 9:
            continue
        name_zh, name_ja, name_en, type_name, category, power, accuracy, pp, summary = row
        if name_zh in {"中文名", "日文名", "英文名"}:
            continue
        parsed_category = normalize_category(category)
        if not parsed_category:
            continue
        seeds.append(
            MoveSeed(
                name_zh=to_simplified(name_zh) or name_zh,
                name_ja=name_ja,
                name_en=name_en,
                number=int(lines[index]),
                generation=current_generation,
                type=to_simplified(type_name),
                category=parsed_category,
                power=normalize_power(power),
                accuracy=format_accuracy(accuracy),
                pp=normalize_pp(pp),
                description=to_simplified(summary),
                detail_url=build_move_page_url(name_zh),
            )
        )
    return unique_by_key(seeds, lambda item: item.name_zh)


def _parse_move_list_tables(html: str) -> list[MoveSeed]:
    soup = BeautifulSoup(html or "", "html.parser")
    seeds: list[MoveSeed] = []
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if not rows:
            continue
        header = [clean_inline_text(cell.get_text(" ", strip=True)) for cell in rows[0].find_all(["th", "td"])]
        if not {"编号", "中文名", "日文名", "英文名", "属性", "分类"}.issubset(set(header)):
            continue
        # 从表格前面的 h2 标题推断世代
        table_generation = _detect_generation_before_table(table)
        index = {name: header.index(name) for name in header}
        for row in rows[1:]:
            cells_tags = row.find_all(["th", "td"])
            cells = [clean_inline_text(cell.get_text(" ", strip=True)) for cell in cells_tags]
            if len(cells) <= max(index.get("说明", 0), index.get("中文名", 0)):
                continue
            name_zh = cells[index["中文名"]]
            if not _looks_like_chinese_name(name_zh):
                continue
            num_str = cells[index["编号"]] if index["编号"] < len(cells) else ""
            number = int(num_str) if re.fullmatch(r"\d{1,4}", num_str) else 0
            anchor = cells_tags[index["中文名"]].find("a") if index["中文名"] < len(cells_tags) else None
            detail_url = to_absolute_url(str(anchor.get("href"))) if anchor and anchor.get("href") else build_move_page_url(name_zh)
            seeds.append(MoveSeed(
                name_zh=to_simplified(name_zh) or name_zh,
                name_ja=cells[index["日文名"]] if index.get("日文名") is not None and index["日文名"] < len(cells) else None,
                name_en=cells[index["英文名"]] if index.get("英文名") is not None and index["英文名"] < len(cells) else None,
                number=number,
                generation=table_generation,
                type=to_simplified(cells[index["属性"]] if index["属性"] < len(cells) else None),
                category=normalize_category(cells[index["分类"]] if index["分类"] < len(cells) else None),
                power=normalize_power(cells[index["威力"]] if "威力" in index and index["威力"] < len(cells) else None),
                accuracy=format_accuracy(cells[index["命中"]] if "命中" in index and index["命中"] < len(cells) else None),
                pp=normalize_pp(cells[index["PP"]] if "PP" in index and index["PP"] < len(cells) else cells[index["ＰＰ"]] if "ＰＰ" in index and index["ＰＰ"] < len(cells) else None),
                description=to_simplified(cells[index["说明"]] if "说明" in index and index["说明"] < len(cells) else None),
                detail_url=detail_url,
            ))
    return unique_by_key(seeds, lambda item: item.name_zh)


def _detect_generation_before_table(table) -> int:
    """从表格前面的 h2 标题推断世代编号。"""
    for sibling in table.previous_siblings:
        if not isinstance(sibling, Tag):
            continue
        if sibling.name == "h2":
            text = sibling.get_text(" ", strip=True)
            marker = detect_generation_marker(text)
            if marker:
                return marker[0]
    return 1


def _looks_like_chinese_name(value: str) -> bool:
    return bool(value and re.search(r"[\u4e00-\u9fff]", value) and not re.search(r"世代|相關|相关|目录|Deutsch|Español", value))


def _extract_move_info_from_html(html: str, name_zh: str) -> dict:
    """从招式详情页 HTML 中解析基本信息（属性、分类、威力、命中、PP、描述、世代）。
    用于补全列表页中缺失的招式信息。
    """
    soup = BeautifulSoup(html, "html.parser")
    info: dict = {}

    # 从 wgCategories 中提取属性、分类、世代
    for script in soup.find_all("script"):
        if script.string and "wgCategories" in (script.string or ""):
            cat_match = re.search(r'"wgCategories"\s*:\s*\[([^\]]+)\]', script.string)
            if cat_match:
                categories = [c.strip().strip('"') for c in cat_match.group(1).split(",")]
                for cat in categories:
                    cat_s = to_simplified(cat) or cat
                    if cat_s.endswith("属性招式"):
                        type_name = cat_s.replace("属性招式", "")
                        if type_name in POKEMON_TYPES:
                            info.setdefault("type", type_name)
                    if cat_s.endswith("招式") and not cat_s.endswith("属性招式"):
                        cat_prefix = cat_s.replace("招式", "")
                        nc = normalize_category(cat_prefix)
                        if nc:
                            info.setdefault("category", nc)
                    gen_match = re.match(r"第([一二三四五六七八九])世代招式", cat_s)
                    if gen_match:
                        gen_map = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
                        info.setdefault("introduced_generation", gen_map.get(gen_match.group(1)))
            break

    # 从信息框表格中提取威力、命中、PP、描述
    for table in soup.find_all("table", class_="roundy"):
        text = table.get_text(" ", strip=True)
        if "属性" not in text or "威力" not in text:
            continue
        # 描述: 中文名 日文名 英文名 描述 对战
        desc_match = re.search(
            rf"{re.escape(name_zh)}\s+\S+\s+[A-Za-z0-9\s'\-\.]+\s+(.+?)\s*(?:对战|對戰)",
            text,
        )
        if desc_match:
            desc = to_simplified(desc_match.group(1).strip())
            if desc and len(desc) > 2:
                info.setdefault("description", desc)
        power_match = re.search(r"威力\s+(\d+|—)", text)
        if power_match and power_match.group(1) != "—":
            info.setdefault("power", int(power_match.group(1)))
        acc_match = re.search(r"命中\s+(\d+|—)", text)
        if acc_match and acc_match.group(1) != "—":
            info.setdefault("accuracy", int(acc_match.group(1)))
        pp_match = re.search(r"[PＰ]{2}\s+(\d+)", text)
        if pp_match:
            info.setdefault("pp", int(pp_match.group(1)))
        break

    return info


def normalize_move_detail_page(page: RawPage, seed: MoveSeed) -> dict:
    text = normalize_text(page.html)
    name_ja, name_en = extract_intro_names(text, seed.name_zh)
    # "招式附加效果" 章节 = 详细对战效果描述
    effect_detail = (
        to_simplified(clean_summary(section_text_by_heading(page.html, "招式附加效果")))
        or to_simplified(clean_summary(section_text_by_heading(page.html, "招式附加效果")))
        or None
    )
    # 如果 seed 中缺少基本信息，尝试从详情页 HTML 中提取
    html_info: dict = {}
    if not seed.type or not seed.category:
        html_info = _extract_move_info_from_html(page.html, seed.name_zh)
    # 列表页 "说明" 字段 = 简短描述；如果没有则用 HTML 中解析的
    description = to_simplified(seed.description) or html_info.get("description") or "暂无说明"
    # 只收集 "招式变更" 章节的内容（跨世代变更记录）
    # wiki 页面标题可能是简体或繁体
    generations: dict[str, dict] = {}
    for heading in ("招式变更", "招式變更"):
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
                    "notes": to_simplified(f"来自 52Poké {heading}章节。"),
                }
            break
    image_url = next(
        (
            url
            for url in extract_image_candidates(page.html)
            if re.search(r"animoves|move", extract_file_name(url), re.I)
        ),
        None,
    )
    # 确保所有中文文本都是简体中文
    name_zh = to_simplified(seed.name_zh) or seed.name_zh
    type_name = to_simplified(seed.type) or html_info.get("type")
    category = to_simplified(seed.category) or html_info.get("category")
    return {
        "number": seed.number or html_info.get("number") or None,
        "name_zh": name_zh,
        "name_ja": name_ja or seed.name_ja,
        "name_en": name_en or seed.name_en,
        "type": type_name,
        "category": category,
        "power": seed.power or html_info.get("power"),
        "accuracy": seed.accuracy or html_info.get("accuracy"),
        "pp": seed.pp or html_info.get("pp"),
        "description": description,
        "effect_detail": effect_detail,
        "introduced_generation": seed.generation or html_info.get("introduced_generation"),
        "image": ImageAsset(normalize_media_url(image_url), f"{name_zh}招式动画", normalize_media_url(image_url)) if image_url else None,
        "generations": sorted(generations.values(), key=lambda item: item["generation"]),
        "source": page,
    }
