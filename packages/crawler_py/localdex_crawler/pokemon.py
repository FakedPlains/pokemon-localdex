from __future__ import annotations

from dataclasses import dataclass
import re

from bs4 import BeautifulSoup

from .fetcher import RawPage
from .html_tools import parse_pokemon_abilities
from .utils import (
    ImageAsset,
    build_learnset_page_url,
    build_pokemon_page_url,
    clean_inline_text,
    extract_file_name,
    extract_image_candidates,
    generation_from_heading,
    normalize_category,
    normalize_media_url,
    normalize_power,
    normalize_pp,
    normalize_text,
    read_number,
    slugify,
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
    stats = _choose_base_stats(_extract_stat_blocks(text))
    forms = _extract_forms(text, seed.name_zh)
    regional_records = _extract_regional_dex_records(text)
    generation_availability = _build_generation_availability(list(seed.generations), regional_records)
    image_sets = resolve_pokemon_image_assets(page.html, seed, forms)
    return {
        "legacy_id": f"pokemon-{seed.dex_number:04d}",
        "dex_number": seed.dex_number,
        "slug": slugify(seed.name_zh),
        "name_zh": seed.name_zh,
        "name_ja": seed.name_ja,
        "name_en": seed.name_en,
        "generations": list(seed.generations) or [max(1, min(9, (seed.dex_number + 150) // 151))],
        "primary_type": types[0] if types else None,
        "secondary_type": types[1] if len(types) > 1 else None,
        "category": _extract_line_value(text, "分类"),
        "abilities": parsed_abilities.abilities,
        "hidden_ability": parsed_abilities.hidden_ability or _extract_line_value(text, "隐藏特性") or _extract_line_value(text, "隱藏特性"),
        "ability_changes": parsed_abilities.changes,
        "height_m": read_number(_extract_line_value(text, "身高")),
        "weight_kg": read_number(_extract_line_value(text, "体重")),
        "color": _extract_line_value(text, "图鉴颜色"),
        "catch_rate": int(read_number(_extract_line_value(text, "捕获率")) or 0) or None,
        "gender_ratio": _extract_gender_ratio(text),
        "base_stats": stats,
        "forms": forms,
        "generation_availability": generation_availability,
        "images": image_sets["base"],
        "form_images": image_sets["forms"],
        "source": page,
    }


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
                "legacy_id": f"move-{slugify(move_name)}",
                "slug": slugify(move_name),
                "name_zh": move_name,
                "generation": generation,
                "type": type_token,
                "category": normalize_category(category_token),
                "power": normalize_power(power_token),
                "accuracy": format_accuracy(accuracy_token),
                "pp": normalize_pp(pp_token),
                "effect_summary": "来自 52Poké 宝可梦学招式表的基础参数记录。",
            })
    return {
        "learnset": unique_by_key(learnset, lambda item: f"{item['move_name_zh']}|{item['learn_method']}|{item.get('level')}|{item.get('notes')}"),
        "moves": unique_by_key(moves, lambda item: f"{item['name_zh']}|{item['generation']}"),
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


def _extract_gender_ratio(text: str) -> dict | None:
    matched = re.search(r"雄性\s*([0-9.]+%)｜雌性\s*([0-9.]+%)", text)
    if not matched:
        return None
    return {"male": matched.group(1), "female": matched.group(2)}


def _extract_stat_blocks(text: str) -> list[dict]:
    pattern = re.compile(
        r"ＨＰ\s*[：:]?\s*(\d+)[\s\S]{0,360}?攻击\s*[：:]?\s*(\d+)[\s\S]{0,360}?防御\s*[：:]?\s*(\d+)"
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


def _extract_forms(text: str, base_name_zh: str) -> list[dict]:
    block = _extract_block(text, "形态", ["概述", "属性", "分类", "身高", "体重", "种族值", "取得基础点数"])
    if not block:
        return []
    forms = []
    for name in [item.strip() for item in re.split(r"\s+", block) if item.strip()]:
        if name == "形态" or name == base_name_zh or len(name) > 24 or re.search(r"[，。；：、,.!?]", name):
            continue
        forms.append({"legacy_id": f"{slugify(base_name_zh)}-{slugify(name)}", "name_zh": name})
    return unique_by_key(forms, lambda item: item["name_zh"])


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
            "legacy_id": f"move-{slugify(move_name)}",
            "slug": slugify(move_name),
            "name_zh": move_name,
            "generation": generation,
            "type": type_token,
            "category": normalize_category(category_token),
            "power": normalize_power(power_token),
            "accuracy": format_accuracy(accuracy_token),
            "pp": normalize_pp(pp_token),
            "effect_summary": "来自 52Poké 宝可梦学招式表的基础参数记录。",
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
    hints = _form_hints(form["name_zh"])
    score = 0
    if dex3 in normalized:
        score += 5
    if dex4 in normalized:
        score += 5
    if english and english in normalized:
        score += 6
    for hint in hints:
        if hint in normalized:
            score += 6
    if _has_official_marker(file_name):
        score += 7
    if _has_sprite_marker(file_name):
        score -= 3 if kind == "shinyOfficial" else 12
    if _has_shiny_marker(file_name):
        score += 7 if kind == "shinyOfficial" else -6
    elif kind == "shinyOfficial":
        score -= 5
    return score


def _form_hints(name_zh: str) -> list[str]:
    hints = []
    if "超级" in name_zh:
        hints.append("mega")
    if "超极巨" in name_zh:
        hints.append("gigantamax")
    if "阿罗拉" in name_zh:
        hints.append("alola")
    if "伽勒尔" in name_zh:
        hints.append("galar")
    if "洗翠" in name_zh:
        hints.append("hisui")
    if "帕底亚" in name_zh:
        hints.append("paldea")
    if "X" in name_zh:
        hints.extend(["mega x", "x"])
    if "Y" in name_zh:
        hints.extend(["mega y", "y"])
    return hints
