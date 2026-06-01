from __future__ import annotations

import sqlite3
from pathlib import Path


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _safe_count(conn: sqlite3.Connection, table: str) -> int:
    """安全获取表行数，表不存在时返回 0。"""
    try:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    except sqlite3.OperationalError:
        return 0


def _source_attr(source, attr: str):
    if not source:
        return None
    if attr == "fetched_at":
        return getattr(source, "fetched_at", None)
    return getattr(source, attr, None)


def _table_has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    try:
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    except sqlite3.DatabaseError:
        return False
    return any(row["name"] == column for row in rows)


def _lookup_ability_id(conn: sqlite3.Connection, name: str) -> int | None:
    """查找特性 ID（不自动创建）。"""
    if not name:
        return None
    row = conn.execute("SELECT id FROM abilities WHERE name_zh = ?", (name,)).fetchone()
    return int(row["id"]) if row else None


def _lookup_pokemon_by_name(conn: sqlite3.Connection, name: str) -> int | None:
    """通过中文名查找 pokemon_id。"""
    if not name:
        return None
    row = conn.execute(
        "SELECT id FROM pokemon WHERE name_zh = ? LIMIT 1",
        (name,),
    ).fetchone()
    return int(row["id"]) if row else None


def _lookup_item_id(conn: sqlite3.Connection, name_zh: str) -> int | None:
    row = conn.execute(
        "SELECT id FROM items WHERE name_zh = ? LIMIT 1",
        (name_zh,),
    ).fetchone()
    return int(row["id"]) if row else None
