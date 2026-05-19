from __future__ import annotations

from dataclasses import dataclass
import re

from bs4 import BeautifulSoup

from .fetcher import RawPage
from .html_tools import extract_ability_names, parse_pokemon_abilities
from .utils import (
    ImageAsset,
    build_learnset_page_url,
    build_pokemon_page_url,
    clean_inline_text,
    extract_file_name,
    extract_image_candidates,
    generation_from_dex_number,
    generation_from_heading,
    normalize_media_url,
    normalize_text,
    read_number,
    slugify,
    to_simplified,
    unique_by_key,
)
from bs4 import Tag

KNOWN_TYPES = ["一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面", "飞行", "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精"]
TYPE_ALIASES = {"電": "电", "飛行": "飞行", "蟲": "虫", "龍": "龙", "惡": "恶", "鋼": "钢", "格鬥": "格斗", "幽靈": "幽灵"}


@dataclass(frozen=True)
class PokemonSeed:
    dex_number: int
    name_zh: str
    detail_url: str
    name_ja: str | None = None
    name_en: str | None = None
    generations: tuple[int, ...] = ()


def parse_pokemon_list_page(html: str) -> list[PokemonSeed]:
    text = normalize_text(html)
    seeds: list[PokemonSeed] = []
    pattern = re.compile(r"#(\d{4})\s+([^\s#]+)\s+([^\s#]+)\s+([A-Za-z0-9.'♀♂\- :]+)")
    for match in pattern.finditer(text):
        generations = _collect_generations_around(match.start(), text)
        name_zh = match.group(2).strip()
        seeds.append(
            PokemonSeed(
                dex_number=int(match.group(1)),
                name_zh=name_zh,
                name_ja=match.group(3).strip(),
                name_en=match.group(4).strip(),
                generations=tuple(generations),
                detail_url=build_pokemon_page_url(name_zh),
            )
        )
    return unique_by_key(seeds, lambda item: f"{item.dex_number}|{item.name_zh}")


def normalize_pokemon_detail_page(page: RawPage, seed: PokemonSeed) -> dict:
    text = normalize_text(page.html)
    parsed_abilities = parse_pokemon_abilities(page.html)
    types = _extract_types_from_html(page.html) or _split_type_names(_extract_line_value(text, "属性"))
    all_stat_blocks = _extract_stat_blocks(text)
    stats = _choose_base_stats(all_stat_blocks)
    extract_result = _extract_forms_from_html(page.html, seed.name_zh)
    raw_forms = extract_result["forms"]
    base_stat_variants = extract_result["base_stat_variants"]
    regional_records = _extract_regional_dex_records(text)
    generation_availability = _build_generation_availability(list(seed.generations), regional_records)
    image_sets = resolve_pokemon_image_assets(page.html, seed, raw_forms)

    # 构建形态列表（form-centric architecture）
    # 每个形态只有一条 form 记录，世代变体信息嵌套在 stat_variants 中
    forms: list[dict] = []
    hidden_ability = parsed_abilities.hidden_ability or to_simplified(_extract_line_value(text, "隐藏特性")) or to_simplified(_extract_line_value(text, "隱藏特性"))

    # 默认形态（一条记录，可能有多个世代版本的种族值）
    default_form: dict = {
        "form_key": "default",
        "name_zh": seed.name_zh,
        "form_type": "default",
        "is_default": True,
        "sort_order": 0,
        "primary_type": types[0] if types else None,
        "secondary_type": types[1] if len(types) > 1 else None,
        "abilities": parsed_abilities.abilities,
        "hidden_ability": hidden_ability,
        "base_stats": stats,
        "images": image_sets["base"],
    }
    if base_stat_variants:
        default_form["stat_variants"] = base_stat_variants
        # base_stats 取最新世代的（有 generation_start 且无 generation_end 的优先）
        latest = next(
            (v for v in base_stat_variants if v.get("generation_start") is not None and v.get("generation_end") is None),
            next((v for v in base_stat_variants if v.get("generation_start") is None and v.get("generation_end") is None), base_stat_variants[0]),
        )
        default_form["base_stats"] = {k: latest[k] for k in ("hp", "atk", "def", "spa", "spd", "spe")}
    forms.append(default_form)

    # 其他形态（从 HTML toggle 结构提取，已包含属性和种族值）
    form_images = image_sets.get("forms") or {}
    for sort_order, raw_form in enumerate(raw_forms, start=1):
        form_name = raw_form["name_zh"]
        # 跳过与默认形态完全同名的形态
        if form_name == seed.name_zh:
            continue
        form_key = slugify(form_name)
        form_type = _classify_form_type(form_name)

        form_entry: dict = {
            "form_key": form_key,
            "name_zh": form_name,
            "form_type": form_type,
            "is_default": False,
            "sort_order": sort_order,
            "primary_type": raw_form.get("primary_type"),
            "secondary_type": raw_form.get("secondary_type"),
            "abilities": raw_form.get("abilities", []),
            "hidden_ability": raw_form.get("hidden_ability"),
            "base_stats": raw_form.get("base_stats"),
            "images": form_images.get(form_name) or {},
        }

        stat_variants = raw_form.get("stat_variants")
        if stat_variants:
            form_entry["stat_variants"] = stat_variants
            # base_stats 取最新世代的
            latest = next(
                (v for v in stat_variants if v.get("generation_start") is not None and v.get("generation_end") is None),
                next((v for v in stat_variants if v.get("generation_start") is None and v.get("generation_end") is None), stat_variants[0]),
            )
            form_entry["base_stats"] = {k: latest[k] for k in ("hp", "atk", "def", "spa", "spd", "spe")}

        forms.append(form_entry)

    return {
        "dex_number": seed.dex_number,
        "slug": slugify(seed.name_zh),
        "name_zh": seed.name_zh,
        "name_ja": seed.name_ja,
        "name_en": seed.name_en,
        "generations": list(seed.generations) or [generation_from_dex_number(seed.dex_number)],
        "primary_type": types[0] if types else None,
        "secondary_type": types[1] if len(types) > 1 else None,
        "category": to_simplified(_extract_line_value(text, "分类")),
        "abilities": parsed_abilities.abilities,
        "hidden_ability": parsed_abilities.hidden_ability or to_simplified(_extract_line_value(text, "隐藏特性")) or to_simplified(_extract_line_value(text, "隱藏特性")),
        "ability_changes": parsed_abilities.changes,
        "height_m": read_number(_extract_line_value(text, "身高")),
        "weight_kg": read_number(_extract_line_value(text, "体重")),
        "base_stats": stats,
        "forms": forms,
        "generation_availability": generation_availability,
        "images": image_sets["base"],
        "form_images": form_images,
        "source": page,
    }


def _classify_form_type(name_zh: str) -> str:
    """根据形态名称推断形态类型。"""
    if "超级" in name_zh:
        return "mega"
    if "超极巨" in name_zh:
        return "gigantamax"
    if "阿罗拉" in name_zh:
        return "regional-alola"
    if "伽勒尔" in name_zh:
        return "regional-galar"
    if "洗翠" in name_zh:
        return "regional-hisui"
    if "帕底亚" in name_zh:
        return "regional-paldea"
    if "太晶" in name_zh:
        return "terastal"
    return "alternate"


def parse_learnset_page(page: RawPage, generation: int) -> dict[str, list[dict]]:
    """解析招式表页面，返回按 form_key 分组的招式列表。

    返回格式::

        {
            "default": [
                {"move_name_zh": "...", "learn_method": "level-up", "level": 5,
                 "game_version_code": "SV", "tm_number": None, "notes": None},
                ...
            ],
            "骑白马的样子": [...],
        }

    每个 form_key 对应一个完整的招式列表（策略 A：每个形态完整存储）。
    如果页面没有多形态切换，则只有 "default" 一个 key。
    """
    soup = BeautifulSoup(page.html or "", "html.parser")
    content = soup.find("div", id="mw-content-text")
    if not content:
        return {"default": []}

    # 检测多形态模式
    form_map = _detect_form_map(content)

    if form_map:
        return _parse_multi_form_page(content, form_map, generation)
    else:
        return {"default": _parse_single_form_page(content, generation)}


# ---------------------------------------------------------------------------
# 多形态检测
# ---------------------------------------------------------------------------

def _detect_form_map(content: Tag) -> dict[str, str] | None:
    """检测页面的多形态切换模式，返回 {varform后缀: 形态名称} 映射。

    支持两种模式：
    - varform 模式：span._toggle varformX textblack > b 包含形态名称
    - toggle-N 模式：span.toggle-p toggle-p-N 包含形态名称（可能有 <b> 也可能没有）

    如果没有多形态切换，返回 None。
    """
    # 模式 1: varform（如蕾冠王）
    varform_map: dict[str, str] = {}
    for span in content.find_all("span", class_="_toggle"):
        classes = span.get("class", [])
        varform_cls = next((c for c in classes if c.startswith("varform")), None)
        if varform_cls and "textblack" in classes:
            b_tag = span.find("b")
            if b_tag:
                name = to_simplified(clean_inline_text(b_tag.get_text(strip=True)))
                if name:
                    varform_map[varform_cls] = name
    if varform_map:
        return varform_map

    # 模式 2: toggle-N（如洛托姆）
    # 注意：BS4 class_=lambda 传入的 c 是单个 class 字符串而非列表，
    # 所以这里手动遍历所有 span 再检查 class 列表。
    # 另外 toggle-p span 内部可能没有 <b> 标签，直接取 span 文本。
    toggle_map: dict[str, str] = {}
    for span in content.find_all("span"):
        classes = span.get("class", [])
        toggle_cls = next((c for c in classes if c.startswith("toggle-p-")), None)
        if toggle_cls:
            # 优先取 <b> 标签文本，没有则取 span 自身文本
            b_tag = span.find("b")
            raw = (b_tag or span).get_text(strip=True)
            name = to_simplified(clean_inline_text(raw))
            if name:
                # toggle-p-1 → toggle-1
                suffix = toggle_cls.replace("toggle-p-", "")
                key = f"toggle-{suffix}"
                toggle_map[key] = name
    if toggle_map:
        return toggle_map

    return None


# ---------------------------------------------------------------------------
# 单形态页面解析
# ---------------------------------------------------------------------------

def _parse_single_form_page(content: Tag, generation: int) -> list[dict]:
    """解析没有多形态切换的页面（如皮卡丘）。"""
    results: list[dict] = []
    game_version = None

    # 遍历 h4（游戏版本）和 h5（招式类型）
    for heading in content.find_all(["h4", "h5"]):
        text = to_simplified(clean_inline_text(heading.get_text(strip=True)))
        if not text:
            continue

        if heading.name == "h4":
            game_version = _extract_game_version_code(text)
            # 有些页面 h4 是招式类型而非游戏版本（如蕾冠王 gen8）
            method = _heading_to_method(text)
            if method:
                tables = _collect_tables_after(heading)
                for table in tables:
                    results.extend(_extract_moves_from_table(table, method, game_version))
            continue

        if heading.name == "h5":
            method = _heading_to_method(text)
            if method:
                tables = _collect_tables_after(heading)
                for table in tables:
                    results.extend(_extract_moves_from_table(table, method, game_version))
            elif "形态变化" in text or "形態变化" in text or "形態變化" in text:
                tables = _collect_tables_after(heading)
                for table in tables:
                    results.extend(_extract_form_change_moves(table, game_version))

    return _dedupe_learnset(results)


# ---------------------------------------------------------------------------
# 多形态页面解析
# ---------------------------------------------------------------------------

def _parse_multi_form_page(
    content: Tag,
    form_map: dict[str, str],
    generation: int,
) -> dict[str, list[dict]]:
    """解析有多形态切换的页面。"""
    is_varform = any(k.startswith("varform") for k in form_map)
    result: dict[str, list[dict]] = {}

    if is_varform:
        result = _parse_varform_page(content, form_map, generation)
    else:
        result = _parse_toggle_page(content, form_map, generation)

    # 去重
    for key in result:
        result[key] = _dedupe_learnset(result[key])

    return result


def _parse_varform_page(
    content: Tag,
    form_map: dict[str, str],
    generation: int,
) -> dict[str, list[dict]]:
    """解析 varform 模式的多形态页面（如蕾冠王）。

    结构：h4 是招式类型（升级招式/招式学习器），每个 h4 下有多个
    div._toggle varformX 包裹不同形态的表格。
    """
    result: dict[str, list[dict]] = {name: [] for name in form_map.values()}
    game_version = None

    for heading in content.find_all(["h4", "h5"]):
        text = to_simplified(clean_inline_text(heading.get_text(strip=True)))
        if not text:
            continue

        if heading.name == "h4":
            # 可能是游戏版本或招式类型
            gv = _extract_game_version_code(text)
            if gv:
                game_version = gv
            method = _heading_to_method(text)
            if method:
                _collect_varform_tables(heading, form_map, method, game_version, result)
            continue

        if heading.name == "h5":
            method = _heading_to_method(text)
            if method:
                _collect_varform_tables(heading, form_map, method, game_version, result)
            elif "形态变化" in text or "形態变化" in text or "形態變化" in text:
                # 形态变化 section 通常也有 varform 切换
                _collect_varform_tables(heading, form_map, "form-change", game_version, result)

    return result


def _collect_varform_tables(
    heading: Tag,
    form_map: dict[str, str],
    method: str,
    game_version: str | None,
    result: dict[str, list[dict]],
) -> None:
    """收集 heading 之后的 varform toggle div 中的表格。"""
    sibling = heading.find_next_sibling()
    while sibling and sibling.name not in ("h2", "h3", "h4", "h5"):
        if sibling.name == "div" and "_toggle" in (sibling.get("class") or []):
            classes = sibling.get("class", [])
            varform_cls = next((c for c in classes if c.startswith("varform")), None)
            if varform_cls and varform_cls in form_map:
                form_name = form_map[varform_cls]
                for table in sibling.find_all("table"):
                    if _is_move_table(table):
                        if method == "form-change":
                            result[form_name].extend(
                                _extract_form_change_moves(table, game_version)
                            )
                        else:
                            result[form_name].extend(
                                _extract_moves_from_table(table, method, game_version)
                            )
        elif sibling.name == "table" and _is_move_table(sibling):
            # 有些表格不在 toggle div 里
            if method == "form-change":
                # 形态变化表格按 _form_hint 分配到对应形态
                fc_moves = _extract_form_change_moves(sibling, game_version)
                _dispatch_form_change_moves(fc_moves, list(result.keys()), result)
            else:
                # 普通共享表格 → 所有形态共享
                for form_name in result:
                    result[form_name].extend(
                        _extract_moves_from_table(sibling, method, game_version)
                    )
        sibling = sibling.find_next_sibling()


def _parse_toggle_page(
    content: Tag,
    form_map: dict[str, str],
    generation: int,
) -> dict[str, list[dict]]:
    """解析 toggle-N 模式的多形态页面（如洛托姆）。

    结构：h4 是游戏版本，h5 是招式类型，每个 h5 下有多个
    div.toggle-content toggle-c toggle-N 包裹不同形态的表格。
    """
    result: dict[str, list[dict]] = {name: [] for name in form_map.values()}
    game_version = None

    for heading in content.find_all(["h4", "h5"]):
        text = to_simplified(clean_inline_text(heading.get_text(strip=True)))
        if not text:
            continue

        if heading.name == "h4":
            gv = _extract_game_version_code(text)
            if gv:
                game_version = gv
            continue

        if heading.name == "h5":
            method = _heading_to_method(text)
            if method:
                _collect_toggle_tables(heading, form_map, method, game_version, result)
            elif "形态变化" in text or "形態变化" in text or "形態變化" in text:
                _collect_toggle_tables(heading, form_map, "form-change", game_version, result)

    return result


def _collect_toggle_tables(
    heading: Tag,
    form_map: dict[str, str],
    method: str,
    game_version: str | None,
    result: dict[str, list[dict]],
) -> None:
    """收集 heading 之后的 toggle-N div 中的表格。"""
    sibling = heading.find_next_sibling()
    while sibling and sibling.name not in ("h2", "h3", "h4", "h5"):
        if sibling.name == "div":
            classes = sibling.get("class") or []
            if "toggle-content" in classes:
                # 找到 toggle-N 后缀
                toggle_cls = next(
                    (c for c in classes if re.fullmatch(r"toggle-\d+", c)),
                    None,
                )
                if toggle_cls and toggle_cls in form_map:
                    form_name = form_map[toggle_cls]
                    for table in sibling.find_all("table"):
                        if _is_move_table(table):
                            if method == "form-change":
                                result[form_name].extend(
                                    _extract_form_change_moves(table, game_version)
                                )
                            else:
                                result[form_name].extend(
                                    _extract_moves_from_table(table, method, game_version)
                                )
        elif sibling.name == "table" and _is_move_table(sibling):
            # 不在 toggle div 里的表格
            if method == "form-change":
                # 形态变化表格按 _form_hint 分配到对应形态
                fc_moves = _extract_form_change_moves(sibling, game_version)
                _dispatch_form_change_moves(fc_moves, list(result.keys()), result)
            else:
                # 普通共享表格 → 所有形态共享
                for form_name in result:
                    result[form_name].extend(
                        _extract_moves_from_table(sibling, method, game_version)
                    )
        sibling = sibling.find_next_sibling()


# ---------------------------------------------------------------------------
# 表格解析核心
# ---------------------------------------------------------------------------

def _is_move_table(table: Tag) -> bool:
    """判断一个 table 是否是招式表。"""
    text = table.get_text(" ", strip=True)
    if "招式" not in text:
        return False
    # 传统格式（有 PP 列）或新格式（传说 Z-A 等，有「发动时间」列）
    return "PP" in text or "ＰＰ" in text or "发动时间" in text or "發動時間" in text


def _extract_moves_from_table(
    table: Tag,
    method: str,
    game_version: str | None,
) -> list[dict]:
    """从一个招式表格中提取招式列表。"""
    # 找到表头行
    header_cells: list[str] = []
    for row in table.find_all("tr"):
        cells = [clean_inline_text(cell.get_text(" ", strip=True)) for cell in row.find_all(["th", "td"])]
        if "招式" in cells and ("PP" in cells or "ＰＰ" in cells or "发动时间" in cells or "發動時間" in cells):
            header_cells = cells
            break
    if not header_cells:
        return []

    # 自动检测 method（如果传入的是 "other"）
    detected_method = method
    if method == "other" or method == "level-up":
        if any(cell in {"等级", "等級"} for cell in header_cells):
            detected_method = "level-up"
    if method == "other" or method == "tm":
        if any("学习器" in cell or "學習器" in cell or "招式记录" in cell or "招式記錄" in cell for cell in header_cells):
            detected_method = "tm"
    if method == "other":
        if any(cell in {"亲代", "親代"} for cell in header_cells):
            detected_method = "egg"
        elif any(cell in {"游戏", "遊戲"} for cell in header_cells):
            detected_method = "tutor"

    results: list[dict] = []
    for row in table.find_all("tr"):
        # 跳过表格底部的注释/说明行（class="sortbottom"），
        # 这些行可能包含招式链接（如"写生"）但不是实际的招式数据。
        row_classes = row.get("class", [])
        if "sortbottom" in row_classes:
            continue
        cells_tags = row.find_all(["th", "td"])
        if not cells_tags:
            continue
        move_anchor = next(
            (
                anchor
                for anchor in row.find_all("a")
                if clean_inline_text(anchor.get("title", "")).endswith("（招式）")
            ),
            None,
        )
        if not move_anchor:
            continue
        cells = [clean_inline_text(cell.get_text(" ", strip=True)) for cell in cells_tags]
        move_cell_index = next(
            (idx for idx, cell in enumerate(cells_tags) if move_anchor in cell.find_all("a")),
            -1,
        )
        if move_cell_index < 0:
            continue
        move_name = to_simplified(clean_inline_text(move_anchor.get_text(" ", strip=True)))
        if not move_name:
            continue

        level = None
        learn_method = detected_method
        tm_number = None

        if detected_method == "level-up":
            before = [cell for cell in cells[:move_cell_index] if cell]
            level_text = before[0] if before else ""
            if re.fullmatch(r"\d+", level_text):
                level = int(level_text)
            elif level_text in {"—", "-", "—"}:
                learn_method = "evolution"
        elif detected_method == "tm":
            before = [cell for cell in cells[:move_cell_index] if cell]
            tm_text = before[0] if before else ""
            # 提取招式学习器编号，如 "招式学习器０１２" → "12"
            # 先将全角数字转为半角（０→0, １→1, ...）
            tm_text_ascii = tm_text.translate(
                str.maketrans("０１２３４５６７８９", "0123456789")
            )
            tm_match = re.search(r"(\d+)", tm_text_ascii)
            if tm_match:
                tm_number = tm_match.group(1).lstrip("0") or "0"

        results.append({
            "move_name_zh": move_name,
            "learn_method": learn_method,
            "level": level,
            "tm_number": tm_number,
            "game_version_code": game_version,
            "notes": None,
        })

    return results


def _extract_form_change_moves(
    table: Tag,
    game_version: str | None,
) -> list[dict]:
    """从形态变化表格中提取招式（如洛托姆的形态专属招式）。

    返回的每条记录包含 ``_form_hint`` 字段（第一列的形态名称文本），
    调用方可据此将招式分配到正确的形态。如果不需要按形态分配，
    可忽略该字段（入库前会被移除）。
    """
    results: list[dict] = []
    for row in table.find_all("tr"):
        row_classes = row.get("class", [])
        if "sortbottom" in row_classes:
            continue
        cells_tags = row.find_all(["th", "td"])
        if not cells_tags:
            continue
        move_anchor = next(
            (
                anchor
                for anchor in row.find_all("a")
                if clean_inline_text(anchor.get("title", "")).endswith("（招式）")
            ),
            None,
        )
        if not move_anchor:
            continue
        move_name = to_simplified(clean_inline_text(move_anchor.get_text(" ", strip=True)))
        if not move_name:
            continue
        # 形态变化招式的 "事件" 列通常是第一列，包含形态名称
        event_text = to_simplified(clean_inline_text(cells_tags[0].get_text(strip=True))) if cells_tags else ""
        results.append({
            "move_name_zh": move_name,
            "learn_method": "form-change",
            "level": None,
            "tm_number": None,
            "game_version_code": game_version,
            "notes": event_text or None,
            "_form_hint": event_text,  # 形态名称提示，用于多形态分配
        })
    return results


def _dispatch_form_change_moves(
    moves: list[dict],
    form_names: list[str],
    result: dict[str, list[dict]],
) -> None:
    """将形态变化招式按 _form_hint 分配到对应形态。

    匹配策略：按形态名称长度降序尝试子串匹配，优先匹配更精确（更长）的
    形态名称。例如 "加热洛托姆" 会优先于 "洛托姆" 被匹配。
    如果无法匹配任何形态，则分配给所有形态（兜底）。
    分配后移除 _form_hint 字段。
    """
    # 按名称长度降序排列，确保更精确的名称优先匹配
    sorted_names = sorted(form_names, key=len, reverse=True)
    for move in moves:
        hint = move.pop("_form_hint", "") or ""
        matched = False
        if hint:
            for form_name in sorted_names:
                # 子串匹配：hint 包含形态名 或 形态名包含 hint
                if form_name in hint or hint in form_name:
                    result[form_name].append(move)
                    matched = True
                    break
        if not matched:
            # 无法匹配 → 分配给所有形态
            for form_name in form_names:
                result[form_name].append(dict(move))


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------

_GAME_VERSION_MAP = {
    "红绿": "RG", "红／绿": "RG", "红/绿": "RG",
    "蓝": "B", "皮卡丘": "Y",
    "金银": "GS", "金／银": "GS", "金/银": "GS",
    "水晶": "C",
    "红宝石蓝宝石": "RS", "红宝石／蓝宝石": "RS",
    "火红叶绿": "FRLG", "火红／叶绿": "FRLG",
    "绿宝石": "E",
    "钻石珍珠": "DP", "钻石／珍珠": "DP",
    "白金": "Pt",
    "心金魂银": "HGSS", "心金／魂银": "HGSS",
    "黑白": "BW", "黑／白": "BW",
    "黑2白2": "B2W2", "黑２白２": "B2W2", "黑２／白２": "B2W2",
    "x y": "XY", "x／y": "XY",
    "欧米伽红宝石阿尔法蓝宝石": "ORAS", "欧米伽红宝石／阿尔法蓝宝石": "ORAS",
    "太阳月亮": "SM", "太阳／月亮": "SM",
    "究极之日究极之月": "USUM", "究极之日／究极之月": "USUM",
    "let's go! 皮卡丘let's go! 伊布": "LGPE", "let's go!皮卡丘／let's go!伊布": "LGPE",
    "剑盾": "SWSH", "剑／盾": "SWSH", "劍／盾": "SWSH",
    "晶灿钻石明亮珍珠": "BDSP", "晶灿钻石／明亮珍珠": "BDSP", "晶燦鑽石／明亮珍珠": "BDSP",
    "传说 阿尔宙斯": "LA", "传说阿尔宙斯": "LA",
    "朱紫": "SV", "朱／紫": "SV",
    "零之秘宝": "SV-DLC",
    "传说 z-a": "ZA", "传说z-a": "ZA", "传说 za": "ZA",
    "pokémon champions": "CHAMP", "pokemon champions": "CHAMP", "champions": "CHAMP",
}


def _extract_game_version_code(text: str) -> str | None:
    """从 h4 标题文本中提取游戏版本代码。如 '《朱／紫》' → 'SV'。"""
    # 去掉书名号
    inner = re.sub(r"[《》]", "", text).strip()
    if not inner:
        return None
    simplified = to_simplified(inner).lower()
    for pattern, code in _GAME_VERSION_MAP.items():
        if pattern in simplified:
            return code
    return None


def _heading_to_method(text: str) -> str | None:
    """将标题文本转换为 learn_method。"""
    simplified = to_simplified(text) or ""
    if "可学会的招式" in simplified or "升级招式" in simplified:
        return "level-up"
    if "招式学习器" in simplified or "招式记录" in simplified:
        return "tm"
    if "秘传学习器" in simplified:
        return "hm"
    if "蛋招式" in simplified or "遗传招式" in simplified:
        return "egg"
    if "教授招式" in simplified:
        return "tutor"
    if "进化前招式" in simplified:
        return "pre-evolution"
    if "特殊招式" in simplified:
        return "special-event"
    return None


def _collect_tables_after(heading: Tag) -> list[Tag]:
    """收集 heading 之后、下一个同级或更高级标题之前的所有招式表格。"""
    tables: list[Tag] = []
    sibling = heading.find_next_sibling()
    while sibling and sibling.name not in ("h2", "h3", "h4", "h5"):
        if sibling.name == "table" and _is_move_table(sibling):
            tables.append(sibling)
        elif sibling.name == "div":
            # 可能是 toggle-content 或其他包裹 div
            for table in sibling.find_all("table"):
                if _is_move_table(table):
                    tables.append(table)
        sibling = sibling.find_next_sibling()
    return tables


def _dedupe_learnset(items: list[dict]) -> list[dict]:
    """对招式列表去重，并清理内部辅助字段。"""
    # 清理 _form_hint 等内部字段
    for item in items:
        item.pop("_form_hint", None)
    return unique_by_key(
        items,
        lambda item: (
            f"{item['move_name_zh']}|{item['learn_method']}|"
            f"{item.get('level')}|{item.get('game_version_code')}|"
            f"{item.get('tm_number')}"
        ),
    )


def learnset_cache_key(dex_number: int, generation: int) -> str:
    return f"pokemon-{dex_number:04d}-gen-{generation}-moves"


def pokemon_cache_key(dex_number: int) -> str:
    return f"pokemon-{dex_number:04d}"


def resolve_pokemon_image_assets(html: str, seed: PokemonSeed, forms: list[dict]) -> dict[str, object]:
    urls = extract_image_candidates(html)
    shiny_urls = [url for url in urls if _has_shiny_marker(extract_file_name(url))]
    shiny_official_urls = [url for url in shiny_urls if not _has_sprite_marker(extract_file_name(url))]
    base = {
        "official": _asset(_pick_best(urls, lambda name: _score_base_image(name, seed, "official")), f"{seed.name_zh}官方图"),
        "shinyOfficial": _asset(_pick_best(shiny_official_urls, lambda name: _score_base_image(name, seed, "shinyOfficial")), f"{seed.name_zh}闪光官方图"),
        "sprite": _asset(_pick_best(urls, lambda name: _score_base_image(name, seed, "sprite")), f"{seed.name_zh}图像"),
        "shinySprite": _asset(_pick_best(shiny_urls, lambda name: _score_base_image(name, seed, "shinySprite")), f"{seed.name_zh}闪光图像"),
    }
    forms_map = {}
    for form in forms:
        official = _pick_best(urls, lambda name: _score_form_image(name, seed, form, "official"))
        shiny = _pick_best(shiny_urls, lambda name: _score_form_image(name, seed, form, "shinyOfficial"))
        forms_map[form["name_zh"]] = {
            "official": _asset(official, f"{form['name_zh']}官方图"),
            "shinyOfficial": _asset(shiny, f"{form['name_zh']}闪光官方图"),
        }
    return {
        "base": {key: value for key, value in base.items() if value},
        "forms": {
            key: {kind: asset for kind, asset in value.items() if asset}
            for key, value in forms_map.items()
            if any(value.values())
        },
    }


def _extract_line_value(text: str, label: str) -> str | None:
    matched = re.search(rf"(?:^|\n){re.escape(label)}\s+([^\n]+)", text)
    return matched.group(1).strip() if matched else None


def _split_type_names(value: str | None) -> list[str]:
    if not value:
        return []
    compact = re.sub(r"\s+", "", value)
    result: list[str] = []
    while compact:
        matched = next((item for item in sorted(KNOWN_TYPES, key=len, reverse=True) if compact.startswith(item)), None)
        if not matched:
            return [value.strip()]
        result.append(matched)
        compact = compact[len(matched):]
    return result


def _extract_types_from_html(html: str) -> list[str]:
    soup = BeautifulSoup(html or "", "html.parser")
    label = soup.find("a", attrs={"title": "属性"})
    if not label:
        return []
    table = label.find_parent("table")
    if not table:
        return []
    names = []
    for anchor in table.find_all("a"):
        title = clean_inline_text(anchor.get("title"))
        label_text = clean_inline_text(anchor.get_text(" ", strip=True))
        name = TYPE_ALIASES.get(label_text, label_text) or TYPE_ALIASES.get(title, title)
        if name in KNOWN_TYPES:
            names.append(name)
    return list(dict.fromkeys(names))[:2]



def _extract_stat_blocks(text: str) -> list[dict]:
    # normalize_text 会把全角 ＨＰ 转成半角 HP，所以同时匹配两种
    pattern = re.compile(
        r"(?:ＨＰ|HP)\s*[：:]?\s*(\d+)[\s\S]{0,360}?攻击\s*[：:]?\s*(\d+)[\s\S]{0,360}?防御\s*[：:]?\s*(\d+)"
        r"[\s\S]{0,360}?特攻\s*[：:]?\s*(\d+)[\s\S]{0,360}?特防\s*[：:]?\s*(\d+)[\s\S]{0,360}?速度\s*[：:]?\s*(\d+)"
    )
    blocks = []
    for matched in pattern.finditer(text):
        values = [int(matched.group(index)) for index in range(1, 7)]
        blocks.append({
            "hp": values[0],
            "atk": values[1],
            "def": values[2],
            "spa": values[3],
            "spd": values[4],
            "spe": values[5],
            "total": sum(values),
        })
    return blocks


def _choose_base_stats(blocks: list[dict]) -> dict | None:
    plausible = [item for item in blocks if item["total"] >= 175]
    if not plausible:
        return None
    chosen = sorted(plausible, key=lambda item: item["total"])[0]
    return {key: chosen[key] for key in ("hp", "atk", "def", "spa", "spd", "spe")}


def _extract_forms_from_html(html: str, base_name_zh: str) -> list[dict]:
    """从 HTML toggle 结构提取宝可梦形态列表。

    Wiki 使用两套 toggle 系统：
    - ``_toggler_show-formN`` 的 ``<th>`` 元素：包含形态名称，CSS class 中
      ``bgl-X`` 为第一属性，``bd-X`` 为第二属性。
    - ``toggle-p-Nbase`` 的 ``<span>`` 元素：种族值切换按钮。
    """
    soup = BeautifulSoup(html or "", "html.parser")

    # 1. 从 _toggler_show-formN 的 <th> 提取形态名称和属性
    form_map: dict[int, dict] = {}
    for th in soup.find_all("th", attrs={
        "class": lambda c: c and any("_toggler_show-form" in cls for cls in (c if isinstance(c, list) else [c]))
    }):
        classes = th.get("class", [])
        # 跳过隐藏的占位符
        if "hide" in classes:
            continue
        name = to_simplified(clean_inline_text(th.get_text(strip=True))) or ""
        if not name:
            continue
        show_match = next((c for c in classes if re.match(r"_toggler_show-form\d+", c)), None)
        if not show_match:
            continue
        form_idx = int(re.search(r"_toggler_show-form(\d+)", show_match).group(1))
        if form_idx in form_map:
            continue  # 每个 form 只取第一次出现
        # 从 CSS class 提取属性：bgl-X = 第一属性, bd-X = 第二属性
        primary_type = None
        secondary_type = None
        for cls in classes:
            if cls.startswith("bgl-"):
                raw = cls[4:]
                mapped = TYPE_ALIASES.get(raw, raw)
                if mapped in KNOWN_TYPES:
                    primary_type = mapped
            elif cls.startswith("bd-") and len(cls) > 3:
                raw = cls[3:]
                mapped = TYPE_ALIASES.get(raw, raw)
                if mapped in KNOWN_TYPES:
                    secondary_type = mapped
        form_map[form_idx] = {
            "name_zh": name,
            "primary_type": primary_type,
            "secondary_type": secondary_type if secondary_type != primary_type else None,
        }

    # 2. 从 toggle-p-Nbase 提取种族值切换按钮中的形态名称和世代标记
    stat_form_names: dict[int, str] = {}
    stat_generation_info: dict[int, dict] = {}  # idx -> {"generation_start": N} 或 {"generation_end": N}
    for span in soup.find_all("span", attrs={
        "class": lambda c: c and "toggle-pbase" in c and "toggle-lbase" not in c
    }):
        classes = span.get("class", [])
        idx_match = next((c for c in classes if re.match(r"toggle-p-\d+base", c)), None)
        if idx_match:
            idx = int(re.search(r"toggle-p-(\d+)base", idx_match).group(1))
            raw_text = to_simplified(clean_inline_text(span.get_text(strip=True))) or ""
            # 解析世代标记：如 "百战勇者（第九世代起）"、"第六世代之前"、"第六世代以前"、"第六世代"
            gen_match = re.search(r"[（(]?(第[一二三四五六七八九十]世代(?:起|之前|以前)?)[）)]?", raw_text)
            if gen_match:
                gen_tag = gen_match.group(1)
                gen_num = generation_from_heading(gen_tag)
                if gen_num:
                    if "起" in gen_tag:
                        stat_generation_info[idx] = {"generation_start": gen_num}
                    elif "之前" in gen_tag or "以前" in gen_tag:
                        stat_generation_info[idx] = {"generation_end": gen_num - 1}
                    else:
                        # 单独的"第N世代"表示仅限该世代
                        stat_generation_info[idx] = {"generation_start": gen_num, "generation_end": gen_num}
                # 去掉世代标记后的纯形态名
                name = re.sub(r"[（(]?第[一二三四五六七八九十]世代(?:起|之前|以前)?[）)]?", "", raw_text).strip()
            else:
                name = raw_text
            if name and name != "一般":
                stat_form_names[idx] = name

    # 3. 从 toggle-cbase 提取每个形态的种族值
    stat_blocks: dict[int, dict] = {}
    for div in soup.find_all("div", attrs={
        "class": lambda c: c and "toggle-cbase" in c
    }):
        classes = div.get("class", [])
        idx_match = next((c for c in classes if re.match(r"toggle-\d+base", c)), None)
        if not idx_match:
            continue
        idx = int(re.search(r"toggle-(\d+)base", idx_match).group(1))
        text = div.get_text(" ", strip=True)
        hp = re.search(r"(?:ＨＰ|HP)\s*[：:]\s*(\d+)", text)
        atk = re.search(r"攻击\s*[：:]\s*(\d+)", text)
        def_ = re.search(r"防御\s*[：:]\s*(\d+)", text)
        spa = re.search(r"特攻\s*[：:]\s*(\d+)", text)
        spd = re.search(r"特防\s*[：:]\s*(\d+)", text)
        spe = re.search(r"速度\s*[：:]\s*(\d+)", text)
        if hp and atk and def_ and spa and spd and spe:
            stat_blocks[idx] = {
                "hp": int(hp.group(1)), "atk": int(atk.group(1)),
                "def": int(def_.group(1)), "spa": int(spa.group(1)),
                "spd": int(spd.group(1)), "spe": int(spe.group(1)),
            }

    # 4. 从 _toggle formN 容器中提取每个形态的特性
    form_abilities: dict[int, dict] = {}
    for container in soup.find_all(
        lambda tag: "_toggle" in (tag.get("class") or [])
        and any(re.match(r"form\d+$", cls) for cls in (tag.get("class") or []))
    ):
        classes = container.get("class", [])
        idx_match = next((cls for cls in classes if re.match(r"form\d+$", cls)), None)
        if not idx_match:
            continue
        idx = int(re.search(r"form(\d+)$", idx_match).group(1))
        if idx in form_abilities:
            continue  # 每个 form 只取第一次出现
        # 找到包含特性链接的 fulltable，再取内层 bgwhite 表格避免重复
        outer_table = None
        for ft in container.find_all("table", class_="fulltable"):
            if ft.find("a", attrs={"title": "特性"}):
                outer_table = ft
                break
        if not outer_table:
            continue
        ability_table = outer_table.find("table", class_="bgwhite") or outer_table
        abilities: list[str] = []
        hidden_ability: str | None = None
        for cell in ability_table.find_all("td"):
            names = extract_ability_names(cell)
            if not names:
                continue
            cell_text = clean_inline_text(cell.get_text(" ", strip=True))
            if "隐藏特性" in cell_text or "隱藏特性" in cell_text:
                hidden_ability = names[0]
            else:
                abilities.extend(names)
        if abilities or hidden_ability:
            form_abilities[idx] = {
                "abilities": abilities,
                "hidden_ability": hidden_ability,
            }

    # 5. 识别默认形态的别名
    #    form_map 中 idx 最小的形态通常就是默认形态。如果它的名字不等于 base_name_zh，
    #    说明默认形态有一个别名（如苍响→百战勇者）。
    default_form_alias: str | None = None
    if form_map:
        first_idx = min(form_map.keys())
        first_name = form_map[first_idx]["name_zh"]
        if first_name != base_name_zh:
            default_form_alias = first_name

    # 6. 收集默认形态（base_name_zh 或其别名）的世代种族值变体
    base_stat_variants: list[dict] = []
    used_stat_indices: set[int] = set()

    # 检查 stat_form_names 中是否有与默认形态（或其别名）精确匹配的条目
    # 使用精确匹配而非 _form_name_matches，避免"搭档皮卡丘"被误判为"皮卡丘"的变体
    for stat_idx, stat_name in stat_form_names.items():
        if stat_idx not in stat_blocks:
            continue
        is_default_match = (
            stat_name == base_name_zh
            or (default_form_alias and stat_name == default_form_alias)
        )
        if is_default_match:
            gen_info = stat_generation_info.get(stat_idx, {})
            variant = {**stat_blocks[stat_idx], **gen_info}
            base_stat_variants.append(variant)
            used_stat_indices.add(stat_idx)

    # 如果没有通过名称匹配到，检查没有形态名的纯世代标记（如皮可西的 "第六世代起"）
    for stat_idx, gen_info in stat_generation_info.items():
        if stat_idx in used_stat_indices:
            continue
        stat_name = stat_form_names.get(stat_idx, "")
        # 纯世代标记（名称为空或就是世代描述本身）
        if stat_idx in stat_blocks and (not stat_name or stat_name == base_name_zh):
            variant = {**stat_blocks[stat_idx], **gen_info}
            base_stat_variants.append(variant)
            used_stat_indices.add(stat_idx)

    # 7. 只使用 form_map（来自 _toggler_show-formN）作为形态来源
    #    stat_form_names 仅用于通过名称模糊匹配来关联种族值
    #    注意：form_map 的 idx 和 stat_blocks 的 idx 是不同的编号系统，不能直接对应
    forms: list[dict] = []
    for idx in sorted(form_map.keys()):
        fm = form_map[idx]
        name = fm["name_zh"]
        if name == base_name_zh:
            continue
        # 跳过默认形态的别名（如苍响的"百战勇者"）
        if default_form_alias and name == default_form_alias:
            continue
        # 跳过搭档/Let's Go/换装/戴帽子等非对战形态
        if any(kw in name for kw in ["搭档", "同行", "Let's Go", "换装", "戴着帽子"]):
            continue

        # 收集该形态的所有种族值变体（可能有多个世代版本）
        # 只通过名称匹配，因为 form_map idx 和 stat_blocks idx 是不同编号系统
        stat_variants: list[dict] = []

        for stat_idx, stat_name in stat_form_names.items():
            if stat_idx in used_stat_indices or stat_idx not in stat_blocks:
                continue
            if _form_name_matches(name, stat_name):
                gen_info = stat_generation_info.get(stat_idx, {})
                stat_variants.append({**stat_blocks[stat_idx], **gen_info})
                used_stat_indices.add(stat_idx)

        # 去重：如果多个变体的世代标记相同（包括都为 None），只保留第一个
        # 这处理了如"超级进化"和"超级进化（传说 Z-A）"被同时匹配但无法区分世代的情况
        if len(stat_variants) > 1:
            seen_gen_keys: list[tuple] = []
            deduped: list[dict] = []
            for v in stat_variants:
                gen_key = (v.get("generation_start"), v.get("generation_end"))
                if gen_key not in seen_gen_keys:
                    seen_gen_keys.append(gen_key)
                    deduped.append(v)
            stat_variants = deduped

        # 获取形态特性
        fa = form_abilities.get(idx, {})
        form_data: dict = {
            "name_zh": name,
            "primary_type": fm.get("primary_type"),
            "secondary_type": fm.get("secondary_type"),
            "abilities": fa.get("abilities", []),
            "hidden_ability": fa.get("hidden_ability"),
        }
        if len(stat_variants) > 1:
            # 多个世代版本的种族值
            form_data["stat_variants"] = stat_variants
            # base_stats 取最新世代的（有 generation_start 的优先）
            latest = next((v for v in stat_variants if "generation_start" in v), stat_variants[0])
            form_data["base_stats"] = {k: latest[k] for k in ("hp", "atk", "def", "spa", "spd", "spe")}
        elif len(stat_variants) == 1:
            form_data["base_stats"] = {k: stat_variants[0][k] for k in ("hp", "atk", "def", "spa", "spd", "spe")}
            if stat_variants[0].get("generation_start") or stat_variants[0].get("generation_end"):
                form_data["stat_variants"] = stat_variants
        else:
            form_data["base_stats"] = None

        forms.append(form_data)

    return {"forms": forms, "base_stat_variants": base_stat_variants}


def _form_name_matches(form_name: str, stat_name: str) -> bool:
    """判断形态名称和种族值切换按钮名称是否指同一个形态。

    例如：'超级喷火龙Ｘ' 匹配 '超级进化Ｘ'，'阿罗拉雷丘' 匹配 '阿罗拉的样子'。
    """
    # 完全包含
    if form_name in stat_name or stat_name in form_name:
        return True
    # 提取关键词匹配
    form_lower = form_name.lower()
    stat_lower = stat_name.lower()
    # 超级进化 X/Y/Z 匹配
    if "超级" in form_lower or "超級" in form_lower:
        suffix = ""
        if "ｘ" in form_lower or "x" in form_lower:
            suffix = "ｘ"
        elif "ｙ" in form_lower or "y" in form_lower:
            suffix = "ｙ"
        elif "ｚ" in form_lower or "z" in form_lower:
            suffix = "ｚ"
        if suffix and suffix in stat_lower:
            return True
        if not suffix and ("超级进化" in stat_lower or "超級進化" in stat_lower) and "ｘ" not in stat_lower and "ｙ" not in stat_lower and "ｚ" not in stat_lower:
            return True
    # 地区形态匹配
    for region in ["阿罗拉", "伽勒尔", "洗翠", "帕底亚"]:
        if region in form_lower and region in stat_lower:
            return True
    # 超极巨化匹配
    if "超极巨" in form_lower and "超极巨" in stat_lower:
        return True
    return False


def _extract_block(text: str, start_label: str, end_labels: list[str]) -> str:
    start = re.search(rf"(?:^|\n){re.escape(start_label)}\s*", text)
    if not start:
        return ""
    tail = text[start.end():]
    end_index = len(tail)
    for label in end_labels:
        matched = re.search(rf"\n{re.escape(label)}\s", tail)
        if matched:
            end_index = min(end_index, matched.start())
    return tail[:end_index].strip()


def _extract_regional_dex_records(text: str) -> list[dict]:
    block = _extract_block(text, "地区图鉴编号", ["地区浏览器编号", "身高", "体重", "叫声"])
    pattern = re.compile(r"(关都|城都|丰缘|神奥|合众|卡洛斯|阿罗拉|伽勒尔|铠岛|王冠雪原|洗翠|帕底亚|北上|蓝莓|密阿雷)\s+#?([0-9A-Z\-]*)")
    return unique_by_key(
        [{"region": match.group(1), "dex_number": match.group(2) or None} for match in pattern.finditer(block)],
        lambda item: f"{item['region']}|{item['dex_number']}",
    )


def _build_generation_availability(seed_generations: list[int], regional_records: list[dict]) -> list[dict]:
    region_generation = {
        "关都": 1, "城都": 2, "丰缘": 3, "神奥": 4, "合众": 5, "卡洛斯": 6,
        "阿罗拉": 7, "伽勒尔": 8, "洗翠": 8, "帕底亚": 9, "北上": 9, "蓝莓": 9,
        "密阿雷": 10, "铠岛": 8, "王冠雪原": 8,
    }
    grouped: dict[int, list[dict]] = {generation: [] for generation in seed_generations}
    for record in regional_records:
        generation = region_generation.get(record["region"])
        if generation:
            grouped.setdefault(generation, []).append(record)
    return [
        {"generation": generation, "regions": unique_by_key(records, lambda item: f"{item['region']}|{item['dex_number']}")}
        for generation, records in sorted(grouped.items())
    ]


def _collect_generations_around(index: int, text: str) -> list[int]:
    window = text[max(0, index - 120): index + 120]
    generations = [
        generation
        for generation in (generation_from_heading(match.group(0)) for match in re.finditer(r"第[一二三四五六七八九]世代", window))
        if generation
    ]
    return sorted(set(generations))


# ---------------------------------------------------------------------------
# 进化链解析
# ---------------------------------------------------------------------------

def parse_evolution_chain(html: str, current_name_zh: str) -> list[dict]:
    """从宝可梦详情页 HTML 中提取进化链数据。

    返回进化步骤列表，每个步骤表示一条进化关系::

        [
            {
                "from_name": "妙蛙种子",
                "from_form": "",
                "to_name": "妙蛙草",
                "to_form": "",
                "stage": 1,
                "condition": "等级 16以上",
                "method": "level-up",
                "level": 16,
                "item": None,
            },
            ...
        ]

    如果该宝可梦不进化（单一形态、无进化链），返回空列表。
    """
    soup = BeautifulSoup(html or "", "html.parser")

    # 查找进化标题（排除"形态变化"等）
    h3_list = [
        h for h in soup.find_all("h3")
        if ("进化" in h.get_text() or "進化" in h.get_text())
        and "形态" not in h.get_text() and "形態" not in h.get_text()
        and "退化" not in h.get_text()
    ]
    if not h3_list:
        return []

    table = h3_list[0].find_next("table")
    if not table:
        return []

    # 解析表格结构
    return _parse_evolution_table(table)


def _parse_evolution_table(table: Tag) -> list[dict]:
    """解析进化链表格，提取所有进化关系。

    52Poké 的进化表格布局规律：
    - 简单线性进化：一行，[pokemon] [condition] [pokemon] [condition] [pokemon]
    - 分支进化（rowspan）：前面的宝可梦 rowspan=2+，后续行包含其他分支
    - 复杂分支（如伊布）：中心行放置基础宝可梦，上下行放置各进化形态
    """
    tbody = table.find("tbody") or table
    outer_rows = tbody.find_all("tr", recursive=False)

    if not outer_rows:
        return []

    # 构建逻辑网格（处理 rowspan/colspan）
    grid = _build_cell_grid(outer_rows)
    if not grid:
        return []

    # 从网格中提取进化关系
    return _extract_evolution_steps(grid)


def _build_cell_grid(rows: list[Tag]) -> list[list[dict]]:
    """构建处理 rowspan 后的逻辑网格。

    每个 cell 包含：
    - type: "pokemon" | "condition" | "arrow" | "empty"
    - 根据 type 不同包含其他字段
    """
    if not rows:
        return []

    # 计算最大列数
    max_cols = 0
    for row in rows:
        cols = sum(int(cell.get("colspan", 1)) for cell in row.find_all("td", recursive=False))
        max_cols = max(max_cols, cols)

    # 构建网格，处理 rowspan
    grid: list[list[dict | None]] = [[None] * max_cols for _ in range(len(rows))]
    rowspan_tracker: list[list[int]] = [[0] * max_cols for _ in range(len(rows))]

    for row_idx, row in enumerate(rows):
        cells = row.find_all("td", recursive=False)
        col_idx = 0
        cell_iter = iter(cells)

        for cell in cell_iter:
            # 跳过被 rowspan 占据的位置
            while col_idx < max_cols and grid[row_idx][col_idx] is not None:
                col_idx += 1
            if col_idx >= max_cols:
                break

            rowspan = int(cell.get("rowspan", 1))
            colspan = int(cell.get("colspan", 1))

            cell_info = _classify_cell(cell)

            # 填充网格（处理 rowspan 和 colspan）
            for r in range(rowspan):
                for c in range(colspan):
                    r_idx = row_idx + r
                    c_idx = col_idx + c
                    if r_idx < len(grid) and c_idx < max_cols:
                        grid[r_idx][c_idx] = cell_info

            col_idx += colspan

    return grid


def _classify_cell(cell: Tag) -> dict:
    """判断单元格类型并提取信息。"""
    # 检查是否包含内嵌表格（宝可梦卡片）
    inner_table = cell.find("table")
    if inner_table:
        return _extract_pokemon_from_cell(inner_table)

    # 获取文本内容
    text = to_simplified(clean_inline_text(cell.get_text(" ", strip=True)))

    # 箭头单元格
    if text and all(c in "→←↑↓↗↖↙↘ " for c in text):
        return {"type": "arrow", "direction": text.strip()}

    # 空单元格
    if not text or len(text.strip()) <= 1:
        return {"type": "empty"}

    # 进化条件单元格
    condition_info = _parse_condition_text(text)
    return {"type": "condition", **condition_info}


def _extract_pokemon_from_cell(inner_table: Tag) -> dict:
    """从内嵌表格中提取宝可梦信息。"""
    name_cell = inner_table.find("td", class_=lambda c: c and "textblack" in c)
    if not name_cell:
        return {"type": "empty"}

    link = name_cell.find("a")
    if not link:
        return {"type": "empty"}

    name = to_simplified(clean_inline_text(link.get_text(strip=True)))
    if not name:
        return {"type": "empty"}

    is_self = "mw-selflink" in (link.get("class") or [])

    # 形态信息
    form_text = ""
    form_small = name_cell.find("small")
    if form_small:
        raw = to_simplified(clean_inline_text(form_small.get_text(strip=True)))
        # 过滤掉非形态的 small 文本（如 "地区形态" 链接文字等）
        if raw and "的样子" in raw:
            form_text = raw

    # 阶段信息
    stage = -1
    for small_tag in inner_table.find_all("small"):
        small_text = small_tag.get_text(strip=True)
        if "进化" in small_text or "進化" in small_text or "幼年" in small_text or "未进化" in small_text or "未進化" in small_text:
            stage = _infer_stage(to_simplified(small_text))
            break

    return {
        "type": "pokemon",
        "name": name,
        "form": form_text,
        "is_self": is_self,
        "stage": stage,
    }


def _infer_stage(text: str) -> int:
    """从阶段文本推断数字。"""
    if "幼年" in text or "未进化" in text:
        return 0
    match = re.search(r"(\d)", text)
    if match:
        return int(match.group(1))
    return -1


def _parse_condition_text(text: str) -> dict:
    """解析进化条件文本，提取方法、等级、道具等信息。"""
    # 清理箭头符号
    clean = re.sub(r"[→←↑↓↗↖↙↘]", "", text).strip()
    clean = re.sub(r"\s+", " ", clean).strip()

    method = "other"
    level = None
    item = None

    # 等级进化
    level_match = re.search(r"等级\s*(\d+)", clean)
    if level_match:
        method = "level-up"
        level = int(level_match.group(1))

    # 道具进化（使用XX石等）
    item_match = re.search(r"使用\s*(.+?)(?:\s*$|\s*（)", clean)
    if item_match:
        method = "item"
        item = item_match.group(1).strip()

    # 交换进化
    if "交换" in clean or "通信" in clean or "连接" in clean:
        method = "trade"
        # 携带道具交换
        trade_item = re.search(r"携带\s*(.+?)\s*(?:交换|通信|$)", clean)
        if trade_item:
            item = trade_item.group(1).strip()

    # 亲密度/友好度进化
    if "亲密度" in clean or "友好度" in clean:
        method = "friendship"

    # 特殊条件（联系绳等）
    rope_match = re.search(r"联系绳", clean)
    if rope_match:
        method = "item"
        item = "联系绳"

    return {
        "condition": clean if clean else None,
        "method": method,
        "level": level,
        "item": item,
    }


def _extract_evolution_steps(grid: list[list[dict]]) -> list[dict]:
    """从逻辑网格中提取进化关系。

    策略：
    1. 遍历每一行，找到 [pokemon] [condition] [pokemon] 模式
    2. 处理 rowspan 分支（同一个前置宝可梦对应多个后续分支）
    3. 处理复杂布局（如伊布，用箭头连接）
    """
    steps: list[dict] = []

    # 收集所有宝可梦在网格中的位置
    pokemon_positions: list[tuple[int, int, dict]] = []
    for r_idx, row in enumerate(grid):
        for c_idx, cell in enumerate(row):
            if cell and cell.get("type") == "pokemon":
                pokemon_positions.append((r_idx, c_idx, cell))

    if len(pokemon_positions) <= 1:
        return []

    # 策略 1：行内线性解析（处理简单和 rowspan 情况）
    seen_steps = set()

    for r_idx, row in enumerate(grid):
        row_len = len(row)
        i = 0
        while i < row_len:
            cell = row[i]
            if cell and cell.get("type") == "pokemon":
                # 查找该宝可梦右边的条件和目标
                from_pokemon = cell
                # 向右寻找 [condition] [pokemon] 模式
                j = i + 1
                condition_info = None
                while j < row_len:
                    next_cell = row[j]
                    if next_cell is None or next_cell.get("type") == "empty":
                        j += 1
                        continue
                    if next_cell.get("type") == "condition":
                        condition_info = next_cell
                        j += 1
                        continue
                    if next_cell.get("type") == "pokemon":
                        if condition_info:
                            step_key = f"{from_pokemon['name']}|{from_pokemon.get('form','')}|{next_cell['name']}|{next_cell.get('form','')}"
                            if step_key not in seen_steps:
                                seen_steps.add(step_key)
                                steps.append(_build_step(from_pokemon, next_cell, condition_info))
                        # 重置条件，继续查找（处理三阶段进化中的第二段）
                        from_pokemon = next_cell
                        condition_info = None
                        j += 1
                        continue
                    if next_cell.get("type") == "arrow":
                        j += 1
                        continue
                    j += 1
                    break
            i += 1

    # 策略 2：处理复杂分支布局（如伊布）
    # 查找箭头指向的进化关系
    arrow_source_names: list[str] = []
    for r_idx, row in enumerate(grid):
        for c_idx, cell in enumerate(row):
            if not cell or cell.get("type") != "arrow":
                continue
            direction = cell.get("direction", "")
            # 根据箭头方向推断进化关系
            source_pos = _find_arrow_source(grid, r_idx, c_idx, direction)
            if source_pos:
                src_r, src_c = source_pos
                source_cell = grid[src_r][src_c]
                # 查找条件（通常在箭头和目标之间，或同行/列）
                target_pos, condition = _find_arrow_target_and_condition(grid, r_idx, c_idx, direction)
                if target_pos and source_cell and source_cell.get("type") == "pokemon":
                    tgt_r, tgt_c = target_pos
                    target_cell = grid[tgt_r][tgt_c]
                    if target_cell and target_cell.get("type") == "pokemon":
                        arrow_source_names.append(source_cell["name"])
                        step_key = f"{source_cell['name']}|{source_cell.get('form','')}|{target_cell['name']}|{target_cell.get('form','')}"
                        if step_key not in seen_steps:
                            seen_steps.add(step_key)
                            steps.append(_build_step(source_cell, target_cell, condition))
                            # 移除策略 1 产生的反向错误步骤
                            # 对称布局中，线性扫描可能误将 [target][cond][source] 识别为进化
                            reverse_key = f"{target_cell['name']}|{target_cell.get('form','')}|{source_cell['name']}|{source_cell.get('form','')}"
                            if reverse_key in seen_steps:
                                seen_steps.discard(reverse_key)
                                steps[:] = [s for s in steps if not (
                                    s["from_name"] == target_cell["name"]
                                    and s.get("from_form", "") == target_cell.get("form", "")
                                    and s["to_name"] == source_cell["name"]
                                    and s.get("to_form", "") == source_cell.get("form", "")
                                )]

    # 修复对称布局中行内扫描的方向错误
    # 如果某个宝可梦是大多数箭头的源（中心宝可梦），翻转所有以它为目标的策略1步骤
    if arrow_source_names:
        from collections import Counter
        source_counts = Counter(arrow_source_names)
        center_name = source_counts.most_common(1)[0][0]
        fixed_steps = []
        for step in steps:
            if step["to_name"] == center_name and step["from_name"] != center_name:
                # 翻转方向：从 "X→center" 变为 "center→X"
                reverse_key = f"{step['from_name']}|{step.get('from_form','')}|{step['to_name']}|{step.get('to_form','')}"
                forward_key = f"{step['to_name']}|{step.get('to_form','')}|{step['from_name']}|{step.get('from_form','')}"
                if forward_key not in seen_steps:
                    seen_steps.discard(reverse_key)
                    seen_steps.add(forward_key)
                    step["from_name"], step["to_name"] = step["to_name"], step["from_name"]
                    step["from_form"], step["to_form"] = step.get("to_form", ""), step.get("from_form", "")
                    fixed_steps.append(step)
                # 如果 forward_key 已存在（即箭头已经产生了正确步骤），丢弃这个重复
            else:
                fixed_steps.append(step)
        steps = fixed_steps

    return steps


def _find_arrow_source(grid: list[list[dict]], row: int, col: int, direction: str) -> tuple[int, int] | None:
    """根据箭头方向，找到进化的源头宝可梦。

    在52Poké的布局中，箭头表示进化方向，从基础形态指向进化形态。
    - ↑↖↗ 表示从下方的基础形态进化到上方的进化形态
    - ↓↙↘ 表示从上方的基础形态进化到下方的进化形态
    所以源在箭头的反方向（垂直+水平分量取反）。

    注意：源宝可梦可能不在同一列（如伊布布局中，箭头在 col 1 但伊布在 col 2），
    所以先查同列，再按水平分量的反方向优先查相邻列。
    """
    search_rows: range
    if "↑" in direction or "↗" in direction or "↖" in direction:
        search_rows = range(row + 1, len(grid))
    elif "↓" in direction or "↙" in direction or "↘" in direction:
        search_rows = range(row - 1, -1, -1)
    else:
        return None

    # 确定水平方向的搜索优先级（源在箭头水平方向的反方向）
    # ↗/↘ 指向右 → 源在左（dc 负优先）
    # ↖/↙ 指向左 → 源在右（dc 正优先）
    if "↗" in direction or "↘" in direction:
        dc_order = [-1, 1, -2, 2]
    elif "↖" in direction or "↙" in direction:
        dc_order = [1, -1, 2, -2]
    else:
        dc_order = [-1, 1, -2, 2]

    max_cols = len(grid[0]) if grid else 0

    # 先在同列查找
    for r in search_rows:
        cell = grid[r][col]
        if cell and cell.get("type") == "pokemon":
            return (r, col)

    # 再按优先级在相邻列查找
    for r in search_rows:
        for dc in dc_order:
            c = col + dc
            if 0 <= c < max_cols:
                cell = grid[r][c]
                if cell and cell.get("type") == "pokemon":
                    return (r, c)

    return None


def _find_arrow_target_and_condition(
    grid: list[list[dict]], row: int, col: int, direction: str
) -> tuple[tuple[int, int] | None, dict | None]:
    """根据箭头方向找到进化的目标宝可梦和条件。

    目标在箭头指向的方向。对于斜向箭头（↖↗↙↘），目标可能在同列或相邻列。
    条件在箭头和目标之间。
    """
    search_rows: range
    if "↑" in direction or "↗" in direction or "↖" in direction:
        search_rows = range(row - 1, -1, -1)
    elif "↓" in direction or "↙" in direction or "↘" in direction:
        search_rows = range(row + 1, len(grid))
    else:
        return None, None

    max_cols = len(grid[0]) if grid else 0
    target_pos: tuple[int, int] | None = None

    # 先在同列查找目标
    for r in search_rows:
        cell = grid[r][col]
        if cell and cell.get("type") == "pokemon":
            target_pos = (r, col)
            break

    # 再在相邻列查找，按箭头水平方向优先
    # ↗/↘ 指向右 → 目标在右（dc 正优先）
    # ↖/↙ 指向左 → 目标在左（dc 负优先）
    if not target_pos:
        if "↗" in direction or "↘" in direction:
            dc_order = [1, -1, 2, -2]
        elif "↖" in direction or "↙" in direction:
            dc_order = [-1, 1, -2, 2]
        else:
            dc_order = [-1, 1, -2, 2]

        for r in search_rows:
            for dc in dc_order:
                c = col + dc
                if 0 <= c < max_cols:
                    cell = grid[r][c]
                    if cell and cell.get("type") == "pokemon":
                        target_pos = (r, c)
                        break
            if target_pos:
                break

    if not target_pos:
        return None, None

    target_row, target_col = target_pos

    # 寻找条件：在箭头和目标之间的行中，同列
    condition = None
    min_r = min(row, target_row)
    max_r = max(row, target_row)
    for r in range(min_r, max_r + 1):
        if r == row or r == target_row:
            continue
        cell = grid[r][col]
        if cell and cell.get("type") == "condition":
            condition = cell
            break

    # 如果同列没找到条件，检查目标列和相邻列
    if not condition:
        search_cols = sorted(set([target_col, col - 1, col + 1, target_col - 1, target_col + 1]))
        for c in search_cols:
            if c == col or c < 0 or c >= max_cols:
                continue
            for r in range(min_r, max_r + 1):
                cell = grid[r][c]
                if cell and cell.get("type") == "condition":
                    condition = cell
                    break
            if condition:
                break

    return target_pos, condition


def _build_step(from_pokemon: dict, to_pokemon: dict, condition: dict | None) -> dict:
    """构建一条进化步骤记录。"""
    step = {
        "from_name": from_pokemon["name"],
        "from_form": from_pokemon.get("form", ""),
        "to_name": to_pokemon["name"],
        "to_form": to_pokemon.get("form", ""),
        "stage": to_pokemon.get("stage", -1),
        "condition": condition.get("condition") if condition else None,
        "method": condition.get("method", "other") if condition else "other",
        "level": condition.get("level") if condition else None,
        "item": condition.get("item") if condition else None,
    }
    return step


def format_accuracy(value: str | None) -> str | None:
    text = clean_inline_text(value)
    if not text:
        return None
    return f"{text}%" if re.fullmatch(r"\d+", text) else text


def _asset(url: str | None, alt: str) -> ImageAsset | None:
    if not url:
        return None
    normalized = normalize_media_url(url)
    return ImageAsset(normalized, alt, normalized)


def _pick_best(urls: list[str], scorer) -> str | None:
    ranked = [(scorer(extract_file_name(url)), len(extract_file_name(url)), url) for url in urls]
    ranked = [item for item in ranked if item[0] > 0]
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return ranked[0][2] if ranked else None


def _pokemon_image_tokens(seed: PokemonSeed) -> tuple[str, str, str]:
    dex3 = f"{seed.dex_number:03d}".lower()
    dex4 = f"{seed.dex_number:04d}".lower()
    english = re.sub(r"[^A-Za-z0-9]+", "", seed.name_en or "").lower()
    return dex3, dex4, english


def _has_shiny_marker(file_name: str) -> bool:
    return bool(re.search(r"(?:^|[_\-\s])s(?:[_\-.]|$)|spr_[0-9]+s_|shiny|色违|異色|异色", file_name, re.I))


def _has_sprite_marker(file_name: str) -> bool:
    return bool(re.search(r"^(spr|mspr)|sprite|icon", file_name, re.I))


def _has_official_marker(file_name: str) -> bool:
    return bool(re.search(r"artwork|official|home|poke_capture|cap\d+", file_name, re.I))


def _score_base_image(file_name: str, seed: PokemonSeed, kind: str) -> int:
    normalized = file_name.lower()
    dex3, dex4, english = _pokemon_image_tokens(seed)
    score = 0
    if dex3 in normalized:
        score += 5
    if dex4 in normalized:
        score += 5
    if english and english in normalized:
        score += 6
    if _has_sprite_marker(file_name):
        score += 7 if "sprite" in kind else -4
    if _has_official_marker(file_name):
        score += 7 if "official" in kind.lower() else -2
    if "dream" in normalized:
        score -= 3
    if "home" in normalized:
        score += 1
    if re.search(r"mega|alola|galar|hisui|paldea", normalized):
        score -= 4
    if _has_shiny_marker(file_name):
        score += 8 if kind.startswith("shiny") else -6
    if kind == "official" and not _has_sprite_marker(file_name) and not _has_shiny_marker(file_name):
        score += 4
    return score


def _score_form_image(file_name: str, seed: PokemonSeed, form: dict, kind: str) -> int:
    normalized = file_name.lower()
    dex3, dex4, english = _pokemon_image_tokens(seed)
    hints, anti_hints = _form_hints(form["name_zh"])
    score = 0
    if dex3 in normalized:
        score += 5
    if dex4 in normalized:
        score += 5
    if english and english in normalized:
        score += 6
    # 提取文件名中编号后紧跟的后缀（如 HOME_003M_s.png → "m", HOME_019A_s → "a"）
    dex_suffix = _extract_dex_suffix(normalized, dex3, dex4)
    hint_matched = False
    for hint in hints:
        # 纯字母短 hint（≤2字符且全字母）使用编号后缀精确匹配，
        # 其他 hint（含下划线如 "_f"，或长 hint）使用子串匹配
        if len(hint) <= 2 and hint.isalpha():
            if dex_suffix and dex_suffix == hint:
                score += 10
                hint_matched = True
        else:
            if hint in normalized:
                score += 8
                hint_matched = True
    # 如果没有匹配到任何形态标记，大幅降分（避免基础图片被选为形态图）
    if hints and not hint_matched:
        score -= 10
    # 如果匹配到了其他形态的标记（如 X 形态的图被匹配给 Y），降分
    for anti in anti_hints:
        if len(anti) <= 2 and anti.isalpha():
            if dex_suffix and dex_suffix == anti:
                score -= 15
        else:
            if anti in normalized:
                score -= 15
    if _has_official_marker(file_name):
        score += 7
    if "home" in normalized:
        score += 5
    if "dream" in normalized:
        score -= 5
    if _has_sprite_marker(file_name):
        score -= 3 if kind == "shinyOfficial" else 12
    if _has_shiny_marker(file_name):
        score += 7 if kind == "shinyOfficial" else -6
    elif kind == "shinyOfficial":
        score -= 5
    return score


def _extract_dex_suffix(normalized_name: str, dex3: str, dex4: str) -> str | None:
    """从文件名中提取编号后紧跟的后缀字母。

    例如：
      HOME_003M_s.png  → "m"
      HOME_019A_s.png  → "a"
      HOME_006MX_s.png → "mx"
      HOME_003GM_s.png → "gm"
      HOME_003_s.png   → None (无后缀)
      HOME_003_f_s.png → None (_f 带下划线分隔，不是编号后缀)
      HOME_479F.png    → "f" (结冰洛托姆等形态后缀)

    注意：_f 格式（下划线+f）不会被提取，因为下划线不是字母，
    正则只匹配编号后紧跟的字母。所以雌性标记 _f 不受影响。
    """
    # 尝试匹配 dex4 或 dex3 后紧跟的字母
    for dex in (dex4, dex3):
        pattern = re.compile(rf"{re.escape(dex)}([a-z]{{1,2}})(?:[_.]|$)")
        m = pattern.search(normalized_name)
        if m:
            suffix = m.group(1)
            # 排除 px (缩略图尺寸标记)
            if suffix == "px":
                continue
            return suffix
    return None


def _form_hints(name_zh: str) -> tuple[list[str], list[str]]:
    """返回 (hints, anti_hints)，hints 是当前形态的文件名标记，anti_hints 是其他形态的标记。

    短 hint（≤2字符）会与编号后缀精确匹配（通过 _extract_dex_suffix），
    长 hint（>2字符）使用子串匹配。

    Wiki HOME 图片文件名后缀约定（按类别）：
      --- 超级进化 / 极巨化 ---
      M = Mega, MX/MY = Mega X/Y, MZ = Mega (Z-A), GM = Gigantamax
      --- 地区形态 ---
      A = Alola, G = Galar, H = Hisui, P = Paldea
      PA/PB/PC = Paldea Combat/Blaze/Aqua (肯泰罗帕底亚种)
      --- 传说 / 特殊形态 ---
      C = Crowned (剑之王/盾之王), O = Origin (起源形态),
      P = Primal (原始回归), U = Unbound/Ultra (解放/究极)
      T = Therian (灵兽形态), R = Rapid-Strike/Rider (连击流/骑乘)
      I = Ice Rider (骑白马), S = Shadow Rider (骑黑马)
      --- 外观 / 性别差异 ---
      _f = Female (雌性的样子)
      E = East (东海), B/W = Black/White or Blue/White
      S/Su/A/W = Summer/Autumn/Winter (季节)
      --- 战斗形态 ---
      Z = Zen (达摩模式), B = Blade (刀剑形态)
      DM/DW = Dusk Mane/Dawn Wings (黄昏之鬃/拂晓之翼)
      --- 其他 ---
      N = Neutral (放松模式), D = Dusk (黄昏), Mn = Midnight (黑夜)
      Sm/La/Su = Small/Large/Super (南瓜精尺寸)
      Go/Gu = Gorging/Gulping (古月鸟吞食)
      L = Low Key (低调), NF = No-ice Face (解冻头)
      HM = Hangry Mode (空腹花纹), Sc = School (鱼群)
      Pa/Po/Se = Pa'u/Pom-Pom/Sensu (花舞鸟风格)
      F = Family of Four (四只家庭), Th = Three-Segment (三节形态)
      R = Roaming (徒步形态), H = Hero (全能形态)
    """
    hints: list[str] = []
    anti_hints: list[str] = []

    # ── 超极巨化：GM 后缀（必须在超级之前检查，因为超极巨也包含"超"）──
    if "超极巨" in name_zh:
        hints.extend(["gm", "gigantamax"])
    elif "超级" in name_zh:
        # 超级进化：M 后缀
        if "Ｚ" in name_zh or "Z" in name_zh:
            # 超级进化 Z-A 版本：MZ 后缀（如超级阿勃梭鲁Ｚ）
            hints.extend(["mz"])
            anti_hints.extend(["m"])
        else:
            hints.extend(["m", "mega"])

    # ── 地区形态 ──
    if "阿罗拉" in name_zh:
        hints.extend(["a", "alola"])
    if "伽勒尔" in name_zh:
        hints.extend(["g", "galar"])
    if "洗翠" in name_zh:
        hints.extend(["h", "hisui"])
    if "帕底亚" in name_zh:
        hints.extend(["p", "paldea"])
        # 肯泰罗帕底亚种：PA = 斗战种, PB = 火炽种, PC = 水澜种
        if "斗战种" in name_zh:
            hints.clear()
            hints.extend(["pa"])
            anti_hints.extend(["pb", "pc"])
        elif "火炽种" in name_zh:
            hints.clear()
            hints.extend(["pb"])
            anti_hints.extend(["pa", "pc"])
        elif "水澜种" in name_zh:
            hints.clear()
            hints.extend(["pc"])
            anti_hints.extend(["pa", "pb"])

    # ── 超级进化 X/Y 形态：文件名中用 MX/MY 缩写 ──
    if "X" in name_zh or "Ｘ" in name_zh:
        hints.extend(["mx", "mega_x", "mega x"])
        anti_hints.extend(["my", "mega_y", "mega y"])
    elif "Y" in name_zh or "Ｙ" in name_zh:
        hints.extend(["my", "mega_y", "mega y"])
        anti_hints.extend(["mx", "mega_x", "mega x"])

    # ── 传说 / 特殊形态 ──
    # Crowned 形态（苍响-剑之王 / 藏玛然特-盾之王）：C 后缀
    if "剑之王" in name_zh or "盾之王" in name_zh:
        hints.extend(["c", "crowned"])
    # Origin 形态（骑拉帝纳/帕路奇亚/帝牙卢卡-起源形态）：O 后缀
    if "起源" in name_zh:
        hints.extend(["o", "origin"])
    # Primal 原始回归（盖欧卡/固拉多）：P 后缀
    if "原始" in name_zh:
        hints.extend(["p", "primal"])
    # Therian 灵兽形态（龙卷云/雷电云/土地云/眷恋云）：T 后缀
    if "灵兽" in name_zh:
        hints.extend(["t", "therian"])
    # Unbound/Ultra 解放形态（胡帕/究极奈克洛兹玛）：U 后缀
    if "解放" in name_zh or "究极" in name_zh:
        hints.extend(["u", "unbound"])

    # ── 蕾冠王骑乘形态 ──
    if "骑白马" in name_zh:
        hints.extend(["i", "ice_rider", "ice rider"])
        anti_hints.extend(["s", "shadow_rider", "shadow rider"])
    elif "骑黑马" in name_zh:
        hints.extend(["s", "shadow_rider", "shadow rider"])
        anti_hints.extend(["i", "ice_rider", "ice rider"])

    # ── 武道熊师：R = Rapid-Strike (连击流) ──
    if "连击流" in name_zh and "超极巨" not in name_zh:
        hints.extend(["r", "rapid_strike"])
    # 超极巨化武道熊师连击流：RGM 后缀
    if "连击流" in name_zh and "超极巨" in name_zh:
        hints.clear()
        hints.extend(["rgm"])
        anti_hints.extend(["gm"])

    # ── 奈克洛兹玛形态 ──
    if "黄昏之鬃" in name_zh:
        hints.extend(["dm", "dusk_mane"])
        anti_hints.extend(["dw"])
    elif "拂晓之翼" in name_zh:
        hints.extend(["dw", "dawn_wings"])
        anti_hints.extend(["dm"])

    # ── 酋雷姆形态：B = Black (暗黑), W = White (焰白) ──
    if "暗黑" in name_zh:
        hints.extend(["b", "black"])
        anti_hints.extend(["w"])
    elif "焰白" in name_zh:
        hints.extend(["w", "white"])
        anti_hints.extend(["b"])

    # ── 性别差异：_f 后缀 ──
    if "雌性" in name_zh:
        hints.extend(["_f", "female"])

    # ── 飘浮泡泡形态：S = Sunny (太阳), R = Rainy (雨水), H = Snowy (雪云) ──
    if "太阳的样子" in name_zh:
        hints.extend(["s", "sunny"])
        anti_hints.extend(["r", "h"])
    elif "雨水的样子" in name_zh:
        hints.extend(["r", "rainy"])
        anti_hints.extend(["s", "h"])
    elif "雪云的样子" in name_zh:
        hints.extend(["h", "snowy"])
        anti_hints.extend(["s", "r"])

    # ── 代欧奇希斯形态：A = Attack, D = Defense, S = Speed ──
    if "攻击形态" in name_zh:
        hints.extend(["a", "attack"])
        anti_hints.extend(["d", "s"])
    elif "防御形态" in name_zh:
        hints.extend(["d", "defense"])
        anti_hints.extend(["a", "s"])
    elif "速度形态" in name_zh:
        hints.extend(["s", "speed"])
        anti_hints.extend(["a", "d"])

    # ── 结草儿/结草贵妇蓑衣：S = Sandy (砂土), G = Trash (垃圾) ──
    if "砂土蓑衣" in name_zh:
        hints.extend(["s", "sandy"])
        anti_hints.extend(["g"])
    elif "垃圾蓑衣" in name_zh:
        hints.extend(["g", "trash"])
        anti_hints.extend(["s"])

    # ── 樱花儿晴天形态：S 后缀 ──
    if "晴天形态" in name_zh:
        hints.extend(["s", "sunshine"])

    # ── 无壳海兔/海兔兽东海：E = East ──
    if "东海" in name_zh:
        hints.extend(["e", "east"])

    # ── 洛托姆形态 ──
    if "加热" in name_zh:
        hints.extend(["h", "heat"])
        anti_hints.extend(["w", "fa", "f", "m"])
    elif "清洗" in name_zh:
        hints.extend(["w", "wash"])
        anti_hints.extend(["h", "fa", "f", "m"])
    elif "结冰" in name_zh:
        hints.extend(["f", "frost"])
        anti_hints.extend(["h", "w", "fa", "m"])
    elif "旋转" in name_zh:
        hints.extend(["fa", "fan"])
        anti_hints.extend(["h", "w", "f", "m"])
    elif "切割" in name_zh:
        hints.extend(["m", "mow"])
        anti_hints.extend(["h", "w", "f", "fa"])

    # ── 谢米天空形态：S 后缀 ──
    if "天空形态" in name_zh:
        hints.extend(["s", "sky"])

    # ── 野蛮鲈鱼：B = Blue (蓝条纹), W = White (白条纹) ──
    if "蓝条纹" in name_zh:
        hints.extend(["b", "blue"])
        anti_hints.extend(["w"])
    elif "白条纹" in name_zh:
        hints.extend(["w", "white_stripe"])
        anti_hints.extend(["b"])

    # ── 达摩狒狒达摩模式：Z = Zen ──
    if "达摩模式" in name_zh and "伽勒尔" not in name_zh:
        hints.extend(["z", "zen"])
        anti_hints.extend(["gz"])
    elif "达摩模式" in name_zh and "伽勒尔" in name_zh:
        hints.extend(["gz"])
        anti_hints.extend(["z", "g"])

    # ── 四季鹿/萌芽鹿季节：S = Summer, A = Autumn, W = Winter ──
    if "夏天的样子" in name_zh:
        hints.extend(["s", "summer"])
        anti_hints.extend(["a", "w"])
    elif "秋天的样子" in name_zh:
        hints.extend(["a", "autumn"])
        anti_hints.extend(["s", "w"])
    elif "冬天的样子" in name_zh:
        hints.extend(["w", "winter"])
        anti_hints.extend(["s", "a"])

    # ── 凯路迪欧觉悟形态：R = Resolute ──
    if "觉悟" in name_zh:
        hints.extend(["r", "resolute"])

    # ── 美洛耶塔舞步形态：P = Pirouette ──
    if "舞步" in name_zh:
        hints.extend(["p", "pirouette"])

    # ── 甲贺忍蛙牵绊变身：A = Ash (小智版) ──
    if "牵绊变身" in name_zh:
        hints.extend(["a", "ash"])

    # ── 花叶蒂永恒之花：E = Eternal ──
    if "永恒之花" in name_zh:
        hints.extend(["e", "eternal"])

    # ── 坚盾剑怪刀剑形态：B = Blade ──
    if "刀剑形态" in name_zh:
        hints.extend(["b", "blade"])

    # ── 南瓜精/南瓜怪人尺寸：Sm = Small, La = Large, Su = Super ──
    if "小颗种" in name_zh:
        hints.extend(["sm", "small"])
        anti_hints.extend(["la", "su"])
    elif "大颗种" in name_zh:
        hints.extend(["la", "large"])
        anti_hints.extend(["sm", "su"])
    elif "巨颗种" in name_zh:
        hints.extend(["su", "super"])
        anti_hints.extend(["sm", "la"])

    # ── 哲尔尼亚斯放松模式：N = Neutral ──
    if "放松模式" in name_zh:
        hints.extend(["n", "neutral"])

    # ── 基格尔德形态：T = 10%, C = Complete ──
    if "１０％" in name_zh or "10%" in name_zh:
        hints.extend(["t", "ten"])
        anti_hints.extend(["c"])
    elif "完全体" in name_zh:
        hints.extend(["c", "complete"])
        anti_hints.extend(["t"])

    # ── 花舞鸟风格：Pa = Pa'u (啪滋啪滋), Po = Pom-Pom (呼拉呼拉), Se = Sensu (轻盈轻盈) ──
    if "啪滋啪滋" in name_zh:
        hints.extend(["pa"])
        anti_hints.extend(["po", "se"])
    elif "呼拉呼拉" in name_zh:
        hints.extend(["po"])
        anti_hints.extend(["pa", "se"])
    elif "轻盈轻盈" in name_zh:
        hints.extend(["se"])
        anti_hints.extend(["pa", "po"])

    # ── 鬃岩狼人形态：Mn = Midnight (黑夜), D = Dusk (黄昏) ──
    if "黑夜的样子" in name_zh:
        hints.extend(["mn", "midnight"])
        anti_hints.extend(["d"])
    elif "黄昏的样子" in name_zh:
        hints.extend(["d", "dusk"])
        anti_hints.extend(["mn"])

    # ── 弱丁鱼鱼群形态：Sc = School ──
    if "鱼群" in name_zh:
        hints.extend(["sc", "school"])

    # ── 小陨星核心：R = Core (实际文件名用 R，但也有多色版本) ──
    if "核心" in name_zh:
        hints.extend(["r", "core"])

    # ── 谜拟Q现形：B = Busted ──
    if "现形" in name_zh:
        hints.extend(["b", "busted"])

    # ── 玛机雅娜500年前颜色：O = Original ──
    if "５００年前" in name_zh or "500年前" in name_zh:
        if "超级" in name_zh:
            hints.extend(["om"])
            anti_hints.extend(["m", "o"])
        else:
            hints.extend(["o", "original"])
            anti_hints.extend(["om"])

    # ── 古月鸟吞食形态：Go = Gorging (一口吞), Gu = Gulping (大口吞) ──
    if "一口吞" in name_zh:
        hints.extend(["go", "gorging"])
        anti_hints.extend(["gu"])
    elif "大口吞" in name_zh:
        hints.extend(["gu", "gulping"])
        anti_hints.extend(["go"])

    # ── 颤弦蝾螈低调：L = Low Key ──
    if "低调" in name_zh:
        hints.extend(["l", "low_key"])

    # ── 冰砌鹅解冻头：NF = No-ice Face ──
    if "解冻头" in name_zh:
        hints.extend(["nf", "noice"])

    # ── 莫鲁贝可空腹花纹：HM = Hangry Mode ──
    if "空腹花纹" in name_zh:
        hints.extend(["hm", "hangry"])

    # ── 无极汰那无极巨化：E = Eternamax ──
    if "无极巨化" in name_zh:
        hints.extend(["e", "eternamax"])

    # ── 萨戮德阿爸：D = Dada ──
    if "阿爸" in name_zh:
        hints.extend(["d", "dada"])

    # ── 月月熊赫月：B = Bloodmoon ──
    if "赫月" in name_zh:
        hints.extend(["b", "bloodmoon"])

    # ── 一家鼠四只家庭：F = Family of Four ──
    if "四只家庭" in name_zh:
        hints.extend(["f", "family"])

    # ── 怒鹦哥羽毛颜色：B = Blue, Y = Yellow, W = White ──
    if "蓝羽毛" in name_zh:
        hints.extend(["b", "blue"])
        anti_hints.extend(["y", "w"])
    elif "黄羽毛" in name_zh:
        hints.extend(["y", "yellow"])
        anti_hints.extend(["b", "w"])
    elif "白羽毛" in name_zh:
        hints.extend(["w", "white"])
        anti_hints.extend(["b", "y"])

    # ── 海豚侠全能形态：H = Hero ──
    if "全能形态" in name_zh:
        hints.extend(["h", "hero"])

    # ── 米立龙姿势：D = Droopy (下垂), S = Stretchy (平挺) ──
    if "下垂姿势" in name_zh:
        if "超级" in name_zh:
            hints.extend(["dm"])
            anti_hints.extend(["sm", "m", "d", "s"])
        else:
            hints.extend(["d", "droopy"])
            anti_hints.extend(["s"])
    elif "平挺姿势" in name_zh:
        if "超级" in name_zh:
            hints.extend(["sm"])
            anti_hints.extend(["dm", "m", "d", "s"])
        else:
            hints.extend(["s", "stretchy"])
            anti_hints.extend(["d"])

    # ── 土龙节节三节形态：Th = Three-Segment ──
    if "三节形态" in name_zh:
        hints.extend(["th", "three"])

    # ── 索财灵徒步形态：R = Roaming ──
    if "徒步形态" in name_zh:
        hints.extend(["r", "roaming"])

    # ── 厄诡椪面具形态：W = Wellspring (水井), H = Hearthflame (火灶), C = Cornerstone (础石) ──
    if "水井面具" in name_zh:
        hints.extend(["w", "wellspring"])
        anti_hints.extend(["h", "hearthflame", "c", "cornerstone"])
    elif "火灶面具" in name_zh:
        hints.extend(["h", "hearthflame"])
        anti_hints.extend(["w", "wellspring", "c", "cornerstone"])
    elif "础石面具" in name_zh:
        hints.extend(["c", "cornerstone"])
        anti_hints.extend(["w", "wellspring", "h", "hearthflame"])

    # ── 太乐巴戈斯形态：T = Terastal (太晶), S = Stellar (星晶) ──
    if "太晶形态" in name_zh:
        hints.extend(["t", "terastal"])
        anti_hints.extend(["s", "stellar"])
    elif "星晶形态" in name_zh:
        hints.extend(["s", "stellar"])
        anti_hints.extend(["t", "terastal"])

    return hints, anti_hints
