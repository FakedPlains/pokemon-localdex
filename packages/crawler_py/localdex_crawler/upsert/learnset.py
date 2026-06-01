from __future__ import annotations

import sqlite3
import unicodedata

from ..form_type import _normalize_form_match, _normalize_identifier
from .base import _lookup_ability_id
from .catalog import ensure_move


DEFAULT_LEARNSET_LABELS = {
    "",
    "default",
    "一般",
    "一般形态",
    "通常形态",
    "普通形态",
    "草木蓑衣",
    "百战勇者",
    "惩戒胡帕",
}


def _default_form_id(conn: sqlite3.Connection, pokemon_id: int) -> int | None:
    row = conn.execute(
        "SELECT id FROM pokemon_forms WHERE pokemon_id = ? AND is_default = 1 LIMIT 1",
        (pokemon_id,),
    ).fetchone()
    if row:
        return int(row["id"])
    row = conn.execute(
        "SELECT id FROM pokemon_forms WHERE pokemon_id = ? ORDER BY sort_order, id LIMIT 1",
        (pokemon_id,),
    ).fetchone()
    return int(row["id"]) if row else None


def _resolve_learnset_form_id(
    conn: sqlite3.Connection,
    pokemon_id: int,
    source_label: str | None,
) -> int | None:
    pokemon_row = conn.execute(
        "SELECT name_zh FROM pokemon WHERE id = ?",
        (pokemon_id,),
    ).fetchone()
    species_name = pokemon_row["name_zh"] if pokemon_row else None
    rows = conn.execute(
        """
        SELECT id, form_type, form_category, name_zh, display_name_zh, name_en, is_default
        FROM pokemon_forms
        WHERE pokemon_id = ?
        ORDER BY is_default DESC, sort_order, id
        """,
        (pokemon_id,),
    ).fetchall()
    if not rows:
        return None

    default_id = _default_form_id(conn, pokemon_id)
    label = unicodedata.normalize("NFKC", source_label or "").strip()
    if label in DEFAULT_LEARNSET_LABELS or (species_name and label == species_name):
        return default_id

    normalized = _normalize_identifier(label)
    for row in rows:
        if (
            _normalize_identifier(row["form_type"]) == normalized
            or _normalize_identifier(row["name_zh"]) == normalized
            or _normalize_identifier(row["display_name_zh"]) == normalized
            or _normalize_identifier(row["name_en"]) == normalized
        ):
            return int(row["id"])

    for zh_region, type_prefix in (
        ("阿罗拉", "alola"),
        ("伽勒尔", "galar"),
        ("洗翠", "hisui"),
        ("帕底亚", "paldea"),
    ):
        if zh_region in label:
            for row in rows:
                if (
                    _normalize_identifier(row["form_type"]).startswith(type_prefix)
                    or zh_region in (row["name_zh"] or "")
                    or zh_region in (row["display_name_zh"] or "")
                ):
                    return int(row["id"])

    compact = _normalize_form_match(label, species_name)
    if compact:
        for row in rows:
            if row["is_default"]:
                continue
            zh = _normalize_form_match(row["name_zh"], species_name)
            display_zh = _normalize_form_match(row["display_name_zh"], species_name)
            form_type = _normalize_form_match(row["form_type"], species_name)
            if (
                zh == compact
                or display_zh == compact
                or (zh and (zh in compact or compact in zh))
                or (display_zh and (display_zh in compact or compact in display_zh))
                or form_type == compact
            ):
                return int(row["id"])

    return default_id


def _learnset_signature(move_list: list[dict]) -> tuple:
    return tuple(sorted(
        (
            record.get("move_name_zh") or "",
            record.get("learn_method") or "",
            record.get("level") if record.get("level") is not None else -1,
            record.get("game_version_code") or "",
            record.get("tm_number") or "",
            record.get("notes") or "",
        )
        for record in move_list
    ))


def upsert_pokemon_moves(
    conn: sqlite3.Connection,
    pokemon_id: int,
    generation: int,
    form_learnsets: dict[str, list[dict]],
) -> int:
    """写入宝可梦招式学习列表到 pokemon_moves 表。

    form_learnsets 格式::

        {
            "default": [
                {"move_name_zh": "...", "learn_method": "level-up", "level": 5,
                 "game_version_code": "SV", "tm_number": None, "notes": None},
                ...
            ],
            "阿罗拉的样子": [...],
        }

    非默认形态的招式表与默认形态完全一致时不重复写入，查询层会回退到默认形态。
    """
    with conn:
        default_id = _default_form_id(conn, pokemon_id)
        resolved: list[tuple[str, int, list[dict]]] = []
        for source_label, move_list in form_learnsets.items():
            form_id = _resolve_learnset_form_id(conn, pokemon_id, source_label)
            if form_id is None:
                continue
            resolved.append((source_label, form_id, move_list))

        if not resolved:
            return 0

        default_records = next((moves for _, form_id, moves in resolved if form_id == default_id), None)
        default_signature = _learnset_signature(default_records) if default_records is not None else None

        # 清除该宝可梦该世代旧招式；本次页面代表该世代所有解析到的形态。
        conn.execute(
            "DELETE FROM pokemon_moves WHERE pokemon_id = ? AND generation = ?",
            (pokemon_id, generation),
        )

        inserted = 0
        for _source_label, form_id, move_list in resolved:
            if (
                default_signature is not None
                and default_id is not None
                and form_id != default_id
                and _learnset_signature(move_list) == default_signature
            ):
                continue

            for sort_order, record in enumerate(move_list, start=1):
                move_name = record["move_name_zh"]
                move_id = ensure_move(conn, move_name)
                conn.execute(
                    """
                    INSERT OR IGNORE INTO pokemon_moves
                      (pokemon_id, form_id, move_id, move_name_zh, generation,
                       game_version_code, learn_method, level, tm_number, sort_order, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        pokemon_id,
                        form_id,
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
                inserted += 1
    return inserted
