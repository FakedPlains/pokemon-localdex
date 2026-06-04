"""将 pokechamdb.com 使用率数据写入 SQLite。

遵循爬虫架构规则：upsert 模块只负责写库，不解析 HTML。
"""

from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timezone

from ..parsers.pokechamdb_usage import (
    UsageAbilityEntry,
    UsageEvSpreadEntry,
    UsageItemEntry,
    UsageMoveEntry,
    UsageNatureEntry,
    UsagePartnerEntry,
    UsagePokemonDetail,
    UsagePokemonEntry,
)
from .base import _lookup_ability_id, _lookup_item_id, _lookup_pokemon_by_name


# pokechamdb 中文译名 -> 52Poké 标准中文名 的差异映射
# pokechamdb 使用的某些中文名与 52Poké Wiki（我们的数据源）不一致
POKECHAMDB_NAME_ZH_ALIASES: dict[str, str] = {
    "仆斩将军": "仆刀将军",       # Kingambit
    "谜拟Ｑ": "谜拟丘",          # Mimikyu（全角Q vs 丘）
    "流氓熊猫": "霸道熊猫",       # Pangoro
}


# 性格中文名 -> ID 映射（与 shared-types NATURE_DEFS 保持一致）
NATURE_ZH_TO_ID: dict[str, int] = {
    "勤奋": 1,
    "怕寂寞": 2,
    "固执": 3,
    "顽皮": 4,
    "勇敢": 5,
    "大胆": 6,
    "坦率": 7,
    "淘气": 8,
    "乐天": 9,
    "悠闲": 10,
    "胆小": 11,
    "急躁": 12,
    "认真": 13,
    "爽朗": 14,
    "天真": 15,
    "内敛": 16,
    "慢吞吞": 17,
    "害羞": 18,
    "马虎": 19,
    "冷静": 20,
    "温和": 21,
    "温顺": 22,
    "慎重": 23,
    "浮躁": 24,
    "自大": 25,
}

# 性格英文名 -> ID 映射
NATURE_EN_TO_ID: dict[str, int] = {
    "hardy": 1, "lonely": 2, "adamant": 3, "naughty": 4, "brave": 5,
    "bold": 6, "docile": 7, "impish": 8, "lax": 9, "relaxed": 10,
    "timid": 11, "hasty": 12, "serious": 13, "jolly": 14, "naive": 15,
    "modest": 16, "mild": 17, "bashful": 18, "rash": 19, "quiet": 20,
    "calm": 21, "gentle": 22, "careful": 23, "quirky": 24, "sassy": 25,
}


def upsert_usage_pokemon(
    conn: sqlite3.Connection,
    season_id: int,
    fmt: str,
    event_id: str | None,
    entries: list[UsagePokemonEntry],
    fetched_at: str | None = None,
) -> dict[str, int]:
    """写入宝可梦使用率主表记录。

    返回 { slug -> usage_pokemon.id } 映射，供后续子表写入使用。
    """
    _ensure_usage_schema(conn)
    if not fetched_at:
        fetched_at = datetime.now(timezone.utc).isoformat()

    slug_to_id: dict[str, int] = {}
    with conn:
        for entry in entries:
            # 优先通过 slug 精确匹配 form 表（能正确处理地区形态和非默认形态）
            pokemon_id, form_id = _lookup_by_slug(conn, entry.slug)

            # slug 匹配失败时，通过中文名 fallback 到默认形态
            if not pokemon_id:
                pokemon_id = _lookup_pokemon_by_name(conn, entry.name_zh)
                form_id = _lookup_default_form_id(conn, pokemon_id) if pokemon_id else None

            row = conn.execute(
                """
                INSERT INTO champions_usage_pokemon
                  (season_id, format, event_id, pokemon_id, form_id, pokemon_slug, rank, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(season_id, format, event_id, pokemon_slug)
                DO UPDATE SET
                  pokemon_id = COALESCE(excluded.pokemon_id, champions_usage_pokemon.pokemon_id),
                  form_id = COALESCE(excluded.form_id, champions_usage_pokemon.form_id),
                  rank = excluded.rank,
                  fetched_at = excluded.fetched_at
                RETURNING id
                """,
                (season_id, fmt, event_id or "", pokemon_id, form_id, entry.slug, entry.rank, fetched_at),
            ).fetchone()
            if row:
                slug_to_id[entry.slug] = int(row[0])

    return slug_to_id


def upsert_usage_detail(
    conn: sqlite3.Connection,
    usage_pokemon_id: int,
    detail: UsagePokemonDetail,
) -> dict[str, int]:
    """写入某个宝可梦的使用率详情子表数据。

    返回各子表写入行数的统计。
    """
    stats: dict[str, int] = {}
    with conn:
        stats["moves"] = _upsert_moves(conn, usage_pokemon_id, detail.moves)
        stats["items"] = _upsert_items(conn, usage_pokemon_id, detail.items)
        stats["abilities"] = _upsert_abilities(conn, usage_pokemon_id, detail.abilities)
        stats["natures"] = _upsert_natures(conn, usage_pokemon_id, detail.natures)
        stats["partners"] = _upsert_partners(conn, usage_pokemon_id, detail.partners)
        stats["ev_spreads"] = _upsert_ev_spreads(conn, usage_pokemon_id, detail.ev_spreads)
    return stats


def clear_usage_data(conn: sqlite3.Connection, season_id: int | None = None, fmt: str | None = None) -> int:
    """清除使用率数据。CASCADE 会自动删除子表关联行。"""
    # 确保表已存在（首次运行时可能还没创建）
    _ensure_usage_schema(conn)

    if season_id and fmt:
        row = conn.execute(
            "DELETE FROM champions_usage_pokemon WHERE season_id = ? AND format = ?",
            (season_id, fmt),
        )
    elif season_id:
        row = conn.execute(
            "DELETE FROM champions_usage_pokemon WHERE season_id = ?",
            (season_id,),
        )
    else:
        row = conn.execute("DELETE FROM champions_usage_pokemon")
    conn.commit()
    return row.rowcount


# --- 内部实现 ---


def _ensure_usage_schema(conn: sqlite3.Connection) -> None:
    """确保使用率相关表已创建。如果表已存在但缺少新列，执行轻量迁移。"""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS champions_usage_pokemon (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          season_id INTEGER NOT NULL REFERENCES champions_seasons(id) ON DELETE CASCADE,
          format TEXT NOT NULL,
          event_id TEXT NOT NULL DEFAULT '',
          pokemon_id INTEGER REFERENCES pokemon(id) ON DELETE SET NULL,
          form_id INTEGER REFERENCES pokemon_forms(id) ON DELETE SET NULL,
          pokemon_slug TEXT NOT NULL,
          rank INTEGER NOT NULL,
          fetched_at TEXT NOT NULL,
          UNIQUE (season_id, format, event_id, pokemon_slug)
        );

        CREATE TABLE IF NOT EXISTS champions_usage_moves (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usage_pokemon_id INTEGER NOT NULL REFERENCES champions_usage_pokemon(id) ON DELETE CASCADE,
          move_id INTEGER REFERENCES moves(id) ON DELETE SET NULL,
          move_name_zh TEXT NOT NULL,
          rank INTEGER NOT NULL,
          percentage REAL NOT NULL,
          UNIQUE (usage_pokemon_id, move_name_zh)
        );

        CREATE TABLE IF NOT EXISTS champions_usage_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usage_pokemon_id INTEGER NOT NULL REFERENCES champions_usage_pokemon(id) ON DELETE CASCADE,
          item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
          item_name_zh TEXT NOT NULL,
          rank INTEGER NOT NULL,
          percentage REAL NOT NULL,
          UNIQUE (usage_pokemon_id, item_name_zh)
        );

        CREATE TABLE IF NOT EXISTS champions_usage_abilities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usage_pokemon_id INTEGER NOT NULL REFERENCES champions_usage_pokemon(id) ON DELETE CASCADE,
          ability_id INTEGER REFERENCES abilities(id) ON DELETE SET NULL,
          ability_name_zh TEXT NOT NULL,
          rank INTEGER NOT NULL,
          percentage REAL NOT NULL,
          UNIQUE (usage_pokemon_id, ability_name_zh)
        );

        CREATE TABLE IF NOT EXISTS champions_usage_natures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usage_pokemon_id INTEGER NOT NULL REFERENCES champions_usage_pokemon(id) ON DELETE CASCADE,
          nature_id INTEGER NOT NULL,
          rank INTEGER NOT NULL,
          percentage REAL NOT NULL,
          UNIQUE (usage_pokemon_id, nature_id)
        );

        CREATE TABLE IF NOT EXISTS champions_usage_partners (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usage_pokemon_id INTEGER NOT NULL REFERENCES champions_usage_pokemon(id) ON DELETE CASCADE,
          partner_pokemon_id INTEGER REFERENCES pokemon(id) ON DELETE SET NULL,
          partner_form_id INTEGER REFERENCES pokemon_forms(id) ON DELETE SET NULL,
          partner_slug TEXT NOT NULL,
          rank INTEGER NOT NULL,
          UNIQUE (usage_pokemon_id, partner_slug)
        );

        CREATE TABLE IF NOT EXISTS champions_usage_ev_spreads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usage_pokemon_id INTEGER NOT NULL REFERENCES champions_usage_pokemon(id) ON DELETE CASCADE,
          rank INTEGER NOT NULL,
          percentage REAL NOT NULL,
          hp INTEGER NOT NULL DEFAULT 0,
          atk INTEGER NOT NULL DEFAULT 0,
          def INTEGER NOT NULL DEFAULT 0,
          sp_atk INTEGER NOT NULL DEFAULT 0,
          sp_def INTEGER NOT NULL DEFAULT 0,
          speed INTEGER NOT NULL DEFAULT 0,
          UNIQUE (usage_pokemon_id, hp, atk, def, sp_atk, sp_def, speed)
        );

        CREATE INDEX IF NOT EXISTS idx_usage_pokemon_season ON champions_usage_pokemon(season_id, format);
        CREATE INDEX IF NOT EXISTS idx_usage_pokemon_pid ON champions_usage_pokemon(pokemon_id);
        CREATE INDEX IF NOT EXISTS idx_usage_moves_parent ON champions_usage_moves(usage_pokemon_id);
        CREATE INDEX IF NOT EXISTS idx_usage_moves_mid ON champions_usage_moves(move_id);
        CREATE INDEX IF NOT EXISTS idx_usage_items_parent ON champions_usage_items(usage_pokemon_id);
        CREATE INDEX IF NOT EXISTS idx_usage_items_iid ON champions_usage_items(item_id);
        CREATE INDEX IF NOT EXISTS idx_usage_abilities_parent ON champions_usage_abilities(usage_pokemon_id);
        CREATE INDEX IF NOT EXISTS idx_usage_abilities_aid ON champions_usage_abilities(ability_id);
        CREATE INDEX IF NOT EXISTS idx_usage_natures_parent ON champions_usage_natures(usage_pokemon_id);
        CREATE INDEX IF NOT EXISTS idx_usage_partners_parent ON champions_usage_partners(usage_pokemon_id);
        CREATE INDEX IF NOT EXISTS idx_usage_ev_spreads_parent ON champions_usage_ev_spreads(usage_pokemon_id);
        """
    )

    # 轻量迁移：为旧表添加 partner_form_id 列（SQLite 不支持 IF NOT EXISTS for ALTER TABLE）
    cols = {row[1] for row in conn.execute("PRAGMA table_info(champions_usage_partners)").fetchall()}
    if "partner_form_id" not in cols:
        conn.execute(
            "ALTER TABLE champions_usage_partners ADD COLUMN partner_form_id INTEGER REFERENCES pokemon_forms(id) ON DELETE SET NULL"
        )
        conn.commit()


def _lookup_default_form_id(conn: sqlite3.Connection, pokemon_id: int | None) -> int | None:
    """查找宝可梦的默认形态 ID。"""
    if not pokemon_id:
        return None
    row = conn.execute(
        "SELECT id FROM pokemon_forms WHERE pokemon_id = ? AND is_default = 1 LIMIT 1",
        (pokemon_id,),
    ).fetchone()
    return int(row[0]) if row else None



# pokechamdb slug -> 实际应匹配的 name_en 覆盖映射
# 用于 pokechamdb 不区分形态后缀，但实际参赛形态是非默认形态的情况
SLUG_FORM_OVERRIDES: dict[str, str] = {
    "floette": "floette-eternal",  # 花叶蒂在 Champions 赛制中只有永恒之花形态参赛
}


def _lookup_by_slug(conn: sqlite3.Connection, slug: str) -> tuple[int | None, int | None]:
    """通过 slug 匹配 pokemon_forms.name_en 查找 pokemon_id 和 form_id。

    pokechamdb 的 slug 是英文名的 kebab-case 小写形式，与 name_en 的 LOWER() 几乎一致。
    特殊处理：slug 中的 '-female' 对应 name_en 中的 '-F'。

    返回 (pokemon_id, form_id) 元组。
    """
    if not slug:
        return None, None

    # 0. 检查覆盖映射（处理 pokechamdb 不区分形态但实际是非默认形态的情况）
    override = SLUG_FORM_OVERRIDES.get(slug)
    if override:
        row = conn.execute(
            "SELECT pokemon_id, id FROM pokemon_forms WHERE LOWER(name_en) = ? LIMIT 1",
            (override,),
        ).fetchone()
        if row:
            return int(row[0]), int(row[1])

    # 1. 直接用 LOWER(name_en) = slug 精确匹配
    row = conn.execute(
        "SELECT pokemon_id, id FROM pokemon_forms WHERE LOWER(name_en) = ? LIMIT 1",
        (slug,),
    ).fetchone()
    if row:
        return int(row[0]), int(row[1])

    # 2. 处理 -female -> -f 的特殊映射
    if "-female" in slug:
        normalized = slug.replace("-female", "-f")
        row = conn.execute(
            "SELECT pokemon_id, id FROM pokemon_forms WHERE LOWER(name_en) = ? LIMIT 1",
            (normalized,),
        ).fetchone()
        if row:
            return int(row[0]), int(row[1])

    return None, None


def _lookup_move_id(conn: sqlite3.Connection, name_zh: str) -> int | None:
    """通过中文名查找招式 ID。"""
    if not name_zh:
        return None
    row = conn.execute(
        "SELECT id FROM moves WHERE name_zh = ? LIMIT 1",
        (name_zh,),
    ).fetchone()
    return int(row[0]) if row else None


def _resolve_nature_id(name_zh: str) -> int | None:
    """将性格中文名转换为 ID。"""
    nature_id = NATURE_ZH_TO_ID.get(name_zh)
    if nature_id:
        return nature_id
    # 尝试英文名匹配（不区分大小写）
    return NATURE_EN_TO_ID.get(name_zh.lower())


def _lookup_partner_pokemon_id(conn: sqlite3.Connection, slug: str, name_zh: str) -> tuple[int | None, int | None]:
    """查找队友宝可梦的 pokemon_id 和 form_id，完全基于中文名和英文名匹配，不依赖日文。

    返回 (pokemon_id, form_id) 元组。pokechamdb 队友数据区分形态，
    因此尽可能匹配到具体 form_id。

    匹配优先级：
    1. 中文名精确匹配 pokemon.name_zh -> 取默认形态
    2. 中文名精确匹配 pokemon_forms.name_zh（如"花叶蒂(永恒之花)"）
    3. 中文名匹配 pokemon_forms.display_name_zh（如"永恒之花"）
    4. 带括号的中文名拆解匹配：基础名查 pokemon.name_zh + 括号内容查 display_name_zh
    5. 从同表反查英文 slug，走 _lookup_by_slug
    """
    if not name_zh:
        return None, None

    # 0. 先做别名标准化（pokechamdb 译名差异）
    normalized_name = POKECHAMDB_NAME_ZH_ALIASES.get(name_zh, name_zh)

    # 1. pokemon.name_zh 精确匹配 -> 取默认形态
    pid = _lookup_pokemon_by_name(conn, normalized_name)
    if pid:
        form_id = _lookup_default_form_id(conn, pid)
        return pid, form_id

    # 2. pokemon_forms.name_zh 精确匹配（处理形态完整名，如"超能妙喵(雌性的样子)"）
    row = conn.execute(
        "SELECT pokemon_id, id FROM pokemon_forms WHERE name_zh = ? LIMIT 1",
        (normalized_name,),
    ).fetchone()
    if row:
        return int(row[0]), int(row[1])

    # 3. pokemon_forms.display_name_zh 匹配
    row = conn.execute(
        "SELECT pokemon_id, id FROM pokemon_forms WHERE display_name_zh = ? LIMIT 1",
        (normalized_name,),
    ).fetchone()
    if row:
        return int(row[0]), int(row[1])

    # 4. 带括号的中文名拆解：如"花叶蒂（永恒之花）"
    bracket_match = re.match(r"^(.+?)[（(](.+?)[）)]$", normalized_name)
    if bracket_match:
        base_name = bracket_match.group(1)
        form_name = bracket_match.group(2)
        # 先查基础名确认 pokemon_id，再用 display_name_zh 精确到形态
        row = conn.execute(
            """SELECT pf.pokemon_id, pf.id FROM pokemon_forms pf
               JOIN pokemon p ON p.id = pf.pokemon_id
               WHERE p.name_zh = ? AND pf.display_name_zh = ?
               LIMIT 1""",
            (base_name, form_name),
        ).fetchone()
        if row:
            return int(row[0]), int(row[1])
        # 退而求其次：只用基础名 -> 取默认形态
        pid = _lookup_pokemon_by_name(conn, base_name)
        if pid:
            form_id = _lookup_default_form_id(conn, pid)
            return pid, form_id

    # 5. 从 champions_usage_pokemon 表反查：同中文名的宝可梦应该在列表中有英文 slug
    row = conn.execute(
        """SELECT cup.pokemon_id, cup.form_id FROM champions_usage_pokemon cup
           JOIN pokemon p ON p.id = cup.pokemon_id
           WHERE p.name_zh = ? AND cup.pokemon_id IS NOT NULL
           LIMIT 1""",
        (normalized_name,),
    ).fetchone()
    if row:
        return int(row[0]), int(row[1]) if row[1] else None

    return None, None


def _upsert_moves(conn: sqlite3.Connection, usage_pokemon_id: int, entries: list[UsageMoveEntry]) -> int:
    count = 0
    for entry in entries:
        move_id = _lookup_move_id(conn, entry.name_zh)
        conn.execute(
            """
            INSERT INTO champions_usage_moves
              (usage_pokemon_id, move_id, move_name_zh, rank, percentage)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(usage_pokemon_id, move_name_zh)
            DO UPDATE SET
              move_id = COALESCE(excluded.move_id, champions_usage_moves.move_id),
              rank = excluded.rank,
              percentage = excluded.percentage
            """,
            (usage_pokemon_id, move_id, entry.name_zh, entry.rank, entry.percentage),
        )
        count += 1
    return count


def _upsert_items(conn: sqlite3.Connection, usage_pokemon_id: int, entries: list[UsageItemEntry]) -> int:
    count = 0
    for entry in entries:
        item_id = _lookup_item_id(conn, entry.name_zh)
        conn.execute(
            """
            INSERT INTO champions_usage_items
              (usage_pokemon_id, item_id, item_name_zh, rank, percentage)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(usage_pokemon_id, item_name_zh)
            DO UPDATE SET
              item_id = COALESCE(excluded.item_id, champions_usage_items.item_id),
              rank = excluded.rank,
              percentage = excluded.percentage
            """,
            (usage_pokemon_id, item_id, entry.name_zh, entry.rank, entry.percentage),
        )
        count += 1
    return count


def _upsert_abilities(conn: sqlite3.Connection, usage_pokemon_id: int, entries: list[UsageAbilityEntry]) -> int:
    count = 0
    for entry in entries:
        ability_id = _lookup_ability_id(conn, entry.name_zh)
        conn.execute(
            """
            INSERT INTO champions_usage_abilities
              (usage_pokemon_id, ability_id, ability_name_zh, rank, percentage)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(usage_pokemon_id, ability_name_zh)
            DO UPDATE SET
              ability_id = COALESCE(excluded.ability_id, champions_usage_abilities.ability_id),
              rank = excluded.rank,
              percentage = excluded.percentage
            """,
            (usage_pokemon_id, ability_id, entry.name_zh, entry.rank, entry.percentage),
        )
        count += 1
    return count


def _upsert_natures(conn: sqlite3.Connection, usage_pokemon_id: int, entries: list[UsageNatureEntry]) -> int:
    count = 0
    for entry in entries:
        nature_id = _resolve_nature_id(entry.name_zh)
        if nature_id is None:
            # 无法识别的性格名，跳过（数据问题，后续修复）
            continue
        conn.execute(
            """
            INSERT INTO champions_usage_natures
              (usage_pokemon_id, nature_id, rank, percentage)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(usage_pokemon_id, nature_id)
            DO UPDATE SET
              rank = excluded.rank,
              percentage = excluded.percentage
            """,
            (usage_pokemon_id, nature_id, entry.rank, entry.percentage),
        )
        count += 1
    return count


def _upsert_partners(conn: sqlite3.Connection, usage_pokemon_id: int, entries: list[UsagePartnerEntry]) -> int:
    count = 0
    for entry in entries:
        partner_id, partner_form_id = _lookup_partner_pokemon_id(conn, entry.slug, entry.name_zh)
        conn.execute(
            """
            INSERT INTO champions_usage_partners
              (usage_pokemon_id, partner_pokemon_id, partner_form_id, partner_slug, rank)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(usage_pokemon_id, partner_slug)
            DO UPDATE SET
              partner_pokemon_id = COALESCE(excluded.partner_pokemon_id, champions_usage_partners.partner_pokemon_id),
              partner_form_id = COALESCE(excluded.partner_form_id, champions_usage_partners.partner_form_id),
              rank = excluded.rank
            """,
            (usage_pokemon_id, partner_id, partner_form_id, entry.slug, entry.rank),
        )
        count += 1
    return count


def _upsert_ev_spreads(conn: sqlite3.Connection, usage_pokemon_id: int, entries: list[UsageEvSpreadEntry]) -> int:
    count = 0
    for entry in entries:
        conn.execute(
            """
            INSERT INTO champions_usage_ev_spreads
              (usage_pokemon_id, rank, percentage, hp, atk, def, sp_atk, sp_def, speed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(usage_pokemon_id, hp, atk, def, sp_atk, sp_def, speed)
            DO UPDATE SET
              rank = excluded.rank,
              percentage = excluded.percentage
            """,
            (
                usage_pokemon_id,
                entry.rank,
                entry.percentage,
                entry.hp,
                entry.atk,
                entry.def_,
                entry.sp_atk,
                entry.sp_def,
                entry.speed,
            ),
        )
        count += 1
    return count
