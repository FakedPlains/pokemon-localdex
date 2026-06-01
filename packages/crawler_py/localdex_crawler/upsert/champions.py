from __future__ import annotations

import sqlite3
import unicodedata

from ..form_type import _normalize_identifier
from .base import _lookup_item_id, _source_attr, _table_has_column
from .learnset import _resolve_learnset_form_id


def upsert_champions_data(conn: sqlite3.Connection, payload: dict) -> dict[str, int]:
    """写入 Champions 赛季、赛制、可用宝可梦与道具列表。"""
    _ensure_champions_schema(conn)
    seasons = payload.get("seasons") or []
    regulations = payload.get("regulations") or []
    champion_items = payload.get("items") or []
    sources = payload.get("sources") or {}

    regulation_source = sources.get("regulations")
    season_source = sources.get("seasons")

    with conn:
        regulation_ids: dict[str, int] = {}
        for regulation in regulations:
            regulation_id = _upsert_champions_regulation(conn, regulation, regulation_source)
            regulation_ids[regulation.regulation_code] = regulation_id
            _replace_champions_regulation_pokemon(conn, regulation_id, regulation.pokemon)

        item_ids: list[tuple[int, int]] = []
        seen_item_ids: set[int] = set()
        for item in champion_items:
            if not item.is_battle_item:
                continue
            item_id = _lookup_item_id(conn, item.name_zh)
            if item_id is None or item_id in seen_item_ids:
                continue
            item_ids.append((item_id, item.sort_order))
            seen_item_ids.add(item_id)

        for regulation in regulations:
            regulation_id = regulation_ids.get(regulation.regulation_code)
            if not regulation_id:
                continue
            conn.execute(
                "DELETE FROM champions_regulation_items WHERE regulation_id = ?",
                (regulation_id,),
            )
            for item_id, sort_order in item_ids:
                conn.execute(
                    """
                    INSERT INTO champions_regulation_items
                      (regulation_id, item_id, sort_order)
                    VALUES (?, ?, ?)
                    ON CONFLICT(regulation_id, item_id) DO UPDATE SET
                      sort_order = excluded.sort_order
                    """,
                    (regulation_id, item_id, sort_order),
                )

        for season in seasons:
            _upsert_champions_season(conn, season, regulation_ids.get(season.regulation_code), season_source)

    return {
        "seasons": len(seasons),
        "regulations": len(regulations),
        "pokemon": sum(len(regulation.pokemon) for regulation in regulations),
        "items": len(champion_items),
        "linkedItems": len(item_ids),
    }


def _ensure_champions_schema(conn: sqlite3.Connection) -> None:
    if _table_has_column(conn, "champions_regulation_items", "champions_item_id"):
        conn.execute("DROP TABLE IF EXISTS champions_regulation_items")
    conn.execute("DROP TABLE IF EXISTS champions_items")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS champions_regulations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          regulation_code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          start_at TEXT,
          end_at TEXT,
          period_text TEXT,
          special_feature TEXT,
          held_item_rule TEXT,
          battle_time TEXT,
          source_url TEXT,
          source_title TEXT,
          source_fetched_at TEXT
        );

        CREATE TABLE IF NOT EXISTS champions_seasons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          season_code TEXT NOT NULL UNIQUE,
          regulation_id INTEGER REFERENCES champions_regulations(id) ON DELETE SET NULL,
          regulation_code TEXT NOT NULL,
          start_at TEXT,
          end_at TEXT,
          period_text TEXT,
          source_url TEXT,
          source_title TEXT,
          source_fetched_at TEXT
        );

        CREATE TABLE IF NOT EXISTS champions_regulation_pokemon (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          regulation_id INTEGER NOT NULL REFERENCES champions_regulations(id) ON DELETE CASCADE,
          pokemon_id INTEGER REFERENCES pokemon(id) ON DELETE SET NULL,
          form_id INTEGER REFERENCES pokemon_forms(id) ON DELETE SET NULL,
          dex_number INTEGER,
          msp_code TEXT NOT NULL,
          form_code TEXT,
          name_zh TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          UNIQUE (regulation_id, msp_code, name_zh)
        );

        CREATE TABLE IF NOT EXISTS champions_regulation_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          regulation_id INTEGER NOT NULL REFERENCES champions_regulations(id) ON DELETE CASCADE,
          item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          UNIQUE (regulation_id, item_id)
        );

        CREATE INDEX IF NOT EXISTS idx_champions_seasons_regulation ON champions_seasons(regulation_id);
        CREATE INDEX IF NOT EXISTS idx_champions_regulation_pokemon_regulation ON champions_regulation_pokemon(regulation_id);
        CREATE INDEX IF NOT EXISTS idx_champions_regulation_pokemon_pokemon ON champions_regulation_pokemon(pokemon_id);
        CREATE INDEX IF NOT EXISTS idx_champions_regulation_items_regulation ON champions_regulation_items(regulation_id);
        """
    )


def _upsert_champions_regulation(conn: sqlite3.Connection, regulation, source) -> int:
    row = conn.execute(
        "SELECT id FROM champions_regulations WHERE regulation_code = ?",
        (regulation.regulation_code,),
    ).fetchone()
    if row:
        regulation_id = int(row["id"])
        conn.execute(
            """
            UPDATE champions_regulations
            SET name = ?, start_at = ?, end_at = ?, period_text = ?,
                special_feature = ?, held_item_rule = ?, battle_time = ?,
                source_url = COALESCE(?, source_url),
                source_title = COALESCE(?, source_title),
                source_fetched_at = COALESCE(?, source_fetched_at)
            WHERE id = ?
            """,
            (
                regulation.name,
                regulation.start_at,
                regulation.end_at,
                regulation.period_text,
                regulation.special_feature,
                regulation.held_item_rule,
                regulation.battle_time,
                _source_attr(source, "url"),
                _source_attr(source, "title"),
                _source_attr(source, "fetched_at"),
                regulation_id,
            ),
        )
    else:
        result = conn.execute(
            """
            INSERT INTO champions_regulations
              (regulation_code, name, start_at, end_at, period_text,
               special_feature, held_item_rule, battle_time,
               source_url, source_title, source_fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                regulation.regulation_code,
                regulation.name,
                regulation.start_at,
                regulation.end_at,
                regulation.period_text,
                regulation.special_feature,
                regulation.held_item_rule,
                regulation.battle_time,
                _source_attr(source, "url"),
                _source_attr(source, "title"),
                _source_attr(source, "fetched_at"),
            ),
        )
        regulation_id = int(result.lastrowid)
    return regulation_id


def _replace_champions_regulation_pokemon(conn: sqlite3.Connection, regulation_id: int, pokemon_entries: list) -> None:
    conn.execute("DELETE FROM champions_regulation_pokemon WHERE regulation_id = ?", (regulation_id,))
    for entry in pokemon_entries:
        pokemon_id = _lookup_pokemon_id(conn, entry.dex_number, entry.name_zh)
        form_id = _lookup_form_id(conn, pokemon_id, entry.name_zh, entry.form_code)
        conn.execute(
            """
            INSERT INTO champions_regulation_pokemon
              (regulation_id, pokemon_id, form_id, dex_number, msp_code, form_code,
               name_zh, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                regulation_id,
                pokemon_id,
                form_id,
                entry.dex_number,
                entry.msp_code,
                entry.form_code,
                entry.name_zh,
                entry.sort_order,
            ),
        )


def _upsert_champions_season(conn: sqlite3.Connection, season, regulation_id: int | None, source) -> int:
    row = conn.execute(
        "SELECT id FROM champions_seasons WHERE season_code = ?",
        (season.season_code,),
    ).fetchone()
    if row:
        season_id = int(row["id"])
        conn.execute(
            """
            UPDATE champions_seasons
            SET regulation_id = ?, regulation_code = ?, start_at = ?, end_at = ?, period_text = ?,
                source_url = COALESCE(?, source_url),
                source_title = COALESCE(?, source_title),
                source_fetched_at = COALESCE(?, source_fetched_at)
            WHERE id = ?
            """,
            (
                regulation_id,
                season.regulation_code,
                season.start_at,
                season.end_at,
                season.period_text,
                _source_attr(source, "url"),
                _source_attr(source, "title"),
                _source_attr(source, "fetched_at"),
                season_id,
            ),
        )
    else:
        result = conn.execute(
            """
            INSERT INTO champions_seasons
              (season_code, regulation_id, regulation_code, start_at, end_at, period_text,
               source_url, source_title, source_fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                season.season_code,
                regulation_id,
                season.regulation_code,
                season.start_at,
                season.end_at,
                season.period_text,
                _source_attr(source, "url"),
                _source_attr(source, "title"),
                _source_attr(source, "fetched_at"),
            ),
        )
        season_id = int(result.lastrowid)
    return season_id


def _lookup_pokemon_id(conn: sqlite3.Connection, dex_number: int | None, name_zh: str) -> int | None:
    row = None
    if dex_number is not None:
        row = conn.execute("SELECT id FROM pokemon WHERE dex_number = ? LIMIT 1", (dex_number,)).fetchone()
    if not row:
        row = conn.execute("SELECT id FROM pokemon WHERE name_zh = ? LIMIT 1", (name_zh,)).fetchone()
    return int(row["id"]) if row else None


def _champions_form_code_to_form_type(form_code: str | None, name_zh: str | None = None) -> str | None:
    code = unicodedata.normalize("NFKC", form_code or "").upper()
    if not code:
        return None
    label = unicodedata.normalize("NFKC", name_zh or "")
    if "阿罗拉" in label or code == "A":
        return "alola"
    if "伽勒尔" in label or code == "G":
        return "galar"
    if "洗翠" in label:
        return "hisui"
    if "帕底亚" in label:
        if "斗战种" in label or code == "PC":
            return "paldea-combat"
        if "火炽种" in label or code == "PB":
            return "paldea-blaze"
        if "水澜种" in label or code == "PA":
            return "paldea-aqua"
        return "paldea"
    known = {
        "E": "eternal",
        "MN": "midnight",
        "D": "dusk",
        "S": "small",
        "L": "large",
        "XL": "super",
        "F": "f",
    }
    return known.get(code)


def _lookup_form_id(conn: sqlite3.Connection, pokemon_id: int | None, name_zh: str, form_code: str | None) -> int | None:
    if pokemon_id is None:
        return None
    pokemon_row = conn.execute("SELECT name_zh FROM pokemon WHERE id = ?", (pokemon_id,)).fetchone()
    default_form = conn.execute(
        "SELECT id FROM pokemon_forms WHERE pokemon_id = ? AND is_default = 1 LIMIT 1",
        (pokemon_id,),
    ).fetchone()
    default_id = int(default_form["id"]) if default_form else None
    if not form_code and pokemon_row:
        return default_id
    if pokemon_row and pokemon_row["name_zh"] == name_zh:
        return default_id

    normalized_name = unicodedata.normalize("NFKC", name_zh or "").strip()
    row = conn.execute(
        """
        SELECT id FROM pokemon_forms
        WHERE pokemon_id = ?
          AND (
            name_zh = ?
            OR display_name_zh = ?
            OR form_type = ?
          )
        LIMIT 1
        """,
        (pokemon_id, normalized_name, normalized_name, _champions_form_code_to_form_type(form_code, normalized_name) or form_code),
    ).fetchone()
    if row:
        return int(row["id"])

    matched = _resolve_learnset_form_id(conn, pokemon_id, normalized_name)
    if matched and matched != default_id:
        return matched

    form_type = _champions_form_code_to_form_type(form_code, normalized_name)
    if form_type:
        row = conn.execute(
            """
            SELECT id FROM pokemon_forms
            WHERE pokemon_id = ? AND form_type = ?
            LIMIT 1
            """,
            (pokemon_id, form_type),
        ).fetchone()
        if row:
            return int(row["id"])

    return default_id
