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
    generation_from_heading,
    normalize_media_url,
    normalize_text,
    read_number,
    slugify,
    to_simplified,
    unique_by_key,
)

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
        "generations": list(seed.generations) or [max(1, min(9, (seed.dex_number + 150) // 151))],
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


def parse_learnset_page(page: RawPage, generation: int) -> dict:
    table_result = _parse_learnset_tables(page.html, generation)
    if table_result["learnset"]:
        return table_result

    lines = [line.strip() for line in normalize_text(page.html).splitlines() if line.strip()]
    learnset: list[dict] = []
    moves: list[dict] = []
    current_game_label = ""

    for index, line in enumerate(lines):
        if re.fullmatch(r"《.+》", line) or re.fullmatch(r"第.+世代", line):
            current_game_label = line
            continue
        method = None
        if "可学会的招式" in line:
            method = "level-up"
        elif "能使用的招式学习器" in line or "能使用的招式记录" in line:
            method = "tm"
        elif "能使用的秘传学习器" in line:
            method = "hm"
        if not method:
            continue
        section: list[str] = []
        for cell in lines[index + 1:]:
            if _is_learnset_heading(cell):
                break
            section.append(cell)
        parsed = _parse_learnset_cells(section, method, generation, current_game_label or None)
        learnset.extend(parsed["learnset"])
        moves.extend(parsed["moves"])
    return {
        "learnset": unique_by_key(learnset, lambda item: f"{item['move_name_zh']}|{item['learn_method']}|{item.get('level')}|{item.get('notes')}"),
        "moves": unique_by_key(moves, lambda item: f"{item['name_zh']}|{item['generation']}"),
    }


def _parse_learnset_tables(html: str, generation: int) -> dict:
    soup = BeautifulSoup(html or "", "html.parser")
    learnset: list[dict] = []
    moves: list[dict] = []
    for table in soup.find_all("table"):
        table_text = table.get_text(" ", strip=True)
        if "招式" not in table_text or ("PP" not in table_text and "ＰＰ" not in table_text):
            continue
        header_cells = []
        for row in table.find_all("tr"):
            cells = [clean_inline_text(cell.get_text(" ", strip=True)) for cell in row.find_all(["th", "td"])]
            if "招式" in cells and ("PP" in cells or "ＰＰ" in cells):
                header_cells = cells
                break
        if not header_cells:
            continue
        method = "other"
        if any(cell in {"等级", "等級"} for cell in header_cells):
            method = "level-up"
        elif any("学习器" in cell or "學習器" in cell or "招式记录" in cell or "招式記錄" in cell for cell in header_cells):
            method = "tm"
        elif any(cell in {"亲代", "親代"} for cell in header_cells):
            method = "egg"

        for row in table.find_all("tr"):
            cells_tags = row.find_all(["th", "td"])
            if not cells_tags:
                continue
            move_anchor = next(
                (
                    anchor
                    for anchor in row.find_all("a")
                    if clean_inline_text(anchor.get("title")).endswith("（招式）")
                ),
                None,
            )
            if not move_anchor:
                continue
            cells = [clean_inline_text(cell.get_text(" ", strip=True)) for cell in cells_tags]
            move_cell_index = next((idx for idx, cell in enumerate(cells_tags) if move_anchor in cell.find_all("a")), -1)
            if move_cell_index < 0:
                continue
            move_name = clean_inline_text(move_anchor.get_text(" ", strip=True))
            if not move_name:
                continue
            level = None
            learn_method = method
            if method == "level-up":
                before = [cell for cell in cells[:move_cell_index] if cell]
                level_text = before[0] if before else ""
                if re.fullmatch(r"\d+", level_text):
                    level = int(level_text)
                elif level_text in {"—", "-"}:
                    learn_method = "other"
            stat_cells = cells[move_cell_index + 1:]
            type_token = stat_cells[0] if len(stat_cells) > 0 else None
            category_token = stat_cells[1] if len(stat_cells) > 1 else None
            power_token = stat_cells[2] if len(stat_cells) > 2 else None
            accuracy_token = stat_cells[3] if len(stat_cells) > 3 else None
            pp_token = stat_cells[4] if len(stat_cells) > 4 else None
            learnset.append({
                "move_key": f"move-{slugify(move_name)}",
                "move_name_zh": move_name,
                "learn_method": learn_method,
                "level": level,
                "notes": None,
            })
            moves.append({
                "name_zh": move_name,
            })
    return {
        "learnset": unique_by_key(learnset, lambda item: f"{item['move_name_zh']}|{item['learn_method']}|{item.get('level')}|{item.get('notes')}"),
        "moves": unique_by_key(moves, lambda item: item['name_zh']),
    }


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


def _is_learnset_heading(line: str) -> bool:
    return any(heading in line for heading in [
        "可学会的招式",
        "能使用的招式学习器",
        "能使用的秘传学习器",
        "能使用的招式记录",
        "教授招式",
        "遗传招式",
        "进化前招式",
        "其他世代：",
    ])


def _parse_learnset_cells(cells: list[str], method: str, generation: int, notes: str | None) -> dict:
    header_start_candidates = ["等级", "等級"] if method == "level-up" else ["秘传学习器", "秘傳學習器", "学习器", "學習器"] if method == "hm" else ["学习器", "學習器", "招式记录", "招式記錄"]
    header_start = next((idx for idx, cell in enumerate(cells) if cell in header_start_candidates), -1)
    if header_start < 0:
        return {"learnset": [], "moves": []}
    header_end = next((idx for idx, cell in enumerate(cells[header_start:], start=header_start) if cell in {"PP", "ＰＰ"}), -1)
    if header_end < 0:
        return {"learnset": [], "moves": []}
    header = cells[header_start: header_end + 1]
    row_size = len(header)
    learnset = []
    moves = []
    for index in range(header_end + 1, len(cells) - row_size + 1, row_size):
        row = cells[index:index + row_size]
        if any(_is_learnset_heading(cell) for cell in row):
            break
        move_name = row[1] if len(row) > 1 else ""
        if not move_name or move_name == "招式":
            continue
        learn_method = method
        level = None
        if method == "level-up":
            if re.fullmatch(r"\d+", row[0]):
                level = int(row[0])
            elif row[0] in {"—", "-"}:
                learn_method = "other"
            else:
                continue
        has_category = "分类" in header or "分類" in header
        type_token = row[2] if len(row) > 2 else None
        category_token = row[3] if has_category and len(row) > 3 else None
        power_token = row[4] if has_category and len(row) > 4 else row[3] if len(row) > 3 else None
        accuracy_token = row[5] if has_category and len(row) > 5 else row[4] if len(row) > 4 else None
        pp_token = row[6] if has_category and len(row) > 6 else row[5] if len(row) > 5 else None
        learnset.append({
            "move_key": f"move-{slugify(move_name)}",
            "move_name_zh": move_name,
            "learn_method": learn_method,
            "level": level,
            "notes": notes,
        })
        moves.append({
            "name_zh": move_name,
        })
    return {"learnset": learnset, "moves": moves}


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
        # 短 hint（≤2字符）使用编号后缀精确匹配，长 hint 使用子串匹配
        if len(hint) <= 2:
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
        if len(anti) <= 2:
            if dex_suffix and dex_suffix == anti:
                score -= 15
        else:
            if anti in normalized:
                score -= 15
    if _has_official_marker(file_name):
        score += 7
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
      HOME_003_f_s.png → None (_f 是性别差异，不是形态后缀)
    """
    # 尝试匹配 dex4 或 dex3 后紧跟的字母
    for dex in (dex4, dex3):
        pattern = re.compile(rf"{re.escape(dex)}([a-z]{{1,2}})(?:[_.]|$)")
        m = pattern.search(normalized_name)
        if m:
            suffix = m.group(1)
            # 排除 _f (性别差异) 和 px (缩略图尺寸)
            if suffix in ("f", "px"):
                continue
            return suffix
    return None


def _form_hints(name_zh: str) -> tuple[list[str], list[str]]:
    """返回 (hints, anti_hints)，hints 是当前形态的文件名标记，anti_hints 是其他形态的标记。

    短 hint（≤2字符）会与编号后缀精确匹配（通过 _extract_dex_suffix），
    长 hint（>2字符）使用子串匹配。

    Wiki HOME 图片文件名后缀约定：
      M = Mega, MX/MY = Mega X/Y, GM = Gigantamax,
      A = Alola, G = Galar, H = Hisui, P = Paldea,
      C = Crowned (剑之王/盾之王), O = Origin (起源形态),
      R = Rider (骑乘形态)
    """
    hints: list[str] = []
    anti_hints: list[str] = []
    if "超极巨" in name_zh:
        # 超极巨化：GM 后缀（必须在超级之前检查，因为超极巨也包含"超"）
        hints.extend(["gm", "gigantamax"])
    elif "超级" in name_zh:
        # 超级进化：M 后缀
        hints.extend(["m", "mega"])
    if "阿罗拉" in name_zh:
        hints.extend(["a", "alola"])
    if "伽勒尔" in name_zh:
        hints.extend(["g", "galar"])
    if "洗翠" in name_zh:
        hints.extend(["h", "hisui"])
    if "帕底亚" in name_zh:
        hints.extend(["p", "paldea"])
    # Crowned 形态（苍响-剑之王 / 藏玛然特-盾之王）：C 后缀
    if "剑之王" in name_zh or "盾之王" in name_zh:
        hints.extend(["c", "crowned"])
    # Origin 形态（骑拉帝纳-起源形态 / 帕路奇亚/帝牙卢卡-起源形态）：O 后缀
    if "起源" in name_zh:
        hints.extend(["o", "origin"])
    # 超级进化 X/Y 形态：文件名中用 MX/MY 缩写
    if "X" in name_zh or "Ｘ" in name_zh:
        hints.extend(["mx", "mega_x", "mega x"])
        anti_hints.extend(["my", "mega_y", "mega y"])
    elif "Y" in name_zh or "Ｙ" in name_zh:
        hints.extend(["my", "mega_y", "mega y"])
        anti_hints.extend(["mx", "mega_x", "mega x"])
    # 厄诡椪面具形态：W = Wellspring (水井), H = Hearthflame (火灶), C = Cornerstone (础石)
    if "水井面具" in name_zh:
        hints.extend(["w", "wellspring"])
        anti_hints.extend(["h", "hearthflame", "c", "cornerstone"])
    elif "火灶面具" in name_zh:
        hints.extend(["h", "hearthflame"])
        anti_hints.extend(["w", "wellspring", "c", "cornerstone"])
    elif "础石面具" in name_zh:
        hints.extend(["c", "cornerstone"])
        anti_hints.extend(["w", "wellspring", "h", "hearthflame"])
    # 太乐巴戈斯形态：T = Terastal (太晶), S = Stellar (星晶)
    if "太晶形态" in name_zh:
        hints.extend(["t", "terastal"])
        anti_hints.extend(["s", "stellar"])
    elif "星晶形态" in name_zh:
        hints.extend(["s", "stellar"])
        anti_hints.extend(["t", "terastal"])
    # 蕾冠王骑乘形态：I = Ice Rider (骑白马), S = Shadow Rider (骑黑马)
    if "骑白马" in name_zh:
        hints.extend(["i", "ice_rider", "ice rider"])
        anti_hints.extend(["s", "shadow_rider", "shadow rider"])
    elif "骑黑马" in name_zh:
        hints.extend(["s", "shadow_rider", "shadow rider"])
        anti_hints.extend(["i", "ice_rider", "ice rider"])
    return hints, anti_hints
