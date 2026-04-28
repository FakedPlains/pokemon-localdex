from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sqlite3
from urllib.parse import quote

from .fetcher import RawPage
from .html_tools import ParsedPokemonAbilities
from .utils import ImageAsset, normalize_type_name, slugify


@dataclass(frozen=True)
class PokemonRow:
    id: int
    legacy_id: str
    dex_number: int
    name_zh: str
    source_url: str | None


@dataclass(frozen=True)
class UpsertSummary:
    pokemon: PokemonRow
    abilities: list[str]
    hidden_ability: str | None
    generation_count: int
    unknown_abilities: list[str]


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


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
        clauses.append(f"(name_zh IN ({placeholders}) OR legacy_id IN ({placeholders}))")
        params.extend(names)
        params.extend(names)

    sql = "SELECT id, legacy_id, dex_number, name_zh, source_url FROM pokemon"
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
            legacy_id=str(row["legacy_id"]),
            dex_number=int(row["dex_number"]),
            name_zh=str(row["name_zh"]),
            source_url=row["source_url"],
        )
        for row in rows
    ]


def pokemon_source_url(row: PokemonRow) -> str:
    return row.source_url or f"https://wiki.52poke.com/wiki/{quote(row.name_zh)}"


def cache_key(row: PokemonRow) -> str:
    return row.legacy_id or f"pokemon-{row.dex_number:04d}"


def upsert_pokemon_abilities(
    conn: sqlite3.Connection,
    pokemon: PokemonRow,
    page: RawPage,
    parsed: ParsedPokemonAbilities,
) -> UpsertSummary:
    unknown: list[str] = []
    generation_records = build_generation_ability_records(
        generations=available_generations(conn, pokemon.id),
        abilities=parsed.abilities,
        hidden_ability=parsed.hidden_ability,
        changes=parsed.changes,
    )

    with conn:
        conn.execute(
            """
            UPDATE pokemon
            SET hidden_ability = ?, source_url = ?, source_title = ?, source_fetched_at = ?
            WHERE id = ?
            """,
            (parsed.hidden_ability, page.url, page.title, page.fetched_at, pokemon.id),
        )
        conn.execute("DELETE FROM pokemon_abilities WHERE pokemon_id = ?", (pokemon.id,))
        conn.execute("DELETE FROM pokemon_generation_abilities WHERE pokemon_id = ?", (pokemon.id,))

        for slot, ability in enumerate(parsed.abilities, start=1):
            ability_id = ensure_ability(conn, ability)
            if ability_id is None:
                unknown.append(ability)
            insert_ability_reference(conn, pokemon.id, ability_id, ability, slot, False)

        if parsed.hidden_ability:
            ability_id = ensure_ability(conn, parsed.hidden_ability)
            if ability_id is None:
                unknown.append(parsed.hidden_ability)
            insert_ability_reference(conn, pokemon.id, ability_id, parsed.hidden_ability, 99, True)

        for generation, record in generation_records.items():
            generation_id = ensure_generation_record(conn, pokemon.id, generation)
            for slot, ability in enumerate(record["abilities"], start=1):
                ability_id = ensure_ability(conn, ability)
                if ability_id is None:
                    unknown.append(ability)
                insert_generation_ability_reference(
                    conn, pokemon.id, generation_id, ability_id, ability, slot, False
                )
            hidden = record.get("hidden")
            if hidden:
                ability_id = ensure_ability(conn, hidden)
                if ability_id is None:
                    unknown.append(hidden)
                insert_generation_ability_reference(
                    conn, pokemon.id, generation_id, ability_id, hidden, 99, True
                )

    return UpsertSummary(
        pokemon=pokemon,
        abilities=parsed.abilities,
        hidden_ability=parsed.hidden_ability,
        generation_count=len(generation_records),
        unknown_abilities=sorted(set(unknown)),
    )


def available_generations(conn: sqlite3.Connection, pokemon_id: int) -> list[int]:
    rows = conn.execute(
        """
        SELECT DISTINCT g.number
        FROM pokemon_generation_records pgr
        JOIN generations g ON g.id = pgr.generation_id
        WHERE pgr.pokemon_id = ?
        UNION
        SELECT DISTINCT g.number
        FROM pokemon_generation_regions pgr
        JOIN generations g ON g.id = pgr.generation_id
        WHERE pgr.pokemon_id = ?
        ORDER BY number ASC
        """,
        (pokemon_id, pokemon_id),
    ).fetchall()
    generations = [int(row["number"]) for row in rows]
    return generations or list(range(1, 10))


def build_generation_ability_records(
    generations: list[int],
    abilities: list[str],
    hidden_ability: str | None,
    changes,
) -> dict[int, dict[str, object]]:
    records: dict[int, dict[str, object]] = {}
    for generation in sorted(set(generations)):
        if generation < 3:
            continue
        change = next(
            (
                item
                for item in changes
                if generation >= 3 and generation < item.before_generation
            ),
            None,
        )
        generation_abilities = [change.ability] if change else abilities
        generation_hidden = hidden_ability if generation >= 5 and not change else None
        if generation_abilities or generation_hidden:
            records[generation] = {
                "abilities": generation_abilities,
                "hidden": generation_hidden,
            }
    return records


def ensure_ability(conn: sqlite3.Connection, name: str) -> int | None:
    if not name:
        return None
    row = conn.execute(
        "SELECT id FROM abilities WHERE name_zh = ? OR legacy_id = ?",
        (name, f"ability-{slugify(name)}"),
    ).fetchone()
    if row:
        return int(row["id"])
    result = conn.execute(
        """
        INSERT INTO abilities (legacy_id, slug, name_zh)
        VALUES (?, ?, ?)
        ON CONFLICT(legacy_id) DO UPDATE SET name_zh = excluded.name_zh
        """,
        (f"ability-{slugify(name)}", slugify(name), name),
    )
    return int(result.lastrowid)


def ensure_type(conn: sqlite3.Connection, name: str | None) -> int | None:
    normalized = normalize_type_name(name)
    if not normalized:
        return None
    row = conn.execute("SELECT id FROM types WHERE name_zh = ?", (normalized,)).fetchone()
    if row:
        return int(row["id"])
    result = conn.execute(
        """
        INSERT INTO types (legacy_id, name_zh)
        VALUES (?, ?)
        ON CONFLICT(legacy_id) DO UPDATE SET name_zh = excluded.name_zh
        """,
        (f"type-{normalized}", normalized),
    )
    return int(result.lastrowid)


def ensure_generation(conn: sqlite3.Connection, generation: int) -> int:
    row = conn.execute("SELECT id FROM generations WHERE number = ?", (generation,)).fetchone()
    if row:
        return int(row["id"])
    result = conn.execute(
        "INSERT INTO generations (number, name_zh, name_en) VALUES (?, ?, ?)",
        (generation, f"第{generation}世代", f"Generation {generation}"),
    )
    return int(result.lastrowid)


def ensure_move(conn: sqlite3.Connection, name: str, payload: dict | None = None) -> int:
    legacy_id = (payload or {}).get("legacy_id") or f"move-{slugify(name)}"
    row = conn.execute("SELECT id FROM moves WHERE legacy_id = ? OR name_zh = ?", (legacy_id, name)).fetchone()
    if row:
        move_id = int(row["id"])
        if payload:
            conn.execute(
                """
                UPDATE moves
                SET slug = ?, name_zh = ?, name_ja = COALESCE(?, name_ja), name_en = COALESCE(?, name_en),
                    type_id = COALESCE(?, type_id), category = COALESCE(?, category), power = COALESCE(?, power),
                    accuracy = COALESCE(?, accuracy), pp = COALESCE(?, pp),
                    effect_summary = COALESCE(?, effect_summary),
                    source_url = COALESCE(?, source_url), source_title = COALESCE(?, source_title),
                    source_fetched_at = COALESCE(?, source_fetched_at)
                WHERE id = ?
                """,
                (
                    payload.get("slug") or slugify(name),
                    payload.get("name_zh") or name,
                    payload.get("name_ja"),
                    payload.get("name_en"),
                    ensure_type(conn, payload.get("type")),
                    payload.get("category"),
                    payload.get("power"),
                    payload.get("accuracy"),
                    payload.get("pp"),
                    payload.get("effect_summary"),
                    _source_attr(payload.get("source"), "url"),
                    _source_attr(payload.get("source"), "title"),
                    _source_attr(payload.get("source"), "fetched_at"),
                    move_id,
                ),
            )
        return move_id
    result = conn.execute(
        """
        INSERT INTO moves
          (legacy_id, slug, name_zh, name_ja, name_en, type_id, category, power, accuracy, pp,
           effect_summary, source_url, source_title, source_fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            legacy_id,
            (payload or {}).get("slug") or slugify(name),
            (payload or {}).get("name_zh") or name,
            (payload or {}).get("name_ja"),
            (payload or {}).get("name_en"),
            ensure_type(conn, (payload or {}).get("type")),
            (payload or {}).get("category"),
            (payload or {}).get("power"),
            (payload or {}).get("accuracy"),
            (payload or {}).get("pp"),
            (payload or {}).get("effect_summary"),
            _source_attr((payload or {}).get("source"), "url"),
            _source_attr((payload or {}).get("source"), "title"),
            _source_attr((payload or {}).get("source"), "fetched_at"),
        ),
    )
    return int(result.lastrowid)


def upsert_move_detail(conn: sqlite3.Connection, payload: dict) -> int:
    with conn:
        move_id = ensure_move(conn, str(payload["name_zh"]), payload)
        conn.execute("DELETE FROM move_generation_records WHERE move_id = ?", (move_id,))
        for record in payload.get("generations") or []:
            conn.execute(
                """
                INSERT INTO move_generation_records
                  (move_id, generation_id, type_id, category, power, accuracy, pp, effect_summary, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(move_id, generation_id) DO UPDATE SET
                  type_id = excluded.type_id,
                  category = excluded.category,
                  power = excluded.power,
                  accuracy = excluded.accuracy,
                  pp = excluded.pp,
                  effect_summary = excluded.effect_summary,
                  notes = excluded.notes
                """,
                (
                    move_id,
                    ensure_generation(conn, int(record["generation"])),
                    ensure_type(conn, record.get("type")),
                    record.get("category"),
                    record.get("power"),
                    record.get("accuracy"),
                    record.get("pp"),
                    record.get("effect_summary") or "",
                    record.get("notes"),
                ),
            )
        upsert_image(conn, "move", move_id, "primary", payload.get("image"))
    return move_id


def upsert_ability_detail(conn: sqlite3.Connection, payload: dict) -> int:
    legacy_id = payload.get("legacy_id") or f"ability-{slugify(payload['name_zh'])}"
    with conn:
        row = conn.execute("SELECT id FROM abilities WHERE legacy_id = ? OR name_zh = ?", (legacy_id, payload["name_zh"])).fetchone()
        if row:
            ability_id = int(row["id"])
            conn.execute(
                """
                UPDATE abilities
                SET slug = ?, name_zh = ?, name_ja = COALESCE(?, name_ja), name_en = COALESCE(?, name_en),
                    effect_summary = COALESCE(?, effect_summary),
                    source_url = COALESCE(?, source_url), source_title = COALESCE(?, source_title),
                    source_fetched_at = COALESCE(?, source_fetched_at)
                WHERE id = ?
                """,
                (
                    payload.get("slug") or slugify(payload["name_zh"]),
                    payload["name_zh"],
                    payload.get("name_ja"),
                    payload.get("name_en"),
                    payload.get("effect_summary"),
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
                  (legacy_id, slug, name_zh, name_ja, name_en, effect_summary, source_url, source_title, source_fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    legacy_id,
                    payload.get("slug") or slugify(payload["name_zh"]),
                    payload["name_zh"],
                    payload.get("name_ja"),
                    payload.get("name_en"),
                    payload.get("effect_summary"),
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
                INSERT INTO ability_generation_records (ability_id, generation_id, effect_summary, notes)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(ability_id, generation_id) DO UPDATE SET
                  effect_summary = excluded.effect_summary,
                  notes = excluded.notes
                """,
                (
                    ability_id,
                    ensure_generation(conn, int(record["generation"])),
                    record.get("effect_summary") or "",
                    record.get("notes"),
                ),
            )
    return ability_id


def upsert_item_detail(conn: sqlite3.Connection, payload: dict) -> int:
    legacy_id = payload.get("legacy_id") or f"item-{slugify(payload['name_zh'])}"
    with conn:
        row = conn.execute("SELECT id FROM items WHERE legacy_id = ? OR name_zh = ?", (legacy_id, payload["name_zh"])).fetchone()
        if row:
            item_id = int(row["id"])
            conn.execute(
                """
                UPDATE items
                SET slug = ?, name_zh = ?, name_ja = COALESCE(?, name_ja), name_en = COALESCE(?, name_en),
                    category = COALESCE(?, category), effect_summary = COALESCE(?, effect_summary),
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
                  (legacy_id, slug, name_zh, name_ja, name_en, category, effect_summary, source_url, source_title, source_fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    legacy_id,
                    payload.get("slug") or slugify(payload["name_zh"]),
                    payload["name_zh"],
                    payload.get("name_ja"),
                    payload.get("name_en"),
                    payload.get("category"),
                    payload.get("effect_summary"),
                    _source_attr(payload.get("source"), "url"),
                    _source_attr(payload.get("source"), "title"),
                    _source_attr(payload.get("source"), "fetched_at"),
                ),
            )
            item_id = int(result.lastrowid)
        upsert_image(conn, "item", item_id, "primary", payload.get("image"))
    return item_id


def upsert_pokemon_detail(conn: sqlite3.Connection, payload: dict) -> int:
    legacy_id = payload["legacy_id"]
    with conn:
        row = conn.execute("SELECT id FROM pokemon WHERE legacy_id = ? OR dex_number = ?", (legacy_id, payload["dex_number"])).fetchone()
        if row:
            pokemon_id = int(row["id"])
            conn.execute(
                """
                UPDATE pokemon
                SET slug = ?, name_zh = ?, name_ja = COALESCE(?, name_ja), name_en = COALESCE(?, name_en),
                    category = COALESCE(?, category), hidden_ability = COALESCE(?, hidden_ability),
                    height_m = COALESCE(?, height_m), weight_kg = COALESCE(?, weight_kg),
                    color = COALESCE(?, color), catch_rate = COALESCE(?, catch_rate),
                    male_ratio = COALESCE(?, male_ratio), female_ratio = COALESCE(?, female_ratio),
                    source_url = COALESCE(?, source_url), source_title = COALESCE(?, source_title),
                    source_fetched_at = COALESCE(?, source_fetched_at)
                WHERE id = ?
                """,
                (
                    payload["slug"],
                    payload["name_zh"],
                    payload.get("name_ja"),
                    payload.get("name_en"),
                    payload.get("category"),
                    payload.get("hidden_ability"),
                    payload.get("height_m"),
                    payload.get("weight_kg"),
                    payload.get("color"),
                    payload.get("catch_rate"),
                    (payload.get("gender_ratio") or {}).get("male"),
                    (payload.get("gender_ratio") or {}).get("female"),
                    _source_attr(payload.get("source"), "url"),
                    _source_attr(payload.get("source"), "title"),
                    _source_attr(payload.get("source"), "fetched_at"),
                    pokemon_id,
                ),
            )
        else:
            result = conn.execute(
                """
                INSERT INTO pokemon
                  (legacy_id, dex_number, slug, name_zh, name_ja, name_en, category, hidden_ability,
                   height_m, weight_kg, color, catch_rate, male_ratio, female_ratio, genderless,
                   source_url, source_title, source_fetched_at, parse_note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL)
                """,
                (
                    legacy_id,
                    payload["dex_number"],
                    payload["slug"],
                    payload["name_zh"],
                    payload.get("name_ja"),
                    payload.get("name_en"),
                    payload.get("category"),
                    payload.get("hidden_ability"),
                    payload.get("height_m"),
                    payload.get("weight_kg"),
                    payload.get("color"),
                    payload.get("catch_rate"),
                    (payload.get("gender_ratio") or {}).get("male"),
                    (payload.get("gender_ratio") or {}).get("female"),
                    _source_attr(payload.get("source"), "url"),
                    _source_attr(payload.get("source"), "title"),
                    _source_attr(payload.get("source"), "fetched_at"),
                ),
            )
            pokemon_id = int(result.lastrowid)
        upsert_pokemon_core_relations(conn, pokemon_id, payload)
    return pokemon_id


def upsert_pokemon_core_relations(conn: sqlite3.Connection, pokemon_id: int, payload: dict) -> None:
    conn.execute("DELETE FROM pokemon_types WHERE pokemon_id = ?", (pokemon_id,))
    for slot, type_name in enumerate([payload.get("primary_type"), payload.get("secondary_type")], start=1):
        type_id = ensure_type(conn, type_name)
        if type_id:
            conn.execute(
                "INSERT OR IGNORE INTO pokemon_types (pokemon_id, type_id, slot) VALUES (?, ?, ?)",
                (pokemon_id, type_id, slot),
            )

    stats = payload.get("base_stats")
    if stats:
        conn.execute(
            """
            INSERT INTO pokemon_base_stats (pokemon_id, hp, atk, def, spa, spd, spe)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(pokemon_id) DO UPDATE SET
              hp = excluded.hp, atk = excluded.atk, def = excluded.def,
              spa = excluded.spa, spd = excluded.spd, spe = excluded.spe
            """,
            (pokemon_id, stats["hp"], stats["atk"], stats["def"], stats["spa"], stats["spd"], stats["spe"]),
        )

    for kind, image in (payload.get("images") or {}).items():
        upsert_image(conn, "pokemon", pokemon_id, kind, image)

    upsert_pokemon_forms(conn, pokemon_id, payload)

    conn.execute("DELETE FROM pokemon_generation_regions WHERE pokemon_id = ?", (pokemon_id,))
    for record in payload.get("generation_availability") or []:
        generation_id = ensure_generation_record(conn, pokemon_id, int(record["generation"]))
        for region in record.get("regions") or []:
            conn.execute(
                """
                INSERT OR IGNORE INTO pokemon_generation_regions (pokemon_id, generation_id, region, dex_number)
                VALUES (?, ?, ?, ?)
                """,
                (pokemon_id, generation_id, region.get("region"), region.get("dex_number")),
            )

    parsed = ParsedPokemonAbilities(
        abilities=payload.get("abilities") or [],
        hidden_ability=payload.get("hidden_ability"),
        changes=payload.get("ability_changes") or [],
    )
    # Reuse the focused ability updater so slot and generation semantics stay in one place.
    row = conn.execute(
        "SELECT id, legacy_id, dex_number, name_zh, source_url FROM pokemon WHERE id = ?",
        (pokemon_id,),
    ).fetchone()
    if row:
        upsert_pokemon_abilities(
            conn,
            PokemonRow(int(row["id"]), str(row["legacy_id"]), int(row["dex_number"]), str(row["name_zh"]), row["source_url"]),
            payload["source"],
            parsed,
        )


def upsert_pokemon_forms(conn: sqlite3.Connection, pokemon_id: int, payload: dict) -> None:
    conn.execute("DELETE FROM pokemon_forms WHERE pokemon_id = ?", (pokemon_id,))
    form_images = payload.get("form_images") or {}
    for sort_order, form in enumerate(payload.get("forms") or [], start=1):
        result = conn.execute(
            """
            INSERT INTO pokemon_forms
              (legacy_id, pokemon_id, name_zh, introduced_generation, is_mega, notes, sort_order)
            VALUES (?, ?, ?, NULL, ?, NULL, ?)
            """,
            (
                form.get("legacy_id") or f"{payload['slug']}-{slugify(form['name_zh'])}",
                pokemon_id,
                form["name_zh"],
                1 if "超级" in form["name_zh"] else 0,
                sort_order,
            ),
        )
        form_id = int(result.lastrowid)
        for kind, image in (form_images.get(form["name_zh"]) or {}).items():
            upsert_image(conn, "pokemon", pokemon_id, kind, image, form_id=form_id)


def upsert_pokemon_learnset(conn: sqlite3.Connection, pokemon_id: int, generation: int, parsed: dict) -> int:
    with conn:
        generation_id = ensure_generation_record(conn, pokemon_id, generation)
        conn.execute(
            "DELETE FROM pokemon_moves WHERE pokemon_id = ? AND generation_id = ?",
            (pokemon_id, generation_id),
        )
        for move in parsed.get("moves") or []:
            move_id = ensure_move(conn, move["name_zh"], move)
            conn.execute(
                """
                INSERT INTO move_generation_records
                  (move_id, generation_id, type_id, category, power, accuracy, pp, effect_summary, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(move_id, generation_id) DO UPDATE SET
                  type_id = COALESCE(excluded.type_id, move_generation_records.type_id),
                  category = COALESCE(excluded.category, move_generation_records.category),
                  power = COALESCE(excluded.power, move_generation_records.power),
                  accuracy = COALESCE(excluded.accuracy, move_generation_records.accuracy),
                  pp = COALESCE(excluded.pp, move_generation_records.pp),
                  effect_summary = COALESCE(excluded.effect_summary, move_generation_records.effect_summary)
                """,
                (
                    move_id,
                    generation_id,
                    ensure_type(conn, move.get("type")),
                    move.get("category"),
                    move.get("power"),
                    move.get("accuracy"),
                    move.get("pp"),
                    move.get("effect_summary") or "来自 52Poké 宝可梦学招式表的基础参数记录。",
                    None,
                ),
            )
        for sort_order, record in enumerate(parsed.get("learnset") or [], start=1):
            move_id = ensure_move(conn, record["move_name_zh"])
            conn.execute(
                """
                INSERT INTO pokemon_moves
                  (pokemon_id, move_id, move_key, generation_id, game_version_code, move_name_zh, learn_method, level, notes, sort_order)
                VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
                """,
                (
                    pokemon_id,
                    move_id,
                    record["move_key"],
                    generation_id,
                    record["move_name_zh"],
                    record.get("learn_method"),
                    record.get("level"),
                    record.get("notes"),
                    sort_order,
                ),
            )
    return len(parsed.get("learnset") or [])


def upsert_image(
    conn: sqlite3.Connection,
    entity_type: str,
    entity_id: int,
    image_kind: str,
    image: ImageAsset | None,
    form_id: int | None = None,
) -> None:
    if not image or not image.url:
        return
    if form_id is None:
        conn.execute(
            """
            DELETE FROM image_assets
            WHERE entity_type = ? AND entity_id = ? AND form_id IS NULL AND image_kind = ?
            """,
            (entity_type, entity_id, image_kind),
        )
    else:
        conn.execute(
            """
            DELETE FROM image_assets
            WHERE entity_type = ? AND entity_id = ? AND form_id = ? AND image_kind = ?
            """,
            (entity_type, entity_id, form_id, image_kind),
        )
    conn.execute(
        """
        INSERT INTO image_assets (entity_type, entity_id, form_id, image_kind, url, alt, source_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (entity_type, entity_id, form_id, image_kind, image.url, image.alt, image.source_url),
    )


def _source_attr(source, attr: str):
    if not source:
        return None
    if attr == "fetched_at":
        return getattr(source, "fetched_at", None)
    return getattr(source, attr, None)


def ensure_generation_record(conn: sqlite3.Connection, pokemon_id: int, generation: int) -> int:
    generation_id = ensure_generation(conn, generation)
    conn.execute(
        """
        INSERT INTO pokemon_generation_records (pokemon_id, generation_id, label, notes)
        VALUES (?, ?, NULL, NULL)
        ON CONFLICT(pokemon_id, generation_id) DO NOTHING
        """,
        (pokemon_id, generation_id),
    )
    return generation_id


def insert_ability_reference(
    conn: sqlite3.Connection,
    pokemon_id: int,
    ability_id: int | None,
    ability_key: str,
    slot: int,
    hidden: bool,
) -> None:
    conn.execute(
        """
        INSERT INTO pokemon_abilities (pokemon_id, ability_id, ability_key, slot, is_hidden)
        VALUES (?, ?, ?, ?, ?)
        """,
        (pokemon_id, ability_id, ability_key, slot, 1 if hidden else 0),
    )


def insert_generation_ability_reference(
    conn: sqlite3.Connection,
    pokemon_id: int,
    generation_id: int,
    ability_id: int | None,
    ability_key: str,
    slot: int,
    hidden: bool,
) -> None:
    conn.execute(
        """
        INSERT INTO pokemon_generation_abilities
          (pokemon_id, generation_id, ability_id, ability_key, slot, is_hidden)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (pokemon_id, generation_id, ability_id, ability_key, slot, 1 if hidden else 0),
    )
