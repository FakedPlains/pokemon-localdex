"""解析 pokechamdb.com RSC payload 中的使用率数据。

pokechamdb.com 是 Next.js App Router SPA，数据嵌入在页面的
`self.__next_f.push([1, "..."])` 脚本中。RSC payload 的行格式为：
  <id>:<type>:<JSON payload>

列表页数据结构：
  pokemonList entries: [{ rank, pokemonJa, pokemonSlug, pokemonDisplay, pokemonEn }]

详情页数据结构（RSC 组件 props）：
  每个统计维度是一个独立组件 prop，通过 iconLabel 标识：
  - MOVES: entries [{rank, percentage, name(日文)}] + displayNames {日文:中文} + moveMeta
  - ITEMS: entries [{rank, percentage, name(日文)}] + displayNames {日文:中文}
  - ABILITY: entries [{rank, percentage, name(日文)}] + displayNames {日文:中文}
  - NATURE: entries [{rank, percentage, name(日文)}] + displayNames {日文:中文}
  - PARTNER: entries [{rank, percentage, name(日文)}] + displayNames {日文:中文}
  - EV分布: 直接嵌入 table tbody 渲染（rank, hp, atk, def, spa, spd, spe, percentage）
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import re
from typing import Any


@dataclass(frozen=True)
class UsagePokemonEntry:
    """列表页中的宝可梦排名条目。"""

    slug: str
    rank: int
    name_zh: str
    name_en: str | None = None


@dataclass(frozen=True)
class UsageMoveEntry:
    """详情页中的招式使用率条目。"""

    name_zh: str
    rank: int
    percentage: float


@dataclass(frozen=True)
class UsageItemEntry:
    """详情页中的道具使用率条目。"""

    name_zh: str
    rank: int
    percentage: float


@dataclass(frozen=True)
class UsageAbilityEntry:
    """详情页中的特性使用率条目。"""

    name_zh: str
    rank: int
    percentage: float


@dataclass(frozen=True)
class UsageNatureEntry:
    """详情页中的性格使用率条目。"""

    name_zh: str
    rank: int
    percentage: float


@dataclass(frozen=True)
class UsagePartnerEntry:
    """详情页中的队友条目。"""

    slug: str
    name_zh: str
    rank: int


@dataclass(frozen=True)
class UsageEvSpreadEntry:
    """详情页中的 EV 分布条目。"""

    rank: int
    percentage: float
    hp: int = 0
    atk: int = 0
    def_: int = 0
    sp_atk: int = 0
    sp_def: int = 0
    speed: int = 0


@dataclass
class UsageSeasonMeta:
    """从页面中提取的赛季元数据。"""

    season_id: str  # e.g. "M-2"
    format: str  # e.g. "single"
    start_date: str | None = None
    end_date: str | None = None


@dataclass
class UsagePokemonDetail:
    """某个宝可梦的完整使用率详情数据。"""

    slug: str
    name_zh: str
    moves: list[UsageMoveEntry] = field(default_factory=list)
    items: list[UsageItemEntry] = field(default_factory=list)
    abilities: list[UsageAbilityEntry] = field(default_factory=list)
    natures: list[UsageNatureEntry] = field(default_factory=list)
    partners: list[UsagePartnerEntry] = field(default_factory=list)
    ev_spreads: list[UsageEvSpreadEntry] = field(default_factory=list)


def extract_rsc_payloads(html: str) -> list[Any]:
    """从 HTML 中提取所有 RSC payload JSON 对象。

    查找 `self.__next_f.push([1, "..."])` 脚本，解码转义后尝试 JSON 解析。
    返回所有成功解析出的 JSON 对象/数组。
    """
    if not html:
        return []

    # 匹配 self.__next_f.push([1,"..."]) 中的内容
    pattern = re.compile(r'self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\s*\]\)', re.DOTALL)
    payloads: list[Any] = []

    for match in pattern.finditer(html):
        raw = match.group(1)
        # 解码 JS 字符串转义
        decoded = _decode_js_string_escape(raw)
        # RSC payload 由多行组成，每行格式: <id>:<type>:<data>
        # 尝试从中提取 JSON 数据
        for line in decoded.split("\n"):
            line = line.strip()
            if not line:
                continue
            # 跳过 RSC 行头部（如 "0:" "1:" "2:I" "3:T..."）
            json_start = _find_json_start(line)
            if json_start < 0:
                continue
            json_str = line[json_start:]
            try:
                obj = json.loads(json_str)
                if isinstance(obj, (dict, list)):
                    payloads.append(obj)
            except (json.JSONDecodeError, ValueError):
                continue

    return payloads


def extract_rsc_text(html: str) -> str:
    """从 HTML 中提取并拼接所有 RSC payload 文本（解码转义后）。

    与 extract_rsc_payloads 不同，此函数返回的是原始解码文本，
    适合用正则直接从中提取嵌套在 RSC 树中的数据（如 entries 数组）。
    """
    if not html:
        return ""

    pattern = re.compile(r'self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\s*\]\)', re.DOTALL)
    parts: list[str] = []

    for match in pattern.finditer(html):
        raw = match.group(1)
        decoded = _decode_js_string_escape(raw)
        parts.append(decoded)

    return "\n".join(parts)


def parse_usage_list(html: str) -> list[UsagePokemonEntry]:
    """从使用率列表页 HTML 解析宝可梦排名。

    pokechamdb.com 的 RSC payload 中，宝可梦列表数据嵌套在 React 组件 props 的
    `entries` 数组中，每个条目格式为：
    {"rank":1, "pokemonJa":"...", "pokemonSlug":"garchomp",
     "pokemonDisplay":"烈咬陆鲨", "pokemonEn":"Garchomp", "teraIcons":"$undefined"}
    """
    rsc_text = extract_rsc_text(html)
    if not rsc_text:
        return []

    # RSC payload 的 chunk 拼接可能在 JSON 键名/值中间插入换行符，
    # 导致正则无法匹配。在匹配前去除换行以确保完整提取。
    rsc_text = rsc_text.replace("\n", "")

    entries: list[UsagePokemonEntry] = []

    # 使用正则从 RSC 文本中提取 entries 数组内的对象
    entry_pattern = re.compile(
        r'\{"rank":(\d+),'
        r'"pokemonJa":"[^"]*",'
        r'"pokemonSlug":"([^"]+)",'
        r'"teraIcons":"[^"]*",'
        r'"pokemonDisplay":"([^"]*)",'
        r'"pokemonEn":"([^"]*)"\}',
    )

    for match in entry_pattern.finditer(rsc_text):
        rank = int(match.group(1))
        slug = match.group(2)
        name_zh = match.group(3)
        name_en = match.group(4)
        entries.append(
            UsagePokemonEntry(
                slug=slug,
                rank=rank,
                name_zh=name_zh,
                name_en=name_en,
            )
        )

    # 去重保留首次出现
    seen: set[str] = set()
    unique: list[UsagePokemonEntry] = []
    for entry in entries:
        if entry.slug not in seen:
            seen.add(entry.slug)
            unique.append(entry)
    return unique


def parse_usage_detail(html: str, slug: str) -> UsagePokemonDetail:
    """从宝可梦详情页 HTML 解析使用率统计数据。

    详情页的数据嵌在 RSC 组件树的 props 中，每个统计面板是一个独立组件：
    {"title":"招式","iconLabel":"MOVES","entries":[{rank,percentage,name}],
     "displayNames":{日文名:中文名},...}

    EV 分布直接在 table tbody 中以数值嵌入。
    """
    rsc_text = extract_rsc_text(html)
    if not rsc_text:
        return UsagePokemonDetail(slug=slug, name_zh="")

    # RSC chunk 拼接可能在任意位置插入换行符，统一去除
    rsc_text = rsc_text.replace("\n", "")

    detail = UsagePokemonDetail(slug=slug, name_zh="")

    # 解析各个统计面板
    detail.moves = _parse_panel_entries_as_moves(rsc_text, "MOVES")
    detail.items = _parse_panel_entries_as_items(rsc_text, "ITEMS")
    detail.abilities = _parse_panel_entries_as_abilities(rsc_text, "ABILITY")
    detail.natures = _parse_panel_entries_as_natures(rsc_text, "NATURE")
    detail.partners = _parse_panel_entries_as_partners(rsc_text, "PARTNER")

    # 解析 EV 分布（从 table 结构中提取）
    detail.ev_spreads = _parse_ev_spreads_from_table(rsc_text)

    # 尝试提取中文名
    detail.name_zh = _extract_pokemon_name_zh(rsc_text, slug)

    return detail


def parse_seasons_from_page(html: str) -> list[UsageSeasonMeta]:
    """从页面中提取可用赛季列表。"""
    payloads = extract_rsc_payloads(html)
    seasons: list[UsageSeasonMeta] = []

    for obj in payloads:
        found = _find_seasons_data(obj)
        for item in found:
            season_id = item.get("id") or item.get("season") or item.get("seasonId") or ""
            fmt = item.get("format") or item.get("battleFormat") or ""
            if season_id:
                seasons.append(
                    UsageSeasonMeta(
                        season_id=str(season_id),
                        format=str(fmt),
                        start_date=item.get("startDate"),
                        end_date=item.get("endDate"),
                    )
                )

    return seasons


# --- 详情页面板解析 ---


def _find_panel_section(rsc_text: str, icon_label: str) -> str | None:
    """在 RSC 文本中找到指定 iconLabel 的面板组件 props 区域。

    面板结构: {"title":"...","iconLabel":"MOVES","entries":[...],"displayNames":{...},...}
    我们需要提取从 entries 到 displayNames 的完整区域。
    """
    # 找到 iconLabel 标记位置
    marker = f'"iconLabel":"{icon_label}"'
    idx = rsc_text.find(marker)
    if idx < 0:
        return None

    # 向前搜索这个对象的开始（找到包含 title 的 { ）
    # 从 marker 往前找到最近的 {"title": 开始
    search_start = max(0, idx - 200)
    obj_start = rsc_text.rfind('{"title":', search_start, idx)
    if obj_start < 0:
        obj_start = rsc_text.rfind("{", search_start, idx)
    if obj_start < 0:
        return None

    # 从 obj_start 开始找到匹配的 }
    # 使用简单的括号计数
    brace_count = 0
    i = obj_start
    while i < len(rsc_text):
        ch = rsc_text[i]
        if ch == "{":
            brace_count += 1
        elif ch == "}":
            brace_count -= 1
            if brace_count == 0:
                return rsc_text[obj_start : i + 1]
        elif ch == '"':
            # 跳过字符串内容
            i += 1
            while i < len(rsc_text) and rsc_text[i] != '"':
                if rsc_text[i] == "\\":
                    i += 1  # 跳过转义字符
                i += 1
        i += 1

    return None


def _parse_panel_json(rsc_text: str, icon_label: str) -> dict | None:
    """尝试把面板区域解析为 JSON。

    RSC payload 可能跨越多个 <script> 边界，解码后文本中会残留
    控制字符（如换行符），需要清理后再解析。
    """
    section = _find_panel_section(rsc_text, icon_label)
    if not section:
        return None
    # 清理控制字符（RSC 跨 script 标签边界时引入的 \n \r \t 等）
    cleaned = re.sub(r'[\x00-\x1f\x7f]', '', section)
    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        return None


def _parse_panel_entries_as_moves(rsc_text: str, icon_label: str) -> list[UsageMoveEntry]:
    """从面板数据中提取招式条目。"""
    panel = _parse_panel_json(rsc_text, icon_label)
    if not panel:
        return []

    entries_raw = panel.get("entries", [])
    display_names = panel.get("displayNames", {})
    result: list[UsageMoveEntry] = []

    for item in entries_raw:
        if not isinstance(item, dict):
            continue
        name_ja = item.get("name", "")
        rank = item.get("rank", 0)
        percentage = _to_float(item.get("percentage", 0))
        # 通过 displayNames 转换为中文
        name_zh = display_names.get(name_ja, name_ja)
        if name_zh:
            result.append(UsageMoveEntry(name_zh=name_zh, rank=int(rank), percentage=percentage))

    return result


def _parse_panel_entries_as_items(rsc_text: str, icon_label: str) -> list[UsageItemEntry]:
    """从面板数据中提取道具条目。"""
    panel = _parse_panel_json(rsc_text, icon_label)
    if not panel:
        return []

    entries_raw = panel.get("entries", [])
    display_names = panel.get("displayNames", {})
    result: list[UsageItemEntry] = []

    for item in entries_raw:
        if not isinstance(item, dict):
            continue
        name_ja = item.get("name", "")
        rank = item.get("rank", 0)
        percentage = _to_float(item.get("percentage", 0))
        name_zh = display_names.get(name_ja, name_ja)
        if name_zh:
            result.append(UsageItemEntry(name_zh=name_zh, rank=int(rank), percentage=percentage))

    return result


def _parse_panel_entries_as_abilities(rsc_text: str, icon_label: str) -> list[UsageAbilityEntry]:
    """从面板数据中提取特性条目。"""
    panel = _parse_panel_json(rsc_text, icon_label)
    if not panel:
        return []

    entries_raw = panel.get("entries", [])
    display_names = panel.get("displayNames", {})
    result: list[UsageAbilityEntry] = []

    for item in entries_raw:
        if not isinstance(item, dict):
            continue
        name_ja = item.get("name", "")
        rank = item.get("rank", 0)
        percentage = _to_float(item.get("percentage", 0))
        name_zh = display_names.get(name_ja, name_ja)
        if name_zh:
            result.append(UsageAbilityEntry(name_zh=name_zh, rank=int(rank), percentage=percentage))

    return result


def _parse_panel_entries_as_natures(rsc_text: str, icon_label: str) -> list[UsageNatureEntry]:
    """从面板数据中提取性格条目。"""
    panel = _parse_panel_json(rsc_text, icon_label)
    if not panel:
        return []

    entries_raw = panel.get("entries", [])
    display_names = panel.get("displayNames", {})
    result: list[UsageNatureEntry] = []

    for item in entries_raw:
        if not isinstance(item, dict):
            continue
        name_ja = item.get("name", "")
        rank = item.get("rank", 0)
        percentage = _to_float(item.get("percentage", 0))
        name_zh = display_names.get(name_ja, name_ja)
        if name_zh:
            result.append(UsageNatureEntry(name_zh=name_zh, rank=int(rank), percentage=percentage))

    return result


def _parse_panel_entries_as_partners(rsc_text: str, icon_label: str) -> list[UsagePartnerEntry]:
    """从面板数据中提取队友条目。

    队友面板 entry 只有日文名 `name` 字段，没有英文 slug。
    `displayNames` 提供日文→中文映射。
    我们用中文名作为 slug（唯一标识），不存储日文名。
    """
    panel = _parse_panel_json(rsc_text, icon_label)
    if not panel:
        return []

    entries_raw = panel.get("entries", [])
    display_names = panel.get("displayNames", {})
    result: list[UsagePartnerEntry] = []

    for item in entries_raw:
        if not isinstance(item, dict):
            continue
        name_ja = item.get("name", "")
        rank = item.get("rank", 0)
        name_zh = display_names.get(name_ja, "")
        # 用中文名作为 slug 唯一标识，完全不依赖日文名
        slug = name_zh if name_zh else name_ja
        if slug:
            result.append(UsagePartnerEntry(slug=slug, name_zh=name_zh, rank=int(rank)))

    return result


def _parse_ev_spreads_from_table(rsc_text: str) -> list[UsageEvSpreadEntry]:
    """从 RSC table 结构中提取 EV 分布数据。

    EV 分布以 table 形式渲染在 RSC 树中，每行结构为：
    ["$","tr","1",{"children":[
      ["$","td",null,{...,"children":1}],        # rank
      ["$","td",null,{...,"children":2}],         # hp
      ["$","td",null,{...,"children":32}],        # atk
      ["$","td",null,{...,"children":0}],         # def
      ["$","td",null,{...,"children":0}],         # spa
      ["$","td",null,{...,"children":0}],         # spd
      ["$","td",null,{...,"children":32}],        # spe
      ["$","td",null,{...,"children":["52.4","%"]}]  # percentage
    ]}]

    由于 tr 内容嵌套很深，简单正则无法匹配整个 tr。
    改为先找到所有 tr 起始位置，再在分段中提取 td children。
    """
    results: list[UsageEvSpreadEntry] = []

    # 找到 EV 分布表格区域（在 "能力点" 文本之后）
    ev_marker = '"能力点"'
    ev_idx = rsc_text.find(ev_marker)
    if ev_idx < 0:
        return results

    # 从标记位置开始搜索 tbody
    tbody_marker = '"tbody"'
    tbody_idx = rsc_text.find(tbody_marker, ev_idx)
    if tbody_idx < 0:
        return results

    # 提取 tbody 后的区域（EV 表最多 10 行，每行约 1000-1200 字符）
    ev_section = rsc_text[tbody_idx : tbody_idx + 15000]

    # 找到所有 tr 的起始位置（tr 的 key 是排名数字）
    tr_starts = [m.start() for m in re.finditer(r'\["\$","tr","(\d+)"', ev_section)]
    if not tr_starts:
        return results

    for i, pos in enumerate(tr_starts):
        # 确定这个 tr 的文本范围（到下一个 tr 或区域结束）
        end = tr_starts[i + 1] if i + 1 < len(tr_starts) else len(ev_section)
        tr_text = ev_section[pos:end]

        # 提取 rank
        rank_match = re.search(r'\["\$","tr","(\d+)"', tr_text)
        if not rank_match:
            continue
        rank = int(rank_match.group(1))

        # 提取所有 td 的 children 值
        # 匹配 "children":VALUE} 其中 VALUE 是整数或数组 ["N.N","%"]
        td_values = re.findall(
            r'"children":(\d+|(?:\["[\d.]+","%"\]))\}',
            tr_text,
        )

        if len(td_values) < 8:
            continue

        try:
            # td_values: [rank_echo, hp, atk, def, spa, spd, spe, percentage]
            hp = int(td_values[1])
            atk = int(td_values[2])
            def_ = int(td_values[3])
            sp_atk = int(td_values[4])
            sp_def = int(td_values[5])
            speed = int(td_values[6])

            # 百分比可能是数组 ["52.4","%"] 或单数字
            pct_raw = td_values[7]
            if pct_raw.startswith("["):
                pct_match = re.search(r'[\d.]+', pct_raw)
                percentage = float(pct_match.group()) if pct_match else 0.0
            else:
                percentage = float(pct_raw)

            results.append(
                UsageEvSpreadEntry(
                    rank=rank,
                    percentage=percentage,
                    hp=hp,
                    atk=atk,
                    def_=def_,
                    sp_atk=sp_atk,
                    sp_def=sp_def,
                    speed=speed,
                )
            )
        except (ValueError, IndexError):
            continue

    return results


def _extract_pokemon_name_zh(rsc_text: str, slug: str) -> str:
    """从详情页 RSC 文本中提取宝可梦中文名。"""
    # 方案1：从 trendFetchSlug 附近的 displayNames 找
    # MOVES 面板的 displayNames 之后有 trendFetchSlug
    marker = f'"trendFetchSlug":"{slug}"'
    idx = rsc_text.find(marker)
    if idx > 0:
        # 在此之前的 title 区域可能有中文标题
        # 或者查找页面标题中的 pokemonDisplay
        pass

    # 方案2：查找列表页模式的中文名
    pattern = re.compile(rf'"pokemonSlug":"{re.escape(slug)}"[^}}]*?"pokemonDisplay":"([^"]*)"')
    match = pattern.search(rsc_text)
    if match:
        return match.group(1)

    # 方案3：从 meta/title 标签获取（通常有中文名）
    title_pattern = re.compile(r'<title>([^<]*)</title>')
    title_match = title_pattern.search(rsc_text)
    if title_match:
        title = title_match.group(1)
        # title 通常格式为 "宝可梦名 使用率 - ..."
        parts = title.split()
        if parts:
            return parts[0]

    return ""


# --- 内部解析辅助 ---


def _decode_js_string_escape(s: str) -> str:
    """解码 JavaScript 字符串中的转义序列。"""
    result: list[str] = []
    i = 0
    while i < len(s):
        if s[i] == "\\" and i + 1 < len(s):
            next_char = s[i + 1]
            if next_char == "n":
                result.append("\n")
                i += 2
            elif next_char == "t":
                result.append("\t")
                i += 2
            elif next_char == "r":
                result.append("\r")
                i += 2
            elif next_char == "\\":
                result.append("\\")
                i += 2
            elif next_char == '"':
                result.append('"')
                i += 2
            elif next_char == "'":
                result.append("'")
                i += 2
            elif next_char == "u":
                # Unicode escape: \uXXXX
                if i + 5 < len(s):
                    hex_str = s[i + 2 : i + 6]
                    try:
                        result.append(chr(int(hex_str, 16)))
                        i += 6
                        continue
                    except ValueError:
                        pass
                result.append(s[i])
                i += 1
            else:
                result.append(s[i])
                i += 1
        else:
            result.append(s[i])
            i += 1
    return "".join(result)


def _find_json_start(line: str) -> int:
    """在 RSC 行中找到 JSON 数据的起始位置。

    RSC 行格式举例:
      0:["$","$L1",null,...]
      2:I[...]
      3:T1234,...
      1:D{"key":"value"}

    我们只关心 JSON 对象和数组。
    """
    # 先跳过行头的 ID 部分 (数字+冒号)
    colon_idx = line.find(":")
    if colon_idx < 0:
        return -1
    after_colon = line[colon_idx + 1:]
    # 可能有一个类型标志字符（如 I, T, D 等）
    # 找到第一个 [ 或 { 的位置
    for i, ch in enumerate(after_colon):
        if ch in ("[", "{"):
            return colon_idx + 1 + i
    return -1


def _find_seasons_data(obj: Any, depth: int = 0) -> list[dict]:
    """递归查找赛季数据数组。"""
    if depth > 5:
        return []

    if isinstance(obj, list):
        if len(obj) > 0 and isinstance(obj[0], dict):
            first = obj[0]
            if any(k in first for k in ("seasonId", "season", "id")) and any(
                k in first for k in ("format", "battleFormat", "startDate")
            ):
                return obj
        for item in obj:
            found = _find_seasons_data(item, depth + 1)
            if found:
                return found

    elif isinstance(obj, dict):
        for key in ("seasons", "seasonList", "data", "children"):
            if key in obj:
                found = _find_seasons_data(obj[key], depth + 1)
                if found:
                    return found
        for value in obj.values():
            if isinstance(value, (list, dict)):
                found = _find_seasons_data(value, depth + 1)
                if found:
                    return found

    return []


def _to_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _to_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0
