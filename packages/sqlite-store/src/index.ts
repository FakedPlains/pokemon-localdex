import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { listItems, listPokemonEntries, type ItemEntry, type PokemonEntry } from "../../data-model/src/index.ts";

const ROOT = resolve(import.meta.dirname, "../../../");

function resolveDatabasePath() {
  return process.env.LOCALDEX_DB_PATH
    ? resolve(process.env.LOCALDEX_DB_PATH)
    : resolve(ROOT, "data/sqlite/localdex.sqlite");
}

function ensureDbDir() {
  mkdirSync(dirname(resolveDatabasePath()), { recursive: true });
}

function serialize(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }
  return JSON.parse(value) as T;
}

function mapPokemonRow(row: Record<string, unknown>): PokemonEntry {
  return {
    id: String(row.id),
    dexNumber: Number(row.dex_number),
    slug: String(row.slug),
    nameZh: String(row.name_zh),
    nameJa: row.name_ja ? String(row.name_ja) : undefined,
    nameEn: row.name_en ? String(row.name_en) : undefined,
    generations: parseJson<number[]>(row.generations_json as string | null) ?? [],
    primaryType: row.primary_type ? String(row.primary_type) : undefined,
    secondaryType: row.secondary_type ? String(row.secondary_type) : undefined,
    category: row.category ? String(row.category) : undefined,
    abilities: parseJson<string[]>(row.abilities_json as string | null),
    hiddenAbility: row.hidden_ability ? String(row.hidden_ability) : undefined,
    heightM: row.height_m === null ? undefined : Number(row.height_m),
    weightKg: row.weight_kg === null ? undefined : Number(row.weight_kg),
    color: row.color ? String(row.color) : undefined,
    catchRate: row.catch_rate === null ? undefined : Number(row.catch_rate),
    genderRatio: parseJson<PokemonEntry["genderRatio"]>(row.gender_ratio_json as string | null),
    baseStats: parseJson<PokemonEntry["baseStats"]>(row.base_stats_json as string | null),
    images: parseJson<PokemonEntry["images"]>(row.images_json as string | null),
    forms: parseJson<PokemonEntry["forms"]>(row.forms_json as string | null),
    generationAvailability: parseJson<PokemonEntry["generationAvailability"]>(row.generation_availability_json as string | null),
    generationRecords: parseJson<PokemonEntry["generationRecords"]>(row.generation_records_json as string | null),
    abilityIds: parseJson<PokemonEntry["abilityIds"]>(row.ability_ids_json as string | null),
    hiddenAbilityId: row.hidden_ability_id ? String(row.hidden_ability_id) : undefined,
    moveIds: parseJson<PokemonEntry["moveIds"]>(row.move_ids_json as string | null),
    evolutionChain: parseJson<PokemonEntry["evolutionChain"]>(row.evolution_chain_json as string | null),
    source: parseJson<PokemonEntry["source"]>(row.source_json as string | null),
    parseNote: row.parse_note ? String(row.parse_note) : undefined
  };
}

function mapItemRow(row: Record<string, unknown>): ItemEntry {
  return {
    id: String(row.id),
    slug: String(row.slug),
    nameZh: String(row.name_zh),
    nameJa: row.name_ja ? String(row.name_ja) : undefined,
    nameEn: row.name_en ? String(row.name_en) : undefined,
    category: row.category ? String(row.category) : undefined,
    effectSummary: row.effect_summary ? String(row.effect_summary) : undefined,
    image: parseJson<ItemEntry["image"]>(row.image_json as string | null),
    source: parseJson<ItemEntry["source"]>(row.source_json as string | null)
  };
}

export function getDatabasePath() {
  return resolveDatabasePath();
}

export function hasDatabaseFile() {
  return existsSync(resolveDatabasePath());
}

export function openDatabase() {
  ensureDbDir();
  return new DatabaseSync(resolveDatabasePath(), {
    timeout: 3000
  });
}

export function ensureSchema() {
  const db = openDatabase();

  db.exec(`
    DROP TABLE IF EXISTS pokemon;
    DROP TABLE IF EXISTS items;

    CREATE TABLE IF NOT EXISTS pokemon (
      id TEXT PRIMARY KEY,
      dex_number INTEGER NOT NULL,
      slug TEXT NOT NULL,
      name_zh TEXT NOT NULL,
      name_ja TEXT,
      name_en TEXT,
      generations_json TEXT NOT NULL,
      primary_type TEXT,
      secondary_type TEXT,
      category TEXT,
      abilities_json TEXT,
      hidden_ability TEXT,
      height_m REAL,
      weight_kg REAL,
      color TEXT,
      catch_rate INTEGER,
      gender_ratio_json TEXT,
      base_stats_json TEXT,
      images_json TEXT,
      forms_json TEXT,
      generation_availability_json TEXT,
      generation_records_json TEXT,
      ability_ids_json TEXT,
      hidden_ability_id TEXT,
      move_ids_json TEXT,
      evolution_chain_json TEXT,
      source_json TEXT,
      parse_note TEXT
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      name_zh TEXT NOT NULL,
      name_ja TEXT,
      name_en TEXT,
      category TEXT,
      effect_summary TEXT,
      image_json TEXT,
      source_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_pokemon_dex_number ON pokemon(dex_number);
    CREATE INDEX IF NOT EXISTS idx_pokemon_name_zh ON pokemon(name_zh);
    CREATE INDEX IF NOT EXISTS idx_pokemon_primary_type ON pokemon(primary_type);
    CREATE INDEX IF NOT EXISTS idx_items_name_zh ON items(name_zh);
    CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
  `);

  db.close();
}

export function importNormalizedDataToSqlite(input?: {
  pokemonEntries?: PokemonEntry[];
  items?: ItemEntry[];
}) {
  const pokemonEntries = input?.pokemonEntries ?? listPokemonEntries();
  const items = input?.items ?? listItems();

  ensureSchema();
  const db = openDatabase();

  db.exec("BEGIN");

  try {
    db.exec("DELETE FROM pokemon");
    db.exec("DELETE FROM items");

    const insertPokemon = db.prepare(`
      INSERT INTO pokemon (
        id, dex_number, slug, name_zh, name_ja, name_en, generations_json,
        primary_type, secondary_type, category, abilities_json, hidden_ability,
        height_m, weight_kg, color, catch_rate, gender_ratio_json, base_stats_json,
        images_json, forms_json, generation_availability_json, generation_records_json,
        ability_ids_json, hidden_ability_id, move_ids_json, evolution_chain_json, source_json, parse_note
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    for (const entry of pokemonEntries) {
      insertPokemon.run(
        entry.id,
        entry.dexNumber,
        entry.slug,
        entry.nameZh,
        entry.nameJa ?? null,
        entry.nameEn ?? null,
        JSON.stringify(entry.generations),
        entry.primaryType ?? null,
        entry.secondaryType ?? null,
        entry.category ?? null,
        serialize(entry.abilities),
        entry.hiddenAbility ?? null,
        entry.heightM ?? null,
        entry.weightKg ?? null,
        entry.color ?? null,
        entry.catchRate ?? null,
        serialize(entry.genderRatio),
        serialize(entry.baseStats),
        serialize(entry.images),
        serialize(entry.forms),
        serialize(entry.generationAvailability),
        serialize(entry.generationRecords),
        serialize(entry.abilityIds),
        entry.hiddenAbilityId ?? null,
        serialize(entry.moveIds),
        serialize(entry.evolutionChain),
        serialize(entry.source),
        entry.parseNote ?? null
      );
    }

    const insertItem = db.prepare(`
      INSERT INTO items (
        id, slug, name_zh, name_ja, name_en, category, effect_summary, image_json, source_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      insertItem.run(
        item.id,
        item.slug,
        item.nameZh,
        item.nameJa ?? null,
        item.nameEn ?? null,
        item.category ?? null,
        item.effectSummary ?? null,
        serialize(item.image),
        serialize(item.source)
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }

  db.close();

  return {
    pokemonCount: pokemonEntries.length,
    itemCount: items.length,
    databasePath: resolveDatabasePath()
  };
}

export function hasSqliteData() {
  if (!hasDatabaseFile()) {
    return false;
  }

  const db = openDatabase();
  const pokemonCount = db.prepare("SELECT COUNT(*) AS count FROM pokemon").get() as { count: number };
  const itemCount = db.prepare("SELECT COUNT(*) AS count FROM items").get() as { count: number };
  db.close();
  return pokemonCount.count > 0 || itemCount.count > 0;
}

export function listPokemonFromSqlite(filters?: {
  query?: string;
  type?: string;
  generation?: number;
}) {
  const db = openDatabase();
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters?.query) {
    conditions.push("(name_zh LIKE ? OR name_ja LIKE ? OR name_en LIKE ? OR slug LIKE ? OR id LIKE ?)");
    const value = `%${filters.query}%`;
    params.push(value, value, value, value, value);
  }

  if (filters?.type) {
    conditions.push("(primary_type = ? OR secondary_type = ? OR primary_type LIKE ? OR secondary_type LIKE ? OR forms_json LIKE ? OR generation_records_json LIKE ?)");
    const value = `%${filters.type}%`;
    params.push(filters.type, filters.type, value, value, value, value);
  }

  if (filters?.generation) {
    conditions.push("(generations_json LIKE ? OR generation_availability_json LIKE ?)");
    const token = `%${filters.generation}%`;
    params.push(token, token);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT *
    FROM pokemon
    ${where}
    ORDER BY dex_number ASC
  `).all(...params) as Record<string, unknown>[];
  db.close();
  return rows.map(mapPokemonRow);
}

export function getPokemonFromSqlite(idOrSlug: string) {
  const db = openDatabase();
  const row = db.prepare(`
    SELECT *
    FROM pokemon
    WHERE id = ? OR slug = ?
    LIMIT 1
  `).get(idOrSlug, idOrSlug) as Record<string, unknown> | undefined;
  db.close();
  return row ? mapPokemonRow(row) : undefined;
}

export function listItemsFromSqlite() {
  const db = openDatabase();
  const rows = db.prepare(`
    SELECT *
    FROM items
    ORDER BY category ASC, name_zh ASC
  `).all() as Record<string, unknown>[];
  db.close();
  return rows.map(mapItemRow);
}

export function getItemFromSqlite(idOrSlug: string) {
  const db = openDatabase();
  const row = db.prepare(`
    SELECT *
    FROM items
    WHERE id = ? OR slug = ?
    LIMIT 1
  `).get(idOrSlug, idOrSlug) as Record<string, unknown> | undefined;
  db.close();
  return row ? mapItemRow(row) : undefined;
}
