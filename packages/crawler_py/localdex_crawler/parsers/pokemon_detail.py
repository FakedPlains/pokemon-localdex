from __future__ import annotations

from dataclasses import dataclass
import re

from bs4 import BeautifulSoup

from ..fetcher import RawPage
from .pokemon_abilities import extract_ability_names, parse_pokemon_abilities
from ..generations import generation_from_dex_number, generation_from_heading
from ..text import clean_inline_text, normalize_text, read_number, slugify, to_simplified, unique_by_key
from ..urls import build_pokemon_page_url
from .pokemon_images import resolve_pokemon_image_assets

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
    pattern = re.compile(r"#(\d{4})\s+([^\s#]+)\s+([^\s#]+)\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9.'’♀♂\- :]+)")
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
        "name_zh": seed.name_zh,
        "name_en": seed.name_en,
        "form_type": "default",
        "form_category": "default",
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
        form_type = slugify(form_name)
        form_category = _classify_form_category(form_name)

        form_entry: dict = {
            "name_zh": form_name,
            "form_type": form_type,
            "form_category": form_category,
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


def _classify_form_category(name_zh: str) -> str:
    """根据形态名称推断形态大类。"""
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


def pokemon_cache_key(dex_number: int) -> str:
    return f"pokemon-{dex_number:04d}"
