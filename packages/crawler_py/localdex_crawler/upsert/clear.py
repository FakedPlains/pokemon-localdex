from __future__ import annotations

import sqlite3

from .base import _safe_count


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
            to_pokemon_id INTEGER REFERENCES pokemon(id) ON DELETE CASCADE,
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
