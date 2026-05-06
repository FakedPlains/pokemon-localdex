from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sqlite3
from urllib.parse import quote

from .fetcher import RawPage
from .html_tools import ParsedPokemonAbilities
from .utils import normalize_type_name, slugify


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


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ---------------------------------------------------------------------------
# 清除数据（--clean 模式）
# ---------------------------------------------------------------------------

def clear_moves(conn: sqlite3.Connection) -> int:
    """清除所有招式数据（含 move_generation_records）。"""
    with conn:
        count = conn.execute("SELECT COUNT(*) FROM moves").fetchone()[0]
        conn.execute("DELETE FROM move_generation_records")
        conn.execute("DELETE FROM moves")
    return count


def clear_abilities(conn: sqlite3.Connection) -> int:
    """清除所有特性数据（含 ability_generation_records）。"""
    with conn:
        count = conn.execute("SELECT COUNT(*) FROM abilities").fetchone()[0]
        conn.execute("DELETE FROM ability_generation_records")
        conn.execute("DELETE FROM abilities")
    return count


def clear_items(conn: sqlite3.Connection) -> int:
    """清除所有道具数据（含 item_generation_records）。"""
    with conn:
        count = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
        conn.execute("DELETE FROM item_generation_records")
        conn.execute("DELETE FROM items")
        return count


def clear_pokemon(conn: sqlite3.Connection) -> int:
    """清除所有宝可梦数据（含所有关联子表）。"""
    with conn:
        count = conn.execute("SELECT COUNT(*) FROM pokemon").fetchone()[0]
        conn.execute("DELETE FROM pokemon_learnsets")
        conn.execute("DELETE FROM evolution_chains")
        conn.execute("DELETE FROM pokemon_form_images")
        conn.execute("DELETE FROM pokemon_form_abilities")
        conn.execute("DELETE FROM pokemon_form_types")
        conn.execute("DELETE FROM pokemon_form_stats")
        conn.execute("DELETE FROM pokemon_forms")
        conn.execute("DELETE FROM pokemon_generation_regions")
        conn.execute("DELETE FROM pokemon")
    return count


def clear_all(conn: sqlite3.Connection) -> dict[str, int]:
    """清除所有数据。返回各表删除的记录数。"""
    return {
        "moves": clear_moves(conn),
        "abilities": clear_abilities(conn),
        "items": clear_items(conn),
        "pokemon": clear_pokemon(conn),
    }


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
        clauses.append(f"(name_zh IN ({placeholders}) OR slug IN ({placeholders}))")
        params.extend(names)
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


# ---------------------------------------------------------------------------
# Pokemon upsert (form-centric architecture)
# ---------------------------------------------------------------------------

def upsert_pokemon_detail(conn: sqlite3.Connection, payload: dict) -> int:
    """
    写入宝可梦主表 + 形态 + 形态属性/特性/种族值/图片 + 世代可用性。
    payload 由 normalize_pokemon_detail_page() 生成。
    """
    slug = payload["slug"]
    with conn:
        row = conn.execute(
            "SELECT id FROM pokemon WHERE slug = ? OR dex_number = ?",
            (slug, payload["dex_number"]),
        ).fetchone()
        if row:
            pokemon_id = int(row["id"])
            introduced_gen = min(payload.get("generations") or [0]) or None
            conn.execute(
                """
                UPDATE pokemon
                SET slug = ?, name_zh = ?, name_ja = COALESCE(?, name_ja), name_en = COALESCE(?, name_en),
                    category = COALESCE(?, category),
                    height_m = COALESCE(?, height_m), weight_kg = COALESCE(?, weight_kg),
                    introduced_generation = COALESCE(?, introduced_generation),
                    source_url = COALESCE(?, source_url), source_title = COALESCE(?, source_title),
                    source_fetched_at = COALESCE(?, source_fetched_at)
                WHERE id = ?
                """,
                (
                    slug,
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
                  (dex_number, slug, name_zh, name_ja, name_en, category,
                   height_m, weight_kg,
                   introduced_generation, source_url, source_title, source_fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["dex_number"],
                    slug,
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

        # 写入世代可用性
        _upsert_generation_regions(conn, pokemon_id, payload)

    return pokemon_id


def _upsert_pokemon_forms(conn: sqlite3.Connection, pokemon_id: int, payload: dict) -> None:
    """写入形态 + 形态属性/特性/种族值/图片。

    每个形态只有一条 pokemon_forms 记录。世代变体信息写入子表：
    - pokemon_form_stats: 每个世代变体一条记录（generation_start/generation_end）
    - pokemon_form_types: 每个世代变体一组记录
    - pokemon_form_abilities: 每个世代变体一组记录
    """
    # 清除旧的形态数据（级联删除子表）
    conn.execute("DELETE FROM pokemon_forms WHERE pokemon_id = ?", (pokemon_id,))

    forms = payload.get("forms") or []
    if not forms:
        # 没有显式形态数据，创建一个默认形态
        forms = [{
            "form_key": "default",
            "name_zh": payload["name_zh"],
            "form_type": "default",
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
        result = conn.execute(
            """
            INSERT INTO pokemon_forms
              (pokemon_id, form_key, name_zh, form_type, is_default, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                pokemon_id,
                form.get("form_key") or "default",
                form["name_zh"],
                form.get("form_type") or "default",
                1 if form.get("is_default") else 0,
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


def _upsert_generation_regions(conn: sqlite3.Connection, pokemon_id: int, payload: dict) -> None:
    """写入世代可用性。"""
    conn.execute("DELETE FROM pokemon_generation_regions WHERE pokemon_id = ?", (pokemon_id,))
    for record in payload.get("generation_availability") or []:
        generation = int(record["generation"])
        for region in record.get("regions") or []:
            conn.execute(
                """
                INSERT OR IGNORE INTO pokemon_generation_regions
                  (pokemon_id, generation, region, regional_dex_number)
                VALUES (?, ?, ?, ?)
                """,
                (pokemon_id, generation, region.get("region"), region.get("dex_number")),
            )
        if not record.get("regions"):
            # 即使没有地区记录，也要记录世代可用性
            conn.execute(
                """
                INSERT OR IGNORE INTO pokemon_generation_regions
                  (pokemon_id, generation, region, regional_dex_number)
                VALUES (?, ?, NULL, NULL)
                """,
                (pokemon_id, generation),
            )


def _lookup_ability_id(conn: sqlite3.Connection, name: str) -> int | None:
    """查找特性 ID（不自动创建）。"""
    if not name:
        return None
    row = conn.execute("SELECT id FROM abilities WHERE name_zh = ?", (name,)).fetchone()
    return int(row["id"]) if row else None


# ---------------------------------------------------------------------------
# Pokemon abilities (focused updater for pokemon-abilities command)
# ---------------------------------------------------------------------------

def upsert_pokemon_abilities(
    conn: sqlite3.Connection,
    pokemon: PokemonRow,
    page: RawPage,
    parsed: ParsedPokemonAbilities,
) -> UpsertSummary:
    """更新宝可梦的特性信息（写入默认形态的 pokemon_form_abilities）。"""
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
                INSERT INTO pokemon_forms (pokemon_id, form_key, name_zh, form_type, is_default, sort_order)
                VALUES (?, 'default', ?, 'default', 1, 0)
                """,
                (pokemon.id, pokemon.name_zh),
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


# ---------------------------------------------------------------------------
# Learnset upsert (new pokemon_learnsets table)
# ---------------------------------------------------------------------------

def upsert_pokemon_learnset(
    conn: sqlite3.Connection,
    pokemon_id: int,
    generation: int,
    move_list: list[dict],
    form_key: str = "default",
) -> int:
    """写入宝可梦招式学习列表到 pokemon_learnsets 表。

    move_list 格式::

        [
            {"move_name_zh": "...", "learn_method": "level-up", "level": 5,
             "game_version_code": "SV", "tm_number": None, "notes": None},
            ...
        ]
    """
    with conn:
        # 清除该宝可梦在该世代 + 形态的旧招式
        conn.execute(
            "DELETE FROM pokemon_learnsets WHERE pokemon_id = ? AND generation = ? AND form_key = ?",
            (pokemon_id, generation, form_key),
        )
        # 确保所有招式存在并写入招式学习记录
        for sort_order, record in enumerate(move_list, start=1):
            move_name = record["move_name_zh"]
            ensure_move(conn, move_name)
            move_id = _lookup_move_id(conn, move_name)
            conn.execute(
                """
                INSERT OR IGNORE INTO pokemon_learnsets
                  (pokemon_id, form_key, move_id, move_name_zh, generation,
                   game_version_code, learn_method, level, tm_number, sort_order, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pokemon_id,
                    form_key,
                    move_id,
                    move_name,
                    generation,
                    record.get("game_version_code"),
                    record.get("learn_method"),
                    record.get("level"),
                    record.get("tm_number"),
                    sort_order,
                    record.get("notes"),
                ),
            )
    return len(move_list)


def _lookup_move_id(conn: sqlite3.Connection, name: str) -> int | None:
    """查找招式 ID。"""
    if not name:
        return None
    row = conn.execute("SELECT id FROM moves WHERE name_zh = ?", (name,)).fetchone()
    return int(row["id"]) if row else None


# ---------------------------------------------------------------------------
# Catalog upsert (moves, abilities, items) — 保持不变
# ---------------------------------------------------------------------------

def ensure_ability(conn: sqlite3.Connection, name: str) -> int | None:
    if not name:
        return None
    row = conn.execute("SELECT id FROM abilities WHERE name_zh = ?", (name,)).fetchone()
    if row:
        return int(row["id"])
    result = conn.execute("INSERT INTO abilities (name_zh) VALUES (?)", (name,))
    return int(result.lastrowid)


def ensure_type(conn: sqlite3.Connection, name: str | None) -> str | None:
    """标准化属性名称。types 表已废弃，直接返回标准化后的汉字。"""
    return normalize_type_name(name)


# ensure_generation 已废弃 — generations 表不再使用，世代直接存储为整数


def ensure_move(conn: sqlite3.Connection, name: str, payload: dict | None = None) -> int:
    if not name:
        raise ValueError("move name is required")
    row = conn.execute("SELECT id FROM moves WHERE name_zh = ?", (name,)).fetchone()
    if row:
        return int(row["id"])
    result = conn.execute("INSERT INTO moves (name_zh) VALUES (?)", (name,))
    return int(result.lastrowid)


def upsert_move_detail(conn: sqlite3.Connection, payload: dict) -> int:
    introduced_gen = payload.get("introduced_generation")
    with conn:
        row = conn.execute(
            "SELECT id FROM moves WHERE number = ? AND name_zh = ?",
            (payload.get("number"), payload["name_zh"]),
        ).fetchone()
        if not row:
            row = conn.execute("SELECT id FROM moves WHERE name_zh = ?", (payload["name_zh"],)).fetchone()
        if row:
            move_id = int(row["id"])
            conn.execute(
                """
                UPDATE moves
                SET number = COALESCE(?, number),
                    name_ja = COALESCE(?, name_ja), name_en = COALESCE(?, name_en),
                    type_name = COALESCE(?, type_name), category = COALESCE(?, category),
                    power = COALESCE(?, power), accuracy = COALESCE(?, accuracy), pp = COALESCE(?, pp),
                    description = COALESCE(?, description), effect_detail = COALESCE(?, effect_detail),
                    introduced_generation = COALESCE(?, introduced_generation),
                    source_url = COALESCE(?, source_url), source_title = COALESCE(?, source_title),
                    source_fetched_at = COALESCE(?, source_fetched_at)
                WHERE id = ?
                """,
                (
                    payload.get("number"),
                    payload.get("name_ja"),
                    payload.get("name_en"),
                    ensure_type(conn, payload.get("type")),
                    payload.get("category"),
                    payload.get("power"),
                    payload.get("accuracy"),
                    payload.get("pp"),
                    payload.get("description"),
                    payload.get("effect_detail"),
                    introduced_gen,
                    _source_attr(payload.get("source"), "url"),
                    _source_attr(payload.get("source"), "title"),
                    _source_attr(payload.get("source"), "fetched_at"),
                    move_id,
                ),
            )
        else:
            result = conn.execute(
                """
                INSERT INTO moves
                  (number, name_zh, name_ja, name_en, type_name, category, power, accuracy, pp,
                   description, effect_detail, introduced_generation,
                   source_url, source_title, source_fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.get("number"),
                    payload["name_zh"],
                    payload.get("name_ja"),
                    payload.get("name_en"),
                    ensure_type(conn, payload.get("type")),
                    payload.get("category"),
                    payload.get("power"),
                    payload.get("accuracy"),
                    payload.get("pp"),
                    payload.get("description"),
                    payload.get("effect_detail"),
                    introduced_gen,
                    _source_attr(payload.get("source"), "url"),
                    _source_attr(payload.get("source"), "title"),
                    _source_attr(payload.get("source"), "fetched_at"),
                ),
            )
            move_id = int(result.lastrowid)
        conn.execute("DELETE FROM move_generation_records WHERE move_id = ?", (move_id,))
        for record in payload.get("generations") or []:
            conn.execute(
                """
                INSERT INTO move_generation_records (move_id, generation, game_version_code, description, notes, version_exclusive)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(move_id, generation, game_version_code) DO UPDATE SET
                  description = excluded.description,
                  notes = excluded.notes,
                  version_exclusive = excluded.version_exclusive
                """,
                (
                    move_id,
                    int(record["generation"]),
                    record.get("game_version_code") or "",
                    record.get("description") or "",
                    record.get("notes"),
                    1 if record.get("version_exclusive") else 0,
                ),
            )
        
    return move_id


def upsert_ability_detail(conn: sqlite3.Connection, payload: dict) -> int:
    introduced_gen = payload.get("introduced_generation")
    with conn:
        row = conn.execute(
            "SELECT id FROM abilities WHERE number = ? AND name_zh = ?",
            (payload.get("number"), payload["name_zh"]),
        ).fetchone()
        if row:
            ability_id = int(row["id"])
            conn.execute(
                """
                UPDATE abilities
                SET name_ja = COALESCE(?, name_ja), name_en = COALESCE(?, name_en),
                    description = COALESCE(?, description), effect_detail = COALESCE(?, effect_detail),
                    introduced_generation = COALESCE(?, introduced_generation),
                    source_url = COALESCE(?, source_url), source_title = COALESCE(?, source_title),
                    source_fetched_at = COALESCE(?, source_fetched_at)
                WHERE id = ?
                """,
                (
                    payload.get("name_ja"),
                    payload.get("name_en"),
                    payload.get("description"),
                    payload.get("effect_detail"),
                    introduced_gen,
                    _source_attr(payload.get("source"), "url"),
                    _source_attr(payload.get("source"), "title"),
                    _source_attr(payload.get("source"), "fetched_at"),
                    ability_id,
                ),
            )
        else:
            result = conn.execute(
                """
                INSERT INTO abilities
                  (number, name_zh, name_ja, name_en, description, effect_detail,
                   introduced_generation, source_url, source_title, source_fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.get("number"),
                    payload["name_zh"],
                    payload.get("name_ja"),
                    payload.get("name_en"),
                    payload.get("description"),
                    payload.get("effect_detail"),
                    introduced_gen,
                    _source_attr(payload.get("source"), "url"),
                    _source_attr(payload.get("source"), "title"),
                    _source_attr(payload.get("source"), "fetched_at"),
                ),
            )
            ability_id = int(result.lastrowid)
        conn.execute("DELETE FROM ability_generation_records WHERE ability_id = ?", (ability_id,))
        for record in payload.get("generations") or []:
            conn.execute(
                """
                INSERT INTO ability_generation_records (ability_id, generation, game_version_code, description, notes, version_exclusive)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(ability_id, generation) DO UPDATE SET
                  game_version_code = excluded.game_version_code,
                  description = excluded.description,
                  notes = excluded.notes,
                  version_exclusive = excluded.version_exclusive
                """,
                (
                    ability_id,
                    int(record["generation"]),
                    record.get("game_version_code"),
                    record.get("description") or "",
                    record.get("notes"),
                    1 if record.get("version_exclusive") else 0,
                ),
            )
    return ability_id


def upsert_item_detail(conn: sqlite3.Connection, payload: dict) -> int:
    slug = payload.get("slug") or slugify(payload["name_zh"])
    introduced_gen = payload.get("introduced_generation")
    if isinstance(introduced_gen, str):
        introduced_gen = int(introduced_gen) if introduced_gen.isdigit() else None
    with conn:
        row = conn.execute("SELECT id FROM items WHERE slug = ? OR name_zh = ?", (slug, payload["name_zh"])).fetchone()
        if row:
            item_id = int(row["id"])
            conn.execute(
                """
                UPDATE items
                SET slug = ?, name_zh = ?, name_ja = COALESCE(?, name_ja), name_en = COALESCE(?, name_en),
                    category = COALESCE(?, category), effect_summary = COALESCE(?, effect_summary),
                    effect_detail = COALESCE(?, effect_detail),
                    introduced_generation = COALESCE(?, introduced_generation),
                    image_url = COALESCE(?, image_url),
                    source_url = COALESCE(?, source_url), source_title = COALESCE(?, source_title),
                    source_fetched_at = COALESCE(?, source_fetched_at)
                WHERE id = ?
                """,
                (
                    payload.get("slug") or slugify(payload["name_zh"]),
                    payload["name_zh"],
                    payload.get("name_ja"),
                    payload.get("name_en"),
                    payload.get("category"),
                    payload.get("effect_summary"),
                    payload.get("effect_detail"),
                    introduced_gen,
                    payload.get("image_url"),
                    _source_attr(payload.get("source"), "url"),
                    _source_attr(payload.get("source"), "title"),
                    _source_attr(payload.get("source"), "fetched_at"),
                    item_id,
                ),
            )
        else:
            result = conn.execute(
                """
                INSERT INTO items
                  (slug, name_zh, name_ja, name_en, category, effect_summary,
                   effect_detail, introduced_generation, image_url,
                   source_url, source_title, source_fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    slug,
                    payload["name_zh"],
                    payload.get("name_ja"),
                    payload.get("name_en"),
                    payload.get("category"),
                    payload.get("effect_summary"),
                    payload.get("effect_detail"),
                    introduced_gen,
                    payload.get("image_url"),
                    _source_attr(payload.get("source"), "url"),
                    _source_attr(payload.get("source"), "title"),
                    _source_attr(payload.get("source"), "fetched_at"),
                ),
            )
            item_id = int(result.lastrowid)
        # 写入世代变更记录
        conn.execute("DELETE FROM item_generation_records WHERE item_id = ?", (item_id,))
        for record in payload.get("generations") or []:
            conn.execute(
                """
                INSERT INTO item_generation_records (item_id, generation, game_version_code, description, notes, version_exclusive)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(item_id, generation) DO UPDATE SET
                    game_version_code = excluded.game_version_code,
                    description = excluded.description,
                    notes = excluded.notes,
                    version_exclusive = excluded.version_exclusive
                """,
                (
                    item_id,
                    int(record["generation"]),
                    record.get("game_version_code"),
                    record.get("description") or "",
                    record.get("notes"),
                    1 if record.get("version_exclusive") else 0,
                ),
            )
    return item_id


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _source_attr(source, attr: str):
    if not source:
        return None
    if attr == "fetched_at":
        return getattr(source, "fetched_at", None)
    return getattr(source, attr, None)
