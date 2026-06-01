from __future__ import annotations

import sqlite3

from .base import _source_attr


def upsert_field_effect_detail(conn: sqlite3.Connection, payload: dict) -> int:
    """写入 field_effects 主表 + field_effect_generation_records 子表。返回 entity ID。"""
    with conn:
        row = conn.execute(
            "SELECT id FROM field_effects WHERE kind = ? AND key = ?",
            (payload["kind"], payload["key"]),
        ).fetchone()
        if row:
            fe_id = int(row["id"])
            conn.execute(
                """
                UPDATE field_effects
                SET name_zh = ?, name_en = COALESCE(?, name_en), name_ja = COALESCE(?, name_ja),
                    description = COALESCE(?, description),
                    introduced_generation = COALESCE(?, introduced_generation),
                    max_turns = COALESCE(?, max_turns), max_layers = COALESCE(?, max_layers),
                    source_url = COALESCE(?, source_url), source_title = COALESCE(?, source_title),
                    source_fetched_at = COALESCE(?, source_fetched_at)
                WHERE id = ?
                """,
                (
                    payload["name_zh"],
                    payload.get("name_en"),
                    payload.get("name_ja"),
                    payload.get("description"),
                    payload.get("introduced_generation"),
                    payload.get("max_turns"),
                    payload.get("max_layers"),
                    _source_attr(payload.get("source"), "url"),
                    _source_attr(payload.get("source"), "title"),
                    _source_attr(payload.get("source"), "fetched_at"),
                    fe_id,
                ),
            )
        else:
            result = conn.execute(
                """
                INSERT INTO field_effects
                  (kind, key, name_zh, name_en, name_ja, description,
                   introduced_generation, max_turns, max_layers,
                   source_url, source_title, source_fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["kind"],
                    payload["key"],
                    payload["name_zh"],
                    payload.get("name_en"),
                    payload.get("name_ja"),
                    payload.get("description"),
                    payload.get("introduced_generation"),
                    payload.get("max_turns"),
                    payload.get("max_layers"),
                    _source_attr(payload.get("source"), "url"),
                    _source_attr(payload.get("source"), "title"),
                    _source_attr(payload.get("source"), "fetched_at"),
                ),
            )
            fe_id = int(result.lastrowid)

        # 子表：世代变更记录（先删后插）
        conn.execute("DELETE FROM field_effect_generation_records WHERE field_effect_id = ?", (fe_id,))
        for record in payload.get("generations") or []:
            conn.execute(
                """
                INSERT INTO field_effect_generation_records
                  (field_effect_id, generation, game_version_code, description, notes, version_exclusive)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    fe_id,
                    int(record["generation"]),
                    record.get("game_version_code"),
                    record.get("description") or "",
                    record.get("notes"),
                    1 if record.get("version_exclusive") else 0,
                ),
            )
    return fe_id
