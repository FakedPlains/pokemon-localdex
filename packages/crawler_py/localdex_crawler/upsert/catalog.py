from __future__ import annotations

import sqlite3

from ..text import normalize_type_name
from .base import _source_attr


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
    introduced_gen = payload.get("introduced_generation")
    if isinstance(introduced_gen, str):
        introduced_gen = int(introduced_gen) if introduced_gen.isdigit() else None
    with conn:
        row = conn.execute("SELECT id FROM items WHERE name_zh = ?", (payload["name_zh"],)).fetchone()
        if row:
            item_id = int(row["id"])
            conn.execute(
                """
                UPDATE items
                SET name_zh = ?, name_ja = COALESCE(?, name_ja), name_en = COALESCE(?, name_en),
                    category = COALESCE(?, category), effect_summary = COALESCE(?, effect_summary),
                    effect_detail = COALESCE(?, effect_detail),
                    introduced_generation = COALESCE(?, introduced_generation),
                    image_url = COALESCE(?, image_url),
                    source_url = COALESCE(?, source_url), source_title = COALESCE(?, source_title),
                    source_fetched_at = COALESCE(?, source_fetched_at)
                WHERE id = ?
                """,
                (
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
                  (name_zh, name_ja, name_en, category, effect_summary,
                   effect_detail, introduced_generation, image_url,
                   source_url, source_title, source_fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
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
