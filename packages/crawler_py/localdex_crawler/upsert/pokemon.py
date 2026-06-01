from __future__ import annotations

import sqlite3
import unicodedata
from dataclasses import dataclass
from urllib.parse import quote

from ..form_name_resolver import resolve_form_name_en
from ..form_type import (
    _canonical_form_name_zh,
    _derive_form_category,
    _derive_form_type,
    _normalize_form_match,
    _normalize_identifier,
)
from ..text import normalize_type_name
from .base import _lookup_ability_id, _lookup_pokemon_by_name, _source_attr


@dataclass(frozen=True)
class PokemonRow:
    id: int
    dex_number: int
    name_zh: str
    source_url: str | None


@dataclass(frozen=True)
class UpsertSummary:
    pokemon: PokemonRow
    abilities: list[str]
    hidden_ability: str | None
    form_count: int
    unknown_abilities: list[str]


def select_pokemon(
    conn: sqlite3.Connection,
    start_dex: int | None = None,
    end_dex: int | None = None,
    limit: int | None = None,
    names: list[str] | None = None,
) -> list[PokemonRow]:
    clauses: list[str] = []
    params: list[object] = []
    if start_dex is not None:
        clauses.append("dex_number >= ?")
        params.append(start_dex)
    if end_dex is not None:
        clauses.append("dex_number <= ?")
        params.append(end_dex)
    if names:
        placeholders = ",".join("?" for _ in names)
        clauses.append(f"name_zh IN ({placeholders})")
        params.extend(names)

    sql = "SELECT id, dex_number, name_zh, source_url FROM pokemon"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY dex_number ASC, id ASC"
    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)

    rows = conn.execute(sql, params).fetchall()
    return [
        PokemonRow(
            id=int(row["id"]),
            dex_number=int(row["dex_number"]),
            name_zh=str(row["name_zh"]),
            source_url=row["source_url"],
        )
        for row in rows
    ]


def pokemon_source_url(row: PokemonRow) -> str:
    return row.source_url or f"https://wiki.52poke.com/wiki/{quote(row.name_zh)}"


def cache_key(row: PokemonRow) -> str:
    return f"pokemon-{row.dex_number:04d}"


def upsert_pokemon_detail(conn: sqlite3.Connection, payload: dict) -> int:
    """
    写入宝可梦主表 + 形态 + 形态属性/特性/种族值/图片 + 世代可用性。
    payload 由 normalize_pokemon_detail_page() 生成。
    """
    with conn:
        row = conn.execute(
            "SELECT id FROM pokemon WHERE dex_number = ?",
            (payload["dex_number"],),
        ).fetchone()
        if row:
            pokemon_id = int(row["id"])
            introduced_gen = min(payload.get("generations") or [0]) or None
            conn.execute(
                """
                UPDATE pokemon
                SET name_zh = ?, name_ja = COALESCE(?, name_ja), name_en = COALESCE(?, name_en),
                    category = COALESCE(?, category),
                    height_m = COALESCE(?, height_m), weight_kg = COALESCE(?, weight_kg),
                    introduced_generation = COALESCE(?, introduced_generation),
                    source_url = COALESCE(?, source_url), source_title = COALESCE(?, source_title),
                    source_fetched_at = COALESCE(?, source_fetched_at)
                WHERE id = ?
                """,
                (
                    payload["name_zh"],
                    payload.get("name_ja"),
                    payload.get("name_en"),
                    payload.get("category"),
                    payload.get("height_m"),
                    payload.get("weight_kg"),
                    introduced_gen,
                    _source_attr(payload.get("source"), "url"),
                    _source_attr(payload.get("source"), "title"),
                    _source_attr(payload.get("source"), "fetched_at"),
                    pokemon_id,
                ),
            )
        else:
            introduced_gen = min(payload.get("generations") or [0]) or None
            result = conn.execute(
                """
                INSERT INTO pokemon
                  (dex_number, name_zh, name_ja, name_en, category,
                   height_m, weight_kg,
                   introduced_generation, source_url, source_title, source_fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["dex_number"],
                    payload["name_zh"],
                    payload.get("name_ja"),
                    payload.get("name_en"),
                    payload.get("category"),
                    payload.get("height_m"),
                    payload.get("weight_kg"),
                    introduced_gen,
                    _source_attr(payload.get("source"), "url"),
                    _source_attr(payload.get("source"), "title"),
                    _source_attr(payload.get("source"), "fetched_at"),
                ),
            )
            pokemon_id = int(result.lastrowid)

        # 写入形态及其关联数据
        _upsert_pokemon_forms(conn, pokemon_id, payload)

    return pokemon_id


def _upsert_pokemon_forms(conn: sqlite3.Connection, pokemon_id: int, payload: dict) -> None:
    """写入形态 + 形态属性/特性/种族值/图片。

    每个形态只有一条 pokemon_forms 记录。世代变体信息写入子表：
    - pokemon_form_stats: 每个世代变体一条记录（generation_start/generation_end）
    - pokemon_form_types: 每个世代变体一组记录
    - pokemon_form_abilities: 每个世代变体一组记录
    """
    # 读取已有的 name_en，重爬时保护已解析的英文名
    # 同时按 form_type 和 display_name_zh 建索引，因为 payload 中的 form_type
    # 是 slugify(中文名)，与 DB 中经 _derive_form_type 后的值不同
    existing_name_en_map: dict[str, str] = {}
    for row in conn.execute(
        "SELECT form_type, name_en, display_name_zh FROM pokemon_forms WHERE pokemon_id = ?",
        (pokemon_id,),
    ).fetchall():
        ft, ne, dz = row[0], row[1], row[2]
        if ne:
            if ft:
                existing_name_en_map[ft] = ne
            if dz:
                existing_name_en_map[dz] = ne

    # 清除旧的形态数据（级联删除子表）
    conn.execute("DELETE FROM pokemon_forms WHERE pokemon_id = ?", (pokemon_id,))

    forms = payload.get("forms") or []
    if not forms:
        # 没有显式形态数据，创建一个默认形态
        forms = [{
            "name_zh": payload["name_zh"],
            "name_en": payload.get("name_en"),
            "form_type": "default",
            "form_category": "default",
            "is_default": True,
            "sort_order": 0,
            "primary_type": payload.get("primary_type"),
            "secondary_type": payload.get("secondary_type"),
            "abilities": payload.get("abilities") or [],
            "hidden_ability": payload.get("hidden_ability"),
            "base_stats": payload.get("base_stats"),
            "images": payload.get("images") or {},
        }]

    for form in forms:
        is_default = bool(form.get("is_default"))
        display_name_zh = form["name_zh"]
        # 优先使用 payload 中的 name_en（默认形态），否则从数据库已有值中恢复
        # 查找顺序：display_name_zh（精确匹配）→ payload form_type（slugify 值）→ 空
        existing_en = (
            form.get("name_en")
            or existing_name_en_map.get(display_name_zh, "")
            or existing_name_en_map.get(form.get("form_type") or "", "")
            or ""
        )
        form_name_en = resolve_form_name_en(
            payload.get("name_en"),
            display_name_zh or form.get("form_type"),
            is_default=is_default,
            existing_name_en=existing_en,
            form_type=form.get("form_type"),
            form_category=form.get("form_category"),
        )
        form_type = _derive_form_type(
            payload.get("name_en"),
            form_name_en,
            form.get("name_zh") or form.get("form_type"),
            is_default,
        )
        form_category = _derive_form_category(
            form_type,
            form.get("form_category") or form.get("form_type"),
        )
        canonical_name_zh = _canonical_form_name_zh(
            payload.get("name_zh"),
            display_name_zh,
            form_type,
            form_category,
            is_default,
        )
        result = conn.execute(
            """
            INSERT INTO pokemon_forms
              (pokemon_id, form_type, form_category, name_zh, display_name_zh, name_en, is_default, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                pokemon_id,
                form_type,
                form_category,
                canonical_name_zh,
                display_name_zh,
                form_name_en,
                1 if is_default else 0,
                form.get("sort_order", 0),
            ),
        )
        form_id = int(result.lastrowid)

        # 种族值（可能有多个世代变体）
        stat_variants = form.get("stat_variants") or []
        if stat_variants:
            for variant in stat_variants:
                gen_start = variant.get("generation_start")
                gen_end = variant.get("generation_end")
                conn.execute(
                    """
                    INSERT INTO pokemon_form_stats
                      (form_id, generation_start, generation_end, hp, atk, def, spa, spd, spe)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (form_id, gen_start, gen_end,
                     variant["hp"], variant["atk"], variant["def"],
                     variant["spa"], variant["spd"], variant["spe"]),
                )
        else:
            # 单一种族值（无世代变体）
            stats = form.get("base_stats")
            if stats:
                conn.execute(
                    """
                    INSERT INTO pokemon_form_stats
                      (form_id, generation_start, generation_end, hp, atk, def, spa, spd, spe)
                    VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?)
                    """,
                    (form_id, stats["hp"], stats["atk"], stats["def"],
                     stats["spa"], stats["spd"], stats["spe"]),
                )

        # 属性（直接存储汉字，不再关联 types 表）
        # 目前属性没有世代变体，generation_start/generation_end 为 NULL
        for slot, type_name in enumerate([form.get("primary_type"), form.get("secondary_type")], start=1):
            normalized = normalize_type_name(type_name)
            if normalized:
                conn.execute(
                    """
                    INSERT INTO pokemon_form_types
                      (form_id, type_name, slot, generation_start, generation_end)
                    VALUES (?, ?, ?, NULL, NULL)
                    """,
                    (form_id, normalized, slot),
                )

        # 特性（目前没有世代变体，generation_start/generation_end 为 NULL）
        slot = 1
        for ability_name in form.get("abilities") or []:
            ability_id = _lookup_ability_id(conn, ability_name)
            conn.execute(
                """
                INSERT INTO pokemon_form_abilities
                  (form_id, ability_id, ability_name_zh, slot, is_hidden,
                   generation_start, generation_end)
                VALUES (?, ?, ?, ?, 0, NULL, NULL)
                """,
                (form_id, ability_id, ability_name, slot),
            )
            slot += 1
        hidden = form.get("hidden_ability")
        if hidden:
            ability_id = _lookup_ability_id(conn, hidden)
            conn.execute(
                """
                INSERT INTO pokemon_form_abilities
                  (form_id, ability_id, ability_name_zh, slot, is_hidden,
                   generation_start, generation_end)
                VALUES (?, ?, ?, ?, 1, NULL, NULL)
                """,
                (form_id, ability_id, hidden, slot),
            )

        # 图片
        for kind, image in (form.get("images") or {}).items():
            if image and hasattr(image, "url") and image.url:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO pokemon_form_images (form_id, image_kind, url, alt)
                    VALUES (?, ?, ?, ?)
                    """,
                    (form_id, kind, image.url, image.alt),
                )
            elif isinstance(image, dict) and image.get("url"):
                conn.execute(
                    """
                    INSERT OR REPLACE INTO pokemon_form_images (form_id, image_kind, url, alt)
                    VALUES (?, ?, ?, ?)
                    """,
                    (form_id, kind, image["url"], image.get("alt")),
                )


def upsert_evolution_chains(
    conn: sqlite3.Connection,
    pokemon_id: int,
    steps: list[dict],
) -> int:
    """写入宝可梦进化链到 evolution_chains 表。

    steps 由 parse_evolution_chain() 生成，格式::

        [
            {
                "from_name": "伊布", "to_name": "水伊布",
                "from_form": "", "to_form": "",
                "stage": 1, "condition": "使用 水之石",
                "method": "item", "level": None, "item": "水之石",
            },
            ...
        ]

    chain_id 使用当前宝可梦的 pokemon_id（作为进化链的标识）。
    from_form_id / to_form_id 通过 pokemon_forms 表解析得到。
    """
    with conn:
        # 清除该宝可梦相关的旧进化链数据
        conn.execute(
            "DELETE FROM evolution_chains WHERE chain_id = ?",
            (pokemon_id,),
        )

        if not steps:
            return 0

        count = 0
        for sort_order, step in enumerate(steps, start=1):
            from_id = _lookup_pokemon_by_name(conn, step["from_name"])
            to_id = _lookup_pokemon_by_name(conn, step["to_name"])
            if to_id is None:
                continue  # 目标宝可梦必须存在

            from_form_id = _lookup_form_id_by_name(
                conn, from_id, step.get("from_form")
            )
            to_form_id = _lookup_form_id_by_name(
                conn, to_id, step.get("to_form")
            )

            conn.execute(
                """
                INSERT INTO evolution_chains
                  (chain_id, from_pokemon_id, to_pokemon_id,
                   from_form_id, to_form_id,
                   stage, sort_order,
                   evolution_method, evolution_condition,
                   evolution_item, evolution_level, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pokemon_id,
                    from_id,
                    to_id,
                    from_form_id,
                    to_form_id,
                    step.get("stage", 0),
                    sort_order,
                    step.get("method"),
                    step.get("condition"),
                    step.get("item"),
                    step.get("level"),
                    step.get("notes"),
                ),
            )
            count += 1

    return count


def generate_form_change_chains(
    conn: sqlite3.Connection,
    dry_run: bool = False,
) -> dict[str, int]:
    """从 pokemon_forms 表中读取超级进化/超极巨化/合体等形态变化，写入 evolution_chains 表。

    为每个符合条件的非默认形态生成一条进化链记录：
    - from_pokemon_id = to_pokemon_id（同一宝可梦）
    - from_form_id = 默认形态 ID
    - to_form_id = 变化后形态 ID
    - evolution_method 根据 form_type 和形态名推断

    支持的形态变化类型：
    - mega: 超级进化（需要超级进化石）
    - gigantamax: 超极巨化
    - primal: 原始回归（固拉多、盖欧卡）
    - fusion: 宝可梦合体（酋雷姆、奈克洛兹玛、蕾冠王）
    - ultra-burst: 究极爆发（奈克洛兹玛）

    Returns:
        各类型生成的记录数统计字典。
    """
    # 查询所有有非默认形态的宝可梦（排除地区形态，它们已有独立进化链）
    EXCLUDED_FORM_CATEGORIES = ("default", "regional-alola", "regional-galar",
                                "regional-hisui", "regional-paldea", "terastal")

    rows = conn.execute(
        """
        SELECT pf.id AS form_id, pf.pokemon_id, COALESCE(pf.display_name_zh, pf.name_zh) AS form_name,
               pf.form_type, pf.form_category, pf.required_item_id,
               p.name_zh AS pokemon_name,
               i.name_zh AS item_name
        FROM pokemon_forms pf
        JOIN pokemon p ON pf.pokemon_id = p.id
        LEFT JOIN items i ON pf.required_item_id = i.id
        WHERE pf.is_default = 0 AND pf.form_category NOT IN (?, ?, ?, ?, ?, ?)
        ORDER BY pf.pokemon_id, pf.sort_order
        """,
        EXCLUDED_FORM_CATEGORIES,
    ).fetchall()

    if not rows:
        return {"total": 0}

    # 获取每个宝可梦的默认形态 ID
    pokemon_ids = list({int(r["pokemon_id"]) for r in rows})
    default_forms: dict[int, int] = {}
    for pid in pokemon_ids:
        default_row = conn.execute(
            "SELECT id FROM pokemon_forms WHERE pokemon_id = ? AND is_default = 1 LIMIT 1",
            (pid,),
        ).fetchone()
        if default_row:
            default_forms[pid] = int(default_row["id"])

    # 确定哪些 chain_id 已被普通进化链使用
    existing_chains = set()
    for pid in pokemon_ids:
        existing = conn.execute(
            "SELECT 1 FROM evolution_chains WHERE chain_id = ? LIMIT 1",
            (pid,),
        ).fetchone()
        if existing:
            existing_chains.add(pid)

    stats: dict[str, int] = {}
    inserted = 0

    # 删除旧的形态变化记录（通过 method 字段区分）
    FORM_CHANGE_METHODS = ("mega", "gigantamax", "primal", "fusion", "ultra-burst")
    if not dry_run:
        conn.execute(
            f"DELETE FROM evolution_chains WHERE evolution_method IN ({','.join('?' for _ in FORM_CHANGE_METHODS)})",
            FORM_CHANGE_METHODS,
        )

    for r in rows:
        pokemon_id = int(r["pokemon_id"])
        form_id = int(r["form_id"])
        form_type = r["form_type"]
        form_category = r["form_category"]
        form_name = r["form_name"]
        pokemon_name = r["pokemon_name"]
        item_name = r["item_name"]

        # 推断 evolution_method 和 condition
        method = _classify_form_change_method(form_category, form_name, pokemon_name)
        if method is None:
            continue  # 跳过不属于形态变化链的形态（如外观差异）

        condition = _build_form_change_condition(method, form_name, item_name)

        default_form_id = default_forms.get(pokemon_id)

        # chain_id 策略：使用 pokemon_id（与普通进化共享同一个 chain）
        chain_id = pokemon_id

        stats[method] = stats.get(method, 0) + 1

        if dry_run:
            print(f"  [form-change] {pokemon_name} -> {form_name} ({method}, item={item_name or '-'})")
            continue

        conn.execute(
            """
            INSERT INTO evolution_chains
              (chain_id, from_pokemon_id, to_pokemon_id,
               from_form_id, to_form_id,
               stage, sort_order,
               evolution_method, evolution_condition,
               evolution_item, evolution_level, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                chain_id,
                pokemon_id,
                pokemon_id,
                default_form_id,
                form_id,
                0,  # stage=0: 形态变化不算进化阶段
                900 + inserted,  # sort_order 使用大值避免与正常进化链冲突
                method,
                condition,
                item_name,
                None,
                None,
            ),
        )
        inserted += 1

    if not dry_run:
        conn.commit()

    stats["total"] = inserted
    return stats


def _classify_form_change_method(form_type: str, form_name: str, pokemon_name: str) -> str | None:
    """根据形态类型和名称推断 evolution_method。

    返回 None 表示该形态不应生成进化链记录。
    """
    if form_type == "mega":
        return "mega"
    if form_type == "gigantamax":
        return "gigantamax"

    # alternate 类型需要按名称细分
    if form_type == "alternate":
        # 原始回归
        if "原始" in form_name:
            return "primal"
        # 究极爆发
        if "究极" in form_name and "奈克洛兹玛" in pokemon_name:
            return "ultra-burst"
        # 合体形态
        fusion_indicators = [
            ("酋雷姆", ("暗黑", "焰白")),
            ("奈克洛兹玛", ("黄昏之鬃", "拂晓之翼")),
            ("蕾冠王", ("骑白马", "骑黑马")),
        ]
        for poke_name, keywords in fusion_indicators:
            if poke_name in pokemon_name:
                if any(kw in form_name for kw in keywords):
                    return "fusion"
        # 其他 alternate 形态暂不纳入（如性别差异、外观差异等）

    return None


def _build_form_change_condition(method: str, form_name: str, item_name: str | None) -> str:
    """构建形态变化的条件描述。"""
    if method == "mega":
        if item_name:
            return f"携带 {item_name} 进行超级进化"
        return "超级进化"
    if method == "gigantamax":
        return "超极巨化"
    if method == "primal":
        if item_name:
            return f"携带 {item_name} 原始回归"
        return "原始回归"
    if method == "fusion":
        return f"合体变为 {form_name}"
    if method == "ultra-burst":
        return "究极爆发"
    return form_name


def _lookup_form_id_by_name(
    conn: sqlite3.Connection,
    pokemon_id: int | None,
    form_name: str | None,
) -> int | None:
    """根据 pokemon_id 和形态描述文本解析 pokemon_forms.id。

    匹配策略：
    1. 如果 form_name 为空或 pokemon_id 为 None → 返回 None（默认形态由查询层推断）
    2. form_type / name_zh 精确匹配
    3. name_zh 包含 form_name 去掉"的样子"后的前缀（如"阿罗拉"）
    4. 只有一个非默认形态时取该形态
    5. fallback 到默认形态
    """
    if not form_name or pokemon_id is None:
        return None

    rows = conn.execute(
        "SELECT id, form_type, name_zh, display_name_zh, is_default FROM pokemon_forms WHERE pokemon_id = ?",
        (pokemon_id,),
    ).fetchall()
    if not rows:
        return None

    # 1. form_type / name_zh 精确匹配
    for r in rows:
        if r["form_type"] == form_name or r["name_zh"] == form_name or r["display_name_zh"] == form_name:
            return int(r["id"])

    # 2. 地区前缀模糊匹配
    prefix = form_name.replace("的样子", "")
    if prefix and prefix != form_name:
        for r in rows:
            if not r["is_default"] and (
                prefix in (r["name_zh"] or "") or prefix in (r["display_name_zh"] or "")
            ):
                return int(r["id"])

    # 3. 直接在 name_zh 中搜索
    for r in rows:
        if not r["is_default"] and (
            form_name in (r["name_zh"] or "") or form_name in (r["display_name_zh"] or "")
        ):
            return int(r["id"])

    # 4. 只有一个非默认形态时取它
    non_defaults = [r for r in rows if not r["is_default"]]
    if len(non_defaults) == 1:
        return int(non_defaults[0]["id"])

    # 5. fallback 到默认形态
    for r in rows:
        if r["is_default"]:
            return int(r["id"])

    return int(rows[0]["id"]) if rows else None


def upsert_pokemon_abilities(
    conn: sqlite3.Connection,
    pokemon: PokemonRow,
    page,
    parsed,
) -> UpsertSummary:
    """更新宝可梦的特性信息（写入默认形态的 pokemon_form_abilities）。"""
    from ..fetcher import RawPage
    from ..parsers.pokemon_abilities import ParsedPokemonAbilities

    unknown: list[str] = []

    with conn:
        conn.execute(
            """
            UPDATE pokemon
            SET source_url = ?, source_title = ?, source_fetched_at = ?
            WHERE id = ?
            """,
            (page.url, page.title, page.fetched_at, pokemon.id),
        )

        # 找到默认形态
        default_form = conn.execute(
            "SELECT id FROM pokemon_forms WHERE pokemon_id = ? AND is_default = 1 LIMIT 1",
            (pokemon.id,),
        ).fetchone()

        if not default_form:
            # 如果没有默认形态，创建一个
            result = conn.execute(
                """
                INSERT INTO pokemon_forms (pokemon_id, form_type, form_category, name_zh, display_name_zh, is_default, sort_order)
                VALUES (?, 'default', 'default', ?, ?, 1, 0)
                """,
                (pokemon.id, pokemon.name_zh, pokemon.name_zh),
            )
            form_id = int(result.lastrowid)
        else:
            form_id = int(default_form["id"])

        # 清除旧特性
        conn.execute("DELETE FROM pokemon_form_abilities WHERE form_id = ?", (form_id,))

        # 写入新特性
        for slot, ability in enumerate(parsed.abilities, start=1):
            ability_id = _lookup_ability_id(conn, ability)
            if ability_id is None:
                unknown.append(ability)
            conn.execute(
                """
                INSERT INTO pokemon_form_abilities (form_id, ability_id, ability_name_zh, slot, is_hidden)
                VALUES (?, ?, ?, ?, 0)
                """,
                (form_id, ability_id, ability, slot),
            )

        if parsed.hidden_ability:
            ability_id = _lookup_ability_id(conn, parsed.hidden_ability)
            if ability_id is None:
                unknown.append(parsed.hidden_ability)
            conn.execute(
                """
                INSERT INTO pokemon_form_abilities (form_id, ability_id, ability_name_zh, slot, is_hidden)
                VALUES (?, ?, ?, ?, 1)
                """,
                (form_id, ability_id, parsed.hidden_ability, len(parsed.abilities) + 1),
            )

    return UpsertSummary(
        pokemon=pokemon,
        abilities=parsed.abilities,
        hidden_ability=parsed.hidden_ability,
        form_count=1,
        unknown_abilities=sorted(set(unknown)),
    )
