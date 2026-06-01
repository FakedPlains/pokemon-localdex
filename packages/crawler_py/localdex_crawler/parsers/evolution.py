from __future__ import annotations

import re

from bs4 import BeautifulSoup
from bs4 import Tag

from ..text import clean_inline_text, to_simplified


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
                    break
                    j += 1
                i = j
            else:
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
