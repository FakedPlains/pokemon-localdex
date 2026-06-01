from __future__ import annotations

import re

from bs4 import BeautifulSoup
from bs4 import Tag

from ..fetcher import RawPage
from ..text import clean_inline_text, to_simplified, unique_by_key


def parse_learnset_page(page: RawPage, generation: int) -> dict[str, list[dict]]:
    """解析招式表页面，返回按来源形态标签分组的招式列表。

    返回格式::

        {
            "default": [
                {"move_name_zh": "...", "learn_method": "level-up", "level": 5,
                 "game_version_code": "SV", "tm_number": None, "notes": None},
                ...
            ],
            "骑白马的样子": [...],
        }

    每个来源形态标签对应一个完整的招式列表；写库时会映射到 pokemon_forms.id。
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
