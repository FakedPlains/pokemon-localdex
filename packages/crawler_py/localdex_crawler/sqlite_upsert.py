from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import re
import sqlite3
import unicodedata
from urllib.parse import quote

from .fetcher import RawPage
from .form_name_resolver import resolve_form_name_en
from .html_tools import ParsedPokemonAbilities
from .utils import normalize_type_name


_FORM_RULES_PATH = Path(__file__).with_name("form_name_rules.json")


@lru_cache(maxsize=1)
def _form_type_keywords() -> dict:
    with _FORM_RULES_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)["formTypeKeywords"]


def _normalize_identifier(value: str | None) -> str:
    text = unicodedata.normalize("NFKC", value or "").replace("’", "'").replace("‘", "'").replace("`", "'").strip().lower()
    text = re.sub(r"[（）()・·･\s　_]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text


def _normalize_form_match(value: str | None, species_name: str | None = None) -> str:
    text = unicodedata.normalize("NFKC", value or "").lower()
    species = unicodedata.normalize("NFKC", species_name or "").lower()
    if species:
        text = text.replace(species, "")
    text = re.sub(r"[（）()・·･\s　\-_]", "", text)
    for suffix in ("的样子", "样子", "形态", "形態"):
        text = text.replace(suffix, "")
    return text


def _infer_form_type_from_label(value: str | None) -> str | None:
    """根据 formTypeKeywords 规则从中文标签推断 formType。"""
    text = unicodedata.normalize("NFKC", value or "").strip()
    if not text:
        return None

    kw = _form_type_keywords()
    mega_re = re.compile("|".join(re.escape(p) for p in kw["megaPatterns"]), re.IGNORECASE)
    gmax_re = re.compile("|".join(re.escape(p) for p in kw["gmaxPatterns"]), re.IGNORECASE)
    has_mega = bool(mega_re.search(text))
    has_gmax = bool(gmax_re.search(text))

    # Posture keywords
    for rule in kw["postures"]:
        if rule["keyword"] in text:
            return f"{rule['value']}-mega" if has_mega else rule["value"]

    # Simple keyword rules
    for rule in kw["simple"]:
        matched = any(k in text for k in rule["keywords"]) or (
            "exactMatch" in rule and text == rule["exactMatch"]
        )
        if matched:
            if rule.get("gmaxValue") and has_gmax:
                return rule["gmaxValue"]
            cond_kw = rule.get("conditionalKeyword")
            if cond_kw and cond_kw in text:
                return rule["conditionalValue"]
            if rule.get("megaValue") and has_mega:
                return rule["megaValue"]
            return rule["value"]

    # Region keywords
    for rule in kw["regions"]:
        if rule["keyword"] in text:
            return rule["value"]

    # Gmax fallback
    if has_gmax:
        return "gmax"

    # Mega fallback with X/Y suffix
    if has_mega:
        if re.search(r"[xXＸ]$", text):
            return "mega-x"
        if re.search(r"[yYＹ]$", text):
            return "mega-y"
        return "mega"

    return None


def _derive_form_type(
    species_name_en: str | None,
    form_name_en: str | None,
    fallback_label: str | None,
    is_default: bool = False,
) -> str:
    if is_default:
        return "default"

    species = unicodedata.normalize("NFKC", species_name_en or "").strip()
    form_name = unicodedata.normalize("NFKC", form_name_en or "").strip()
    species_compare = species.replace("’", "'").replace("‘", "'").replace("`", "'")
    form_name_compare = form_name.replace("’", "'").replace("‘", "'").replace("`", "'")
    if species_compare and form_name_compare and form_name_compare != species_compare:
        prefix = f"{species_compare}-"
        if form_name_compare.startswith(prefix):
            suffix = _normalize_identifier(form_name_compare[len(prefix):])
            if suffix:
                return suffix
        normalized = _normalize_identifier(form_name_compare)
        if normalized:
            return normalized

    inferred = _infer_form_type_from_label(fallback_label)
    if inferred:
        return inferred

    fallback = _normalize_identifier(fallback_label)
    return fallback or "alternate"


def _derive_form_category(form_type: str, fallback_category: str | None = None) -> str:
    normalized = _normalize_identifier(form_type)
    if normalized == "default":
        return "default"
    if normalized.startswith("mega") or normalized.endswith("-mega"):
        return "mega"
    if normalized in ("gmax", "gigantamax") or normalized.endswith("-gmax"):
        return "gigantamax"
    for region in ("alola", "galar", "hisui", "paldea"):
        if normalized.startswith(region):
            return f"regional-{region}"
    return _normalize_identifier(fallback_category) or "alternate"


REGION_ZH_BY_FORM_TYPE = {
    "alola": "阿罗拉",
    "galar": "伽勒尔",
    "hisui": "洗翠",
    "paldea": "帕底亚",
}


def _strip_wrapping_parens(value: str) -> str:
    text = value.strip()
    if len(text) >= 2 and text[0] in "(（" and text[-1] in ")）":
        return text[1:-1].strip()
    return text


def _canonical_form_name_zh(
    species_name_zh: str | None,
    display_name_zh: str | None,
    form_type: str | None,
    form_category: str | None,
    is_default: bool = False,
) -> str:
    species = unicodedata.normalize("NFKC", species_name_zh or "").strip()
    display = unicodedata.normalize("NFKC", display_name_zh or species).strip()
    if is_default or not species or not display or display == species:
        return species or display
    if display.startswith(f"{species}(") and display.endswith(")"):
        return display

    normalized_type = _normalize_identifier(form_type)
    normalized_category = _normalize_identifier(form_category)
    region_zh = None
    for prefix, label in REGION_ZH_BY_FORM_TYPE.items():
        if normalized_type.startswith(prefix) or normalized_category == f"regional-{prefix}":
            region_zh = label
            break

    if region_zh:
        if display.startswith(f"{region_zh}{species}"):
            rest = _strip_wrapping_parens(display[len(region_zh) + len(species):])
            suffix = f"{region_zh}的样子"
            if rest:
                suffix += f"・{rest.lstrip('・·･')}"
            return f"{species}({suffix})"
        if display.startswith(f"{region_zh}的样子"):
            rest = _strip_wrapping_parens(display[len(f"{region_zh}的样子"):]).lstrip("・·･")
            suffix = f"{region_zh}的样子"
            if rest:
                suffix += f"・{rest}"
            return f"{species}({suffix})"
        if display.startswith(region_zh):
            rest = _strip_wrapping_parens(display[len(region_zh):]).lstrip("・·･")
            suffix = f"{region_zh}的样子"
            if rest:
                suffix += f"・{rest}"
            return f"{species}({suffix})"

    if display.startswith(species):
        rest = _strip_wrapping_parens(display[len(species):])
        return f"{species}({rest})" if rest else species

    return f"{species}({display})"


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
# 清除数据（--clean 模式）— 使用 DROP TABLE + CREATE TABLE 重建
# ---------------------------------------------------------------------------

def _safe_count(conn: sqlite3.Connection, table: str) -> int:
    """安全获取表行数，表不存在时返回 0。"""
    try:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    except sqlite3.OperationalError:
        return 0


def clear_moves(conn: sqlite3.Connection) -> int:
    """清除所有招式数据（含 move_generation_records）— DROP + CREATE 重建。"""
    count = _safe_count(conn, "moves")
    conn.executescript("""
        DROP TABLE IF EXISTS move_generation_records;
        DROP TABLE IF EXISTS moves;
        CREATE TABLE IF NOT EXISTS moves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            number INTEGER,
            name_zh TEXT NOT NULL,
            name_ja TEXT,
            name_en TEXT,
            type_name TEXT,
            category TEXT,
            power INTEGER,
            accuracy INTEGER,
            pp INTEGER,
            description TEXT,
            effect_detail TEXT,
            introduced_generation INTEGER,
            source_url TEXT,
            source_title TEXT,
            source_fetched_at TEXT,
            UNIQUE (number, name_zh)
        );
        CREATE TABLE IF NOT EXISTS move_generation_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            move_id INTEGER NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
            generation INTEGER NOT NULL,
            game_version_code TEXT NOT NULL DEFAULT '',
            description TEXT,
            notes TEXT,
            version_exclusive INTEGER NOT NULL DEFAULT 0,
            UNIQUE (move_id, generation, game_version_code)
        );
        CREATE INDEX IF NOT EXISTS idx_moves_name_zh ON moves(name_zh);
        CREATE INDEX IF NOT EXISTS idx_moves_type ON moves(type_name);
        CREATE INDEX IF NOT EXISTS idx_moves_number ON moves(number);
        CREATE INDEX IF NOT EXISTS idx_moves_sort ON moves(CASE WHEN number IS NULL OR number = 0 THEN 1 ELSE 0 END, number);
    """)
    return count


def clear_abilities(conn: sqlite3.Connection) -> int:
    """清除所有特性数据（含 ability_generation_records）— DROP + CREATE 重建。"""
    count = _safe_count(conn, "abilities")
    conn.executescript("""
        DROP TABLE IF EXISTS ability_generation_records;
        DROP TABLE IF EXISTS abilities;
        CREATE TABLE IF NOT EXISTS abilities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            number INTEGER,
            name_zh TEXT NOT NULL,
            name_ja TEXT,
            name_en TEXT,
            description TEXT,
            effect_detail TEXT,
            introduced_generation INTEGER,
            source_url TEXT,
            source_title TEXT,
            source_fetched_at TEXT,
            UNIQUE (number, name_zh)
        );
        CREATE TABLE IF NOT EXISTS ability_generation_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ability_id INTEGER NOT NULL REFERENCES abilities(id) ON DELETE CASCADE,
            generation INTEGER NOT NULL,
            game_version_code TEXT,
            description TEXT,
            notes TEXT,
            version_exclusive INTEGER NOT NULL DEFAULT 0,
            UNIQUE (ability_id, generation)
        );
        CREATE INDEX IF NOT EXISTS idx_abilities_name ON abilities(name_zh);
        CREATE INDEX IF NOT EXISTS idx_abilities_number ON abilities(number);
    """)
    return count


def clear_items(conn: sqlite3.Connection) -> int:
    """清除所有道具数据（含 item_generation_records）— DROP + CREATE 重建。"""
    count = _safe_count(conn, "items")
    conn.executescript("""
        DROP TABLE IF EXISTS item_generation_records;
        DROP TABLE IF EXISTS items;
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_zh TEXT NOT NULL,
            name_ja TEXT,
            name_en TEXT,
            category TEXT,
            effect_summary TEXT,
            effect_detail TEXT,
            introduced_generation INTEGER,
            image_url TEXT,
            source_url TEXT,
            source_title TEXT,
            source_fetched_at TEXT
        );
        CREATE TABLE IF NOT EXISTS item_generation_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            generation INTEGER NOT NULL,
            game_version_code TEXT,
            description TEXT,
            notes TEXT,
            version_exclusive INTEGER NOT NULL DEFAULT 0,
            UNIQUE (item_id, generation)
        );
        CREATE INDEX IF NOT EXISTS idx_items_name_zh ON items(name_zh);
        CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
    """)
    return count


def clear_pokemon(conn: sqlite3.Connection) -> int:
    """清除所有宝可梦数据（含所有关联子表）— DROP + CREATE 重建。"""
    count = _safe_count(conn, "pokemon")
    conn.executescript("""
        DROP TABLE IF EXISTS pokemon_moves;
        DROP TABLE IF EXISTS evolution_chains;
        DROP TABLE IF EXISTS pokemon_form_images;
        DROP TABLE IF EXISTS pokemon_form_abilities;
        DROP TABLE IF EXISTS pokemon_form_types;
        DROP TABLE IF EXISTS pokemon_form_stats;
        DROP TABLE IF EXISTS pokemon_forms;
        DROP TABLE IF EXISTS pokemon;
        CREATE TABLE IF NOT EXISTS pokemon (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dex_number INTEGER NOT NULL,
            name_zh TEXT NOT NULL,
            name_ja TEXT,
            name_en TEXT,
            category TEXT,
            height_m REAL,
            weight_kg REAL,
            introduced_generation INTEGER,
            source_url TEXT,
            source_title TEXT,
            source_fetched_at TEXT
        );
        CREATE TABLE IF NOT EXISTS pokemon_forms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
            form_type TEXT NOT NULL,
            form_category TEXT NOT NULL DEFAULT 'default',
            name_zh TEXT NOT NULL,
            display_name_zh TEXT,
            name_en TEXT,
            is_default INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            required_item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
            UNIQUE (pokemon_id, form_type)
        );
        CREATE TABLE IF NOT EXISTS pokemon_form_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            form_id INTEGER NOT NULL REFERENCES pokemon_forms(id) ON DELETE CASCADE,
            generation_start INTEGER,
            generation_end INTEGER,
            hp INTEGER NOT NULL,
            atk INTEGER NOT NULL,
            def INTEGER NOT NULL,
            spa INTEGER NOT NULL,
            spd INTEGER NOT NULL,
            spe INTEGER NOT NULL,
            UNIQUE (form_id, generation_start)
        );
        CREATE TABLE IF NOT EXISTS pokemon_form_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            form_id INTEGER NOT NULL REFERENCES pokemon_forms(id) ON DELETE CASCADE,
            type_name TEXT NOT NULL,
            slot INTEGER NOT NULL,
            generation_start INTEGER,
            generation_end INTEGER,
            UNIQUE (form_id, slot, generation_start)
        );
        CREATE TABLE IF NOT EXISTS pokemon_form_abilities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            form_id INTEGER NOT NULL REFERENCES pokemon_forms(id) ON DELETE CASCADE,
            ability_id INTEGER REFERENCES abilities(id),
            ability_name_zh TEXT NOT NULL,
            slot INTEGER NOT NULL,
            is_hidden INTEGER NOT NULL DEFAULT 0,
            generation_start INTEGER,
            generation_end INTEGER,
            UNIQUE (form_id, slot, generation_start)
        );
        CREATE TABLE IF NOT EXISTS pokemon_form_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            form_id INTEGER NOT NULL REFERENCES pokemon_forms(id) ON DELETE CASCADE,
            image_kind TEXT NOT NULL,
            url TEXT NOT NULL,
            alt TEXT,
            UNIQUE (form_id, image_kind)
        );
        CREATE TABLE IF NOT EXISTS evolution_chains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chain_id INTEGER NOT NULL,
            from_pokemon_id INTEGER REFERENCES pokemon(id) ON DELETE CASCADE,
            to_pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
            from_form_id INTEGER REFERENCES pokemon_forms(id) ON DELETE SET NULL,
            to_form_id INTEGER REFERENCES pokemon_forms(id) ON DELETE SET NULL,
            stage INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            evolution_method TEXT,
            evolution_condition TEXT,
            evolution_item TEXT,
            evolution_level INTEGER,
            notes TEXT
        );
        CREATE TABLE IF NOT EXISTS pokemon_moves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
            form_id INTEGER NOT NULL REFERENCES pokemon_forms(id) ON DELETE CASCADE,
            move_id INTEGER REFERENCES moves(id),
            move_name_zh TEXT NOT NULL,
            generation INTEGER NOT NULL,
            game_version_code TEXT,
            learn_method TEXT NOT NULL,
            level INTEGER,
            tm_number TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            notes TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_pokemon_dex ON pokemon(dex_number);
        CREATE INDEX IF NOT EXISTS idx_pokemon_name ON pokemon(name_zh);
        CREATE INDEX IF NOT EXISTS idx_pokemon_introduced_generation ON pokemon(introduced_generation);
        CREATE INDEX IF NOT EXISTS idx_forms_pokemon ON pokemon_forms(pokemon_id);
        CREATE INDEX IF NOT EXISTS idx_forms_default ON pokemon_forms(pokemon_id, is_default);
        CREATE INDEX IF NOT EXISTS idx_form_types_form ON pokemon_form_types(form_id);
        CREATE INDEX IF NOT EXISTS idx_form_types_current ON pokemon_form_types(form_id, generation_end, slot);
        CREATE INDEX IF NOT EXISTS idx_form_abilities_form ON pokemon_form_abilities(form_id);
        CREATE INDEX IF NOT EXISTS idx_form_abilities_ability ON pokemon_form_abilities(ability_id, form_id);
        CREATE INDEX IF NOT EXISTS idx_form_stats_form ON pokemon_form_stats(form_id);
        CREATE INDEX IF NOT EXISTS idx_form_images_form ON pokemon_form_images(form_id);
        CREATE INDEX IF NOT EXISTS idx_form_images_kind ON pokemon_form_images(form_id, image_kind);
        CREATE INDEX IF NOT EXISTS idx_evo_chain ON evolution_chains(chain_id);
        CREATE INDEX IF NOT EXISTS idx_evo_to ON evolution_chains(to_pokemon_id);
        CREATE INDEX IF NOT EXISTS idx_evo_from ON evolution_chains(from_pokemon_id);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_pokemon_moves ON pokemon_moves(
            form_id, move_name_zh, generation,
            COALESCE(game_version_code, ''),
            learn_method, COALESCE(level, -1), COALESCE(tm_number, '')
        );
        CREATE INDEX IF NOT EXISTS idx_pokemon_moves_lookup ON pokemon_moves(pokemon_id, generation, form_id, game_version_code, learn_method, sort_order);
        CREATE INDEX IF NOT EXISTS idx_pokemon_moves_form_gen ON pokemon_moves(form_id, generation);
        CREATE INDEX IF NOT EXISTS idx_pokemon_moves_move ON pokemon_moves(move_id);
    """)
    return count


def clear_champions(conn: sqlite3.Connection) -> int:
    """清除 Champions 赛季、赛制、可用宝可梦与道具数据 — DROP + CREATE 重建。"""
    counts = [
        _safe_count(conn, "champions_seasons"),
        _safe_count(conn, "champions_regulations"),
        _safe_count(conn, "champions_regulation_pokemon"),
        _safe_count(conn, "champions_regulation_items"),
    ]
    conn.executescript("""
        DROP TABLE IF EXISTS champions_regulation_items;
        DROP TABLE IF EXISTS champions_regulation_pokemon;
        DROP TABLE IF EXISTS champions_seasons;
        DROP TABLE IF EXISTS champions_regulations;
        DROP TABLE IF EXISTS champions_items;
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
    """)
    return int(sum(counts))


def clear_field_effects(conn: sqlite3.Connection) -> int:
    """清除所有场地效果数据（含 modifiers 和 generation_records）— DROP + CREATE 重建。"""
    count = _safe_count(conn, "field_effects")
    conn.executescript("""
        DROP TABLE IF EXISTS field_effect_generation_records;
        DROP TABLE IF EXISTS field_effect_modifiers;
        DROP TABLE IF EXISTS field_effects;
        CREATE TABLE IF NOT EXISTS field_effects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind INTEGER NOT NULL,
            key TEXT NOT NULL,
            name_zh TEXT NOT NULL,
            name_en TEXT,
            name_ja TEXT,
            description TEXT,
            introduced_generation INTEGER,
            max_turns INTEGER,
            max_layers INTEGER,
            source_url TEXT,
            source_title TEXT,
            source_fetched_at TEXT,
            UNIQUE (kind, key)
        );
        CREATE TABLE IF NOT EXISTS field_effect_modifiers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            field_effect_id INTEGER NOT NULL REFERENCES field_effects(id) ON DELETE CASCADE,
            effect_type INTEGER NOT NULL,
            trigger INTEGER NOT NULL DEFAULT 1,
            target INTEGER NOT NULL DEFAULT 7,
            modifier_type INTEGER NOT NULL,
            modifier_value REAL,
            affected_stat INTEGER,
            affected_type INTEGER,
            affected_move_flag INTEGER,
            affected_move_category INTEGER,
            condition_key TEXT,
            params TEXT,
            generation_start INTEGER NOT NULL DEFAULT 1,
            generation_end INTEGER,
            priority INTEGER NOT NULL DEFAULT 0,
            note TEXT
        );
        CREATE TABLE IF NOT EXISTS field_effect_generation_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            field_effect_id INTEGER NOT NULL REFERENCES field_effects(id) ON DELETE CASCADE,
            generation INTEGER NOT NULL,
            game_version_code TEXT,
            description TEXT,
            notes TEXT,
            version_exclusive INTEGER NOT NULL DEFAULT 0,
            UNIQUE (field_effect_id, generation, COALESCE(game_version_code, ''))
        );
        CREATE INDEX IF NOT EXISTS idx_fe_kind ON field_effects(kind);
        CREATE INDEX IF NOT EXISTS idx_fe_key ON field_effects(key);
        CREATE INDEX IF NOT EXISTS idx_fe_name_zh ON field_effects(name_zh);
        CREATE INDEX IF NOT EXISTS idx_fem_field_effect ON field_effect_modifiers(field_effect_id);
        CREATE INDEX IF NOT EXISTS idx_fem_effect_type ON field_effect_modifiers(effect_type);
        CREATE INDEX IF NOT EXISTS idx_fegr_field_effect ON field_effect_generation_records(field_effect_id);
    """)
    return count


def clear_all(conn: sqlite3.Connection) -> dict[str, int]:
    """清除所有数据（DROP + CREATE 重建全部表）。返回各表原有记录数。"""
    return {
        "field_effects": clear_field_effects(conn),
        "champions": clear_champions(conn),
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


# ---------------------------------------------------------------------------
# Pokemon upsert (form-centric architecture)
# ---------------------------------------------------------------------------

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


def _lookup_ability_id(conn: sqlite3.Connection, name: str) -> int | None:
    """查找特性 ID（不自动创建）。"""
    if not name:
        return None
    row = conn.execute("SELECT id FROM abilities WHERE name_zh = ?", (name,)).fetchone()
    return int(row["id"]) if row else None


# ---------------------------------------------------------------------------
# Evolution chain upsert
# ---------------------------------------------------------------------------

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


def _lookup_pokemon_by_name(conn: sqlite3.Connection, name: str) -> int | None:
    """通过中文名查找 pokemon_id。"""
    if not name:
        return None
    row = conn.execute(
        "SELECT id FROM pokemon WHERE name_zh = ? LIMIT 1",
        (name,),
    ).fetchone()
    return int(row["id"]) if row else None


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


# ---------------------------------------------------------------------------
# Learnset upsert (pokemon_moves table)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Champions upsert
# ---------------------------------------------------------------------------

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


def _lookup_item_id(conn: sqlite3.Connection, name_zh: str) -> int | None:
    row = conn.execute(
        "SELECT id FROM items WHERE name_zh = ? LIMIT 1",
        (name_zh,),
    ).fetchone()
    return int(row["id"]) if row else None


def _table_has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    try:
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    except sqlite3.DatabaseError:
        return False
    return any(row["name"] == column for row in rows)


# ---------------------------------------------------------------------------
# Field Effects (天气/场地/异常状态等)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _source_attr(source, attr: str):
    if not source:
        return None
    if attr == "fetched_at":
        return getattr(source, "fetched_at", None)
    return getattr(source, attr, None)
