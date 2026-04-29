import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  listAbilities,
  listItems,
  listMoves,
  listPokemonEntries,
  type AbilityEntry,
  type ImageAsset,
  type ItemEntry,
  type MoveEntry,
  type PokemonEntry
} from "../../data-model/src/index.ts";

const ROOT = resolve(import.meta.dirname, "../../../");
const GENERATIONS = [
  [1, "第一世代", "Generation I"],
  [2, "第二世代", "Generation II"],
  [3, "第三世代", "Generation III"],
  [4, "第四世代", "Generation IV"],
  [5, "第五世代", "Generation V"],
  [6, "第六世代", "Generation VI"],
  [7, "第七世代", "Generation VII"],
  [8, "第八世代", "Generation VIII"],
  [9, "第九世代", "Generation IX"]
] as const;
const TYPE_NAMES = [
  "一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面",
  "飞行", "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精"
];
const TYPE_ALIASES: Record<string, string> = {
  電: "电",
  飛行: "飞行",
  蟲: "虫",
  龍: "龙",
  惡: "恶",
  鋼: "钢",
  格鬥: "格斗",
  幽靈: "幽灵"
};

function resolveDatabasePath() {
  return process.env.LOCALDEX_DB_PATH
    ? resolve(process.env.LOCALDEX_DB_PATH)
    : resolve(ROOT, "data/sqlite/localdex.sqlite");
}

function ensureDbDir() {
  mkdirSync(dirname(resolveDatabasePath()), { recursive: true });
}

function normalizeTypeName(type: string | undefined) {
  return type ? (TYPE_ALIASES[type] || type).trim() : "";
}

function typeLegacyId(type: string | undefined) {
  const normalized = normalizeTypeName(type);
  return normalized ? `type-${normalized}` : undefined;
}

function splitTypeNames(type: string | undefined) {
  const normalized = normalizeTypeName(type);
  if (!normalized) return [];
  if (TYPE_NAMES.includes(normalized)) return [normalized];

  const compact = normalized.replace(/\s+/g, "");
  const result: string[] = [];
  let rest = compact;
  const candidates = [...TYPE_NAMES, ...Object.keys(TYPE_ALIASES)].sort((left, right) => right.length - left.length);
  while (rest) {
    const match = candidates.find((candidate) => rest.startsWith(candidate));
    if (!match) break;
    result.push(normalizeTypeName(match));
    rest = rest.slice(match.length);
  }
  return rest ? [normalized] : [...new Set(result)];
}

function statBlockFromRow(row: Record<string, unknown>): PokemonEntry["baseStats"] {
  if (row.hp === null || row.hp === undefined) return undefined;
  return {
    hp: Number(row.hp),
    atk: Number(row.atk),
    def: Number(row.def),
    spa: Number(row.spa),
    spd: Number(row.spd),
    spe: Number(row.spe)
  };
}

function sourceFromRow(row: Record<string, unknown>) {
  return row.source_url || row.source_title || row.source_fetched_at
    ? {
        url: row.source_url ? String(row.source_url) : "",
        title: row.source_title ? String(row.source_title) : "",
        fetchedAt: row.source_fetched_at ? String(row.source_fetched_at) : ""
      }
    : undefined;
}

function toImageSet(rows: Record<string, unknown>[]) {
  const images: Record<string, ImageAsset> = {};
  for (const row of rows) {
    images[String(row.image_kind)] = {
      url: String(row.url),
      alt: row.alt ? String(row.alt) : undefined,
      sourceUrl: row.source_url ? String(row.source_url) : undefined
    };
  }
  return Object.keys(images).length > 0 ? images as PokemonEntry["images"] : undefined;
}

function imageRows(db: DatabaseSync, entityType: string, entityId: string | number, formId?: string | number | null) {
  const formClause = formId === undefined
    ? ""
    : formId === null
      ? "AND form_id IS NULL"
      : "AND form_id = ?";
  const params = formId === undefined ? [entityType, entityId] : formId === null ? [entityType, entityId] : [entityType, entityId, formId];
  return db.prepare(`
    SELECT image_kind, url, alt, source_url
    FROM image_assets
    WHERE entity_type = ? AND entity_id = ? ${formClause}
    ORDER BY image_kind ASC
  `).all(...params) as Record<string, unknown>[];
}

function mapPokemonBase(row: Record<string, unknown>): PokemonEntry {
  return {
    id: String(row.id),
    legacyId: row.legacy_id ? String(row.legacy_id) : undefined,
    dexNumber: Number(row.dex_number),
    slug: String(row.slug),
    nameZh: String(row.name_zh),
    nameJa: row.name_ja ? String(row.name_ja) : undefined,
    nameEn: row.name_en ? String(row.name_en) : undefined,
    generations: [],
    category: row.category ? String(row.category) : undefined,
    hiddenAbility: row.hidden_ability ? String(row.hidden_ability) : undefined,
    heightM: row.height_m === null ? undefined : Number(row.height_m),
    weightKg: row.weight_kg === null ? undefined : Number(row.weight_kg),
    color: row.color ? String(row.color) : undefined,
    catchRate: row.catch_rate === null ? undefined : Number(row.catch_rate),
    genderRatio: row.male_ratio || row.female_ratio || row.genderless
      ? {
          male: row.male_ratio ? String(row.male_ratio) : undefined,
          female: row.female_ratio ? String(row.female_ratio) : undefined,
          genderless: row.genderless ? Boolean(row.genderless) : undefined
        }
      : undefined,
    baseStats: statBlockFromRow(row),
    source: sourceFromRow(row),
    parseNote: row.parse_note ? String(row.parse_note) : undefined
  };
}

function getPokemonTypes(db: DatabaseSync, pokemonId: string) {
  const rows = db.prepare(`
    SELECT t.name_zh, pt.slot
    FROM pokemon_types pt
    JOIN types t ON t.id = pt.type_id
    WHERE pt.pokemon_id = ?
    ORDER BY pt.slot ASC
  `).all(pokemonId) as Record<string, unknown>[];
  return rows.map((row) => String(row.name_zh));
}

function getPokemonAbilityIds(db: DatabaseSync, pokemonId: string, generationId: number | null = null, hidden = false) {
  const table = generationId === null ? "pokemon_abilities" : "pokemon_generation_abilities";
  const generationJoin = generationId === null ? "" : `JOIN generations g ON g.id = ${table}.generation_id`;
  const generationFilter = generationId === null ? "1 = 1" : "g.number = ?";
  const rows = db.prepare(`
    SELECT COALESCE(CAST(ability_id AS TEXT), ability_key) AS ability_ref, slot
    FROM ${table}
    ${generationJoin}
    WHERE pokemon_id = ?
      AND ${generationFilter}
      AND is_hidden = ?
  ORDER BY slot ASC
  `).all(...(generationId === null ? [pokemonId, hidden ? 1 : 0] : [pokemonId, generationId, hidden ? 1 : 0])) as Record<string, unknown>[];
  return rows.map((row) => String(row.ability_ref));
}

function getPokemonAbilityNames(db: DatabaseSync, pokemonId: string, generationId: number | null = null, hidden = false) {
  const table = generationId === null ? "pokemon_abilities" : "pokemon_generation_abilities";
  const generationJoin = generationId === null ? "" : `JOIN generations g ON g.id = ${table}.generation_id`;
  const generationFilter = generationId === null ? "1 = 1" : "g.number = ?";
  const rows = db.prepare(`
    SELECT COALESCE(a.name_zh, ${table}.ability_key) AS ability_name, ${table}.slot
    FROM ${table}
    LEFT JOIN abilities a ON a.id = ${table}.ability_id
    ${generationJoin}
    WHERE ${table}.pokemon_id = ?
      AND ${generationFilter}
      AND ${table}.is_hidden = ?
  ORDER BY ${table}.slot ASC
  `).all(...(generationId === null ? [pokemonId, hidden ? 1 : 0] : [pokemonId, generationId, hidden ? 1 : 0])) as Record<string, unknown>[];
  return rows.map((row) => String(row.ability_name));
}

function getPokemonGenerationTypes(db: DatabaseSync, pokemonId: string, generation: number) {
  const rows = db.prepare(`
    SELECT t.name_zh, pgt.slot
    FROM pokemon_generation_types pgt
    JOIN generations g ON g.id = pgt.generation_id
    JOIN types t ON t.id = pgt.type_id
    WHERE pgt.pokemon_id = ? AND g.number = ?
    ORDER BY pgt.slot ASC
  `).all(pokemonId, generation) as Record<string, unknown>[];
  return rows.map((row) => String(row.name_zh));
}

function getPokemonGenerationAvailability(db: DatabaseSync, pokemonId: string): PokemonEntry["generationAvailability"] {
  const rows = db.prepare(`
    SELECT g.number AS generation_number, pgr.region, pgr.dex_number
    FROM pokemon_generation_regions pgr
    JOIN generations g ON g.id = pgr.generation_id
    WHERE pokemon_id = ?
    ORDER BY g.number ASC, pgr.region ASC
  `).all(pokemonId) as Record<string, unknown>[];
  const byGeneration = new Map<number, NonNullable<PokemonEntry["generationAvailability"]>[number]>();
  for (const row of rows) {
    const generation = Number(row.generation_number);
    const record = byGeneration.get(generation) ?? { generation, regions: [] };
    if (row.region) {
      record.regions?.push({
        region: String(row.region),
        dexNumber: row.dex_number ? String(row.dex_number) : undefined
      });
    }
    byGeneration.set(generation, record);
  }
  return [...byGeneration.values()];
}

function getPokemonForms(db: DatabaseSync, pokemonId: string): PokemonEntry["forms"] {
  const rows = db.prepare(`
    SELECT pf.*, g.number AS introduced_generation_number, fs.hp, fs.atk, fs.def, fs.spa, fs.spd, fs.spe
    FROM pokemon_forms pf
    LEFT JOIN pokemon_form_stats fs ON fs.form_id = pf.id
    LEFT JOIN generations g ON g.id = pf.introduced_generation
    WHERE pf.pokemon_id = ?
    ORDER BY pf.sort_order ASC, pf.name_zh ASC
  `).all(pokemonId) as Record<string, unknown>[];

  return rows.map((row) => {
    const formId = String(row.id);
    const types = db.prepare(`
      SELECT t.name_zh
      FROM pokemon_form_types pft
      JOIN types t ON t.id = pft.type_id
      WHERE pft.form_id = ?
      ORDER BY pft.slot ASC
    `).all(formId) as Record<string, unknown>[];
    return {
      id: formId,
      legacyId: row.legacy_id ? String(row.legacy_id) : undefined,
      nameZh: String(row.name_zh),
      introducedGeneration: row.introduced_generation_number === null ? undefined : Number(row.introduced_generation_number),
      isMega: Boolean(row.is_mega),
      notes: row.notes ? String(row.notes) : undefined,
      images: toImageSet(imageRows(db, "pokemon", pokemonId, formId)),
      baseStats: statBlockFromRow(row),
      primaryType: types[0] ? String(types[0].name_zh) : undefined,
      secondaryType: types[1] ? String(types[1].name_zh) : undefined,
      abilityIds: db.prepare(`
        SELECT COALESCE(a.name_zh, pfa.ability_key) AS ability_name
        FROM pokemon_form_abilities pfa
        LEFT JOIN abilities a ON a.id = pfa.ability_id
        WHERE pfa.form_id = ?
        ORDER BY pfa.slot ASC
      `).all(formId).map((abilityRow: any) => String(abilityRow.ability_name))
    };
  });
}

function getPokemonGenerationRecords(db: DatabaseSync, pokemonId: string): PokemonEntry["generationRecords"] {
  const rows = db.prepare(`
    SELECT pgr.*, g.number AS generation_number, pgs.hp, pgs.atk, pgs.def, pgs.spa, pgs.spd, pgs.spe
    FROM pokemon_generation_records pgr
    JOIN generations g ON g.id = pgr.generation_id
    LEFT JOIN pokemon_generation_stats pgs ON pgs.pokemon_id = pgr.pokemon_id AND pgs.generation_id = pgr.generation_id
    WHERE pgr.pokemon_id = ?
    ORDER BY g.number ASC
  `).all(pokemonId) as Record<string, unknown>[];

  return rows.map((row) => {
    const generation = Number(row.generation_number);
    const types = getPokemonGenerationTypes(db, pokemonId, generation);
    const learnset = db.prepare(`
      SELECT COALESCE(CAST(pm.move_id AS TEXT), pm.move_key) AS move_ref, pm.move_name_zh, pm.learn_method, pm.level, pm.notes
      FROM pokemon_moves pm
      JOIN generations g ON g.id = pm.generation_id
      WHERE pm.pokemon_id = ? AND g.number = ?
      ORDER BY sort_order ASC, move_name_zh ASC
    `).all(pokemonId, generation) as Record<string, unknown>[];
    const abilityNames = getPokemonAbilityNames(db, pokemonId, generation, false);
    const hiddenAbilityNames = getPokemonAbilityNames(db, pokemonId, generation, true);
    return {
      generation,
      label: row.label ? String(row.label) : undefined,
      primaryType: types[0],
      secondaryType: types[1],
      abilityIds: abilityNames,
      hiddenAbilityId: hiddenAbilityNames[0],
      baseStats: statBlockFromRow(row),
      moveIds: [...new Set(learnset.map((entry) => String(entry.move_ref)))],
      learnset: learnset.map((entry) => ({
        moveId: String(entry.move_ref),
        moveNameZh: entry.move_name_zh ? String(entry.move_name_zh) : undefined,
        learnMethod: entry.learn_method ? String(entry.learn_method) as NonNullable<NonNullable<PokemonEntry["generationRecords"]>[number]["learnset"]>[number]["learnMethod"] : undefined,
        level: entry.level === null ? undefined : Number(entry.level),
        notes: entry.notes ? String(entry.notes) : undefined
      })),
      notes: row.notes ? String(row.notes) : undefined
    };
  });
}

function getEvolutionChain(db: DatabaseSync, pokemonId: string): PokemonEntry["evolutionChain"] {
  const rows = db.prepare(`
    SELECT pem.stage_label, pem.sort_order, p.id, p.legacy_id, p.dex_number, p.slug, p.name_zh, p.name_en,
      img.url AS image_url, img.alt AS image_alt, img.source_url AS image_source_url
    FROM pokemon_evolution_members pem
    JOIN pokemon p ON p.id = pem.related_pokemon_id
    LEFT JOIN image_assets img ON img.entity_type = 'pokemon' AND img.entity_id = p.id AND img.form_id IS NULL AND img.image_kind = 'official'
    WHERE pem.pokemon_id = ?
    ORDER BY pem.sort_order ASC
  `).all(pokemonId) as Record<string, unknown>[];

  return rows.map((row) => {
    const types = getPokemonTypes(db, String(row.id));
    return {
      id: String(row.id),
      legacyId: row.legacy_id ? String(row.legacy_id) : undefined,
      dexNumber: Number(row.dex_number),
      slug: String(row.slug),
      nameZh: String(row.name_zh),
      nameEn: row.name_en ? String(row.name_en) : undefined,
      primaryType: types[0],
      secondaryType: types[1],
      stageLabel: row.stage_label ? String(row.stage_label) : undefined,
      image: row.image_url ? {
        url: String(row.image_url),
        alt: row.image_alt ? String(row.image_alt) : undefined,
        sourceUrl: row.image_source_url ? String(row.image_source_url) : undefined
      } : undefined
    };
  });
}

function hydratePokemonRow(db: DatabaseSync, row: Record<string, unknown>, detail = false): PokemonEntry {
  const pokemon = mapPokemonBase(row);
  const types = getPokemonTypes(db, pokemon.id);
  pokemon.primaryType = types[0];
  pokemon.secondaryType = types[1];
  pokemon.abilityIds = getPokemonAbilityIds(db, pokemon.id);
  pokemon.abilities = getPokemonAbilityNames(db, pokemon.id);
  pokemon.hiddenAbilityId = getPokemonAbilityIds(db, pokemon.id, null, true)[0];
  pokemon.hiddenAbility = getPokemonAbilityNames(db, pokemon.id, null, true)[0];
  pokemon.images = toImageSet(imageRows(db, "pokemon", pokemon.id, null));
  pokemon.generationAvailability = getPokemonGenerationAvailability(db, pokemon.id);
  pokemon.generations = pokemon.generationAvailability?.map((item) => item.generation) ?? [];
  pokemon.evolutionChain = getEvolutionChain(db, pokemon.id);

  if (detail) {
    pokemon.forms = getPokemonForms(db, pokemon.id);
    pokemon.generationRecords = getPokemonGenerationRecords(db, pokemon.id);
    pokemon.moveIds = [...new Set(pokemon.generationRecords?.flatMap((record) => record.moveIds || []) ?? [])];
  }

  return pokemon;
}

function mapItemRow(db: DatabaseSync, row: Record<string, unknown>): ItemEntry {
  const images = imageRows(db, "item", String(row.id), null);
  return {
    id: String(row.id),
    legacyId: row.legacy_id ? String(row.legacy_id) : undefined,
    slug: String(row.slug),
    nameZh: String(row.name_zh),
    nameJa: row.name_ja ? String(row.name_ja) : undefined,
    nameEn: row.name_en ? String(row.name_en) : undefined,
    category: row.category ? String(row.category) : undefined,
    effectSummary: row.effect_summary ? String(row.effect_summary) : undefined,
    image: images[0] ? {
      url: String(images[0].url),
      alt: images[0].alt ? String(images[0].alt) : undefined,
      sourceUrl: images[0].source_url ? String(images[0].source_url) : undefined
    } : undefined,
    source: sourceFromRow(row)
  };
}

function hydrateMoveRow(db: DatabaseSync, row: Record<string, unknown>): MoveEntry {
  const images = imageRows(db, "move", String(row.id), null);
  const generations = db.prepare(`
    SELECT mgr.*, g.number AS generation_number, t.name_zh AS type_name_zh
    FROM move_generation_records mgr
    JOIN generations g ON g.id = mgr.generation_id
    LEFT JOIN types t ON t.id = mgr.type_id
    WHERE mgr.move_id = ?
    ORDER BY g.number ASC
  `).all(String(row.id)) as Record<string, unknown>[];
  return {
    id: String(row.id),
    legacyId: row.legacy_id ? String(row.legacy_id) : undefined,
    slug: String(row.slug),
    nameZh: String(row.name_zh),
    nameJa: row.name_ja ? String(row.name_ja) : undefined,
    nameEn: row.name_en ? String(row.name_en) : undefined,
    type: row.type_name_zh ? String(row.type_name_zh) : undefined,
    category: row.category ? String(row.category) : undefined,
    power: row.power === null ? undefined : Number(row.power),
    accuracy: row.accuracy ? String(row.accuracy) : undefined,
    pp: row.pp === null ? undefined : Number(row.pp),
    effectSummary: row.effect_summary ? String(row.effect_summary) : undefined,
    image: images[0] ? {
      url: String(images[0].url),
      alt: images[0].alt ? String(images[0].alt) : undefined,
      sourceUrl: images[0].source_url ? String(images[0].source_url) : undefined
    } : undefined,
    generations: generations.map((generation) => ({
      generation: Number(generation.generation_number),
      type: generation.type_name_zh ? String(generation.type_name_zh) : undefined,
      category: generation.category ? String(generation.category) : undefined,
      power: generation.power === null ? undefined : Number(generation.power),
      accuracy: generation.accuracy ? String(generation.accuracy) : undefined,
      pp: generation.pp === null ? undefined : Number(generation.pp),
      effectSummary: generation.effect_summary ? String(generation.effect_summary) : "",
      notes: generation.notes ? String(generation.notes) : undefined
    })),
    source: sourceFromRow(row)
  };
}

function hydrateAbilityRow(db: DatabaseSync, row: Record<string, unknown>): AbilityEntry {
  const images = imageRows(db, "ability", String(row.id), null);
  const generations = db.prepare(`
    SELECT agr.*, g.number AS generation_number
    FROM ability_generation_records agr
    JOIN generations g ON g.id = agr.generation_id
    WHERE agr.ability_id = ?
    ORDER BY g.number ASC
  `).all(String(row.id)) as Record<string, unknown>[];
  return {
    id: String(row.id),
    number: row.number === null || row.number === undefined ? undefined : Number(row.number),
    nameZh: String(row.name_zh),
    nameJa: row.name_ja ? String(row.name_ja) : undefined,
    nameEn: row.name_en ? String(row.name_en) : undefined,
    description: row.description ? String(row.description) : undefined,
    effectDetail: row.effect_detail ? String(row.effect_detail) : undefined,
    introducedGeneration: row.introduced_generation_number === null || row.introduced_generation_number === undefined ? undefined : Number(row.introduced_generation_number),
    image: images[0] ? {
      url: String(images[0].url),
      alt: images[0].alt ? String(images[0].alt) : undefined,
      sourceUrl: images[0].source_url ? String(images[0].source_url) : undefined
    } : undefined,
    generations: generations.map((generation) => ({
      generation: Number(generation.generation_number),
      description: generation.description ? String(generation.description) : "",
      notes: generation.notes ? String(generation.notes) : undefined
    })),
    source: sourceFromRow(row)
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
  return new DatabaseSync(resolveDatabasePath(), { timeout: 3000 });
}

export function ensureSchema() {
  const db = openDatabase();
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS pokemon_learnsets;
    DROP TABLE IF EXISTS pokemon_moves;
    DROP TABLE IF EXISTS pokemon_evolution_members;
    DROP TABLE IF EXISTS pokemon_form_abilities;
    DROP TABLE IF EXISTS pokemon_form_types;
    DROP TABLE IF EXISTS pokemon_form_stats;
    DROP TABLE IF EXISTS pokemon_forms;
    DROP TABLE IF EXISTS pokemon_abilities;
    DROP TABLE IF EXISTS pokemon_types;
    DROP TABLE IF EXISTS pokemon_generation_regions;
    DROP TABLE IF EXISTS pokemon_generation_abilities;
    DROP TABLE IF EXISTS pokemon_generation_types;
    DROP TABLE IF EXISTS pokemon_generation_stats;
    DROP TABLE IF EXISTS pokemon_generation_records;
    DROP TABLE IF EXISTS pokemon_base_stats;
    DROP TABLE IF EXISTS move_generation_records;
    DROP TABLE IF EXISTS ability_generation_records;
    DROP TABLE IF EXISTS image_assets;
    DROP TABLE IF EXISTS items;
    DROP TABLE IF EXISTS moves;
    DROP TABLE IF EXISTS abilities;
    DROP TABLE IF EXISTS pokemon;
    DROP TABLE IF EXISTS types;
    DROP TABLE IF EXISTS generations;

    CREATE TABLE generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER NOT NULL UNIQUE,
      name_zh TEXT NOT NULL,
      name_en TEXT NOT NULL
    );
    CREATE TABLE types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_id TEXT NOT NULL UNIQUE,
      name_zh TEXT NOT NULL UNIQUE,
      name_en TEXT
    );
    CREATE TABLE pokemon (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_id TEXT NOT NULL UNIQUE,
      dex_number INTEGER NOT NULL,
      slug TEXT NOT NULL,
      name_zh TEXT NOT NULL,
      name_ja TEXT,
      name_en TEXT,
      category TEXT,
      hidden_ability TEXT,
      height_m REAL,
      weight_kg REAL,
      color TEXT,
      catch_rate INTEGER,
      male_ratio TEXT,
      female_ratio TEXT,
      genderless INTEGER,
      introduced_generation INTEGER,
      source_url TEXT,
      source_title TEXT,
      source_fetched_at TEXT,
      parse_note TEXT
    );
    CREATE TABLE pokemon_base_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pokemon_id INTEGER NOT NULL UNIQUE REFERENCES pokemon(id) ON DELETE CASCADE,
      hp INTEGER, atk INTEGER, def INTEGER, spa INTEGER, spd INTEGER, spe INTEGER
    );
    CREATE TABLE moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_id TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL,
      name_zh TEXT NOT NULL,
      name_ja TEXT,
      name_en TEXT,
      type_id INTEGER REFERENCES types(id),
      category TEXT,
      power INTEGER,
      accuracy TEXT,
      pp INTEGER,
      effect_summary TEXT,
      source_url TEXT,
      source_title TEXT,
      source_fetched_at TEXT
    );
    CREATE TABLE move_generation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      move_id INTEGER NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
      generation_id INTEGER NOT NULL REFERENCES generations(id),
      type_id INTEGER REFERENCES types(id),
      category TEXT,
      power INTEGER,
      accuracy TEXT,
      pp INTEGER,
      effect_summary TEXT,
      notes TEXT,
      UNIQUE (move_id, generation_id)
    );
    CREATE TABLE abilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER,
      name_zh TEXT NOT NULL UNIQUE,
      name_ja TEXT,
      name_en TEXT,
      description TEXT,
      effect_detail TEXT,
      introduced_generation INTEGER REFERENCES generations(id),
      source_url TEXT,
      source_title TEXT,
      source_fetched_at TEXT
    );
    CREATE TABLE ability_generation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ability_id INTEGER NOT NULL REFERENCES abilities(id) ON DELETE CASCADE,
      generation_id INTEGER NOT NULL REFERENCES generations(id),
      description TEXT,
      notes TEXT,
      UNIQUE (ability_id, generation_id)
    );
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_id TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL,
      name_zh TEXT NOT NULL,
      name_ja TEXT,
      name_en TEXT,
      category TEXT,
      effect_summary TEXT,
      source_url TEXT,
      source_title TEXT,
      source_fetched_at TEXT
    );
    CREATE TABLE image_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      form_id INTEGER,
      image_kind TEXT NOT NULL,
      url TEXT NOT NULL,
      alt TEXT,
      source_url TEXT,
      UNIQUE (entity_type, entity_id, form_id, image_kind)
    );
    CREATE TABLE pokemon_generation_regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      generation_id INTEGER NOT NULL REFERENCES generations(id),
      region TEXT,
      dex_number TEXT,
      UNIQUE (pokemon_id, generation_id, region)
    );
    CREATE TABLE pokemon_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      type_id INTEGER NOT NULL REFERENCES types(id),
      slot INTEGER NOT NULL,
      UNIQUE (pokemon_id, slot)
    );
    CREATE TABLE pokemon_abilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      ability_id INTEGER REFERENCES abilities(id),
      ability_key TEXT NOT NULL,
      slot INTEGER NOT NULL,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      UNIQUE (pokemon_id, ability_key, slot)
    );
    CREATE TABLE pokemon_generation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      generation_id INTEGER NOT NULL REFERENCES generations(id),
      label TEXT,
      notes TEXT,
      UNIQUE (pokemon_id, generation_id)
    );
    CREATE TABLE pokemon_generation_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      generation_id INTEGER NOT NULL REFERENCES generations(id),
      type_id INTEGER NOT NULL REFERENCES types(id),
      slot INTEGER NOT NULL,
      UNIQUE (pokemon_id, generation_id, slot)
    );
    CREATE TABLE pokemon_generation_abilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      generation_id INTEGER NOT NULL REFERENCES generations(id),
      ability_id INTEGER REFERENCES abilities(id),
      ability_key TEXT NOT NULL,
      slot INTEGER NOT NULL,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      UNIQUE (pokemon_id, generation_id, ability_key, slot)
    );
    CREATE TABLE pokemon_generation_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      generation_id INTEGER NOT NULL REFERENCES generations(id),
      hp INTEGER, atk INTEGER, def INTEGER, spa INTEGER, spd INTEGER, spe INTEGER,
      UNIQUE (pokemon_id, generation_id)
    );
    CREATE TABLE pokemon_moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      move_id INTEGER REFERENCES moves(id),
      move_key TEXT NOT NULL,
      generation_id INTEGER NOT NULL REFERENCES generations(id),
      game_version_code TEXT,
      move_name_zh TEXT,
      learn_method TEXT,
      level INTEGER,
      notes TEXT,
      sort_order INTEGER NOT NULL
    );
    CREATE TABLE pokemon_forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_id TEXT NOT NULL UNIQUE,
      pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      name_zh TEXT NOT NULL,
      introduced_generation INTEGER REFERENCES generations(id),
      is_mega INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      sort_order INTEGER NOT NULL
    );
    CREATE TABLE pokemon_form_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL UNIQUE REFERENCES pokemon_forms(id) ON DELETE CASCADE,
      hp INTEGER, atk INTEGER, def INTEGER, spa INTEGER, spd INTEGER, spe INTEGER
    );
    CREATE TABLE pokemon_form_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL REFERENCES pokemon_forms(id) ON DELETE CASCADE,
      type_id INTEGER NOT NULL REFERENCES types(id),
      slot INTEGER NOT NULL,
      UNIQUE (form_id, slot)
    );
    CREATE TABLE pokemon_form_abilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL REFERENCES pokemon_forms(id) ON DELETE CASCADE,
      ability_id INTEGER REFERENCES abilities(id),
      ability_key TEXT NOT NULL,
      slot INTEGER NOT NULL,
      UNIQUE (form_id, ability_key, slot)
    );
    CREATE TABLE pokemon_evolution_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      related_pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      stage_label TEXT,
      sort_order INTEGER NOT NULL,
      UNIQUE (pokemon_id, related_pokemon_id, sort_order)
    );

    CREATE INDEX idx_pokemon_dex_number ON pokemon(dex_number);
    CREATE INDEX idx_pokemon_legacy_id ON pokemon(legacy_id);
    CREATE INDEX idx_pokemon_name_zh ON pokemon(name_zh);
    CREATE INDEX idx_moves_legacy_id ON moves(legacy_id);
    CREATE INDEX idx_moves_name_zh ON moves(name_zh);
    CREATE INDEX idx_moves_type ON moves(type_id);
    CREATE INDEX idx_abilities_number ON abilities(number);
    CREATE INDEX idx_pokemon_regions_generation ON pokemon_generation_regions(generation_id);
    CREATE INDEX idx_pokemon_types_type ON pokemon_types(type_id);
    CREATE INDEX idx_pokemon_abilities_pokemon ON pokemon_abilities(pokemon_id);
    CREATE INDEX idx_pokemon_generation_records_generation ON pokemon_generation_records(generation_id);
    CREATE INDEX idx_pokemon_generation_types_pokemon_generation ON pokemon_generation_types(pokemon_id, generation_id);
    CREATE INDEX idx_pokemon_generation_abilities_pokemon_generation ON pokemon_generation_abilities(pokemon_id, generation_id);
    CREATE INDEX idx_pokemon_generation_stats_pokemon_generation ON pokemon_generation_stats(pokemon_id, generation_id);
    CREATE INDEX idx_pokemon_moves_pokemon_generation ON pokemon_moves(pokemon_id, generation_id);
    CREATE INDEX idx_pokemon_moves_move ON pokemon_moves(move_id);
    CREATE INDEX idx_pokemon_moves_method ON pokemon_moves(learn_method);
    CREATE INDEX idx_image_assets_entity ON image_assets(entity_type, entity_id);
    CREATE INDEX idx_items_name_zh ON items(name_zh);
    CREATE INDEX idx_items_category ON items(category);
    PRAGMA foreign_keys = ON;
  `);
  db.close();
}

export function importNormalizedDataToSqlite(input?: {
  pokemonEntries?: PokemonEntry[];
  items?: ItemEntry[];
  moves?: MoveEntry[];
  abilities?: AbilityEntry[];
}) {
  const pokemonEntries = input?.pokemonEntries ?? listPokemonEntries();
  const items = input?.items ?? listItems();
  const moves = input?.moves ?? listMoves();
  const abilities = input?.abilities ?? listAbilities();
  ensureSchema();
  const db = openDatabase();
  db.exec("BEGIN");

  try {
    const generationDbIds = new Map<number, number>();
    const typeDbIds = new Map<string, number>();
    const moveDbIds = new Map<string, number>();
    const abilityDbIds = new Map<string, number>();
    const pokemonDbIds = new Map<string, number>();

    const insertGeneration = db.prepare("INSERT OR IGNORE INTO generations (number, name_zh, name_en) VALUES (?, ?, ?)");
    const findGeneration = db.prepare("SELECT id FROM generations WHERE number = ?");
    const ensureGeneration = (generation: number | undefined) => {
      if (!generation) return undefined;
      const cached = generationDbIds.get(generation);
      if (cached) return cached;
      insertGeneration.run(generation, `第 ${generation} 世代`, `Generation ${generation}`);
      const row = findGeneration.get(generation) as { id: number };
      generationDbIds.set(generation, Number(row.id));
      return Number(row.id);
    };
    const insertType = db.prepare("INSERT OR IGNORE INTO types (legacy_id, name_zh) VALUES (?, ?)");
    const findType = db.prepare("SELECT id FROM types WHERE name_zh = ?");
    const ensureType = (type: string | undefined) => {
      const ids: number[] = [];
      for (const name of splitTypeNames(type)) {
        const cached = typeDbIds.get(name);
        if (cached) {
          ids.push(cached);
          continue;
        }
        insertType.run(typeLegacyId(name), name);
        const row = findType.get(name) as { id: number };
        typeDbIds.set(name, Number(row.id));
        ids.push(Number(row.id));
      }
      return ids;
    };
    for (const generation of GENERATIONS) insertGeneration.run(...generation);
    for (const type of TYPE_NAMES) ensureType(type);

    const insertImage = db.prepare(`
      INSERT OR REPLACE INTO image_assets (entity_type, entity_id, form_id, image_kind, url, alt, source_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertImages = (entityType: string, entityId: number, images?: Record<string, ImageAsset>, formId: number | null = null) => {
      for (const [kind, image] of Object.entries(images || {})) {
        if (image?.url) insertImage.run(entityType, entityId, formId, kind, image.url, image.alt ?? null, image.sourceUrl ?? null);
      }
    };

    const insertMove = db.prepare(`
      INSERT OR IGNORE INTO moves (legacy_id, slug, name_zh, name_ja, name_en, type_id, category, power, accuracy, pp, effect_summary, source_url, source_title, source_fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const findMove = db.prepare("SELECT id FROM moves WHERE legacy_id = ?");
    const insertMoveGeneration = db.prepare(`
      INSERT OR REPLACE INTO move_generation_records (move_id, generation_id, type_id, category, power, accuracy, pp, effect_summary, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const move of moves) {
      const moveTypeId = ensureType(move.type)[0] ?? null;
      insertMove.run(move.id, move.slug, move.nameZh, move.nameJa ?? null, move.nameEn ?? null, moveTypeId, move.category ?? null, move.power ?? null, move.accuracy ?? null, move.pp ?? null, move.effectSummary ?? null, move.source?.url ?? null, move.source?.title ?? null, move.source?.fetchedAt ?? null);
      const moveDbId = Number((findMove.get(move.id) as { id: number }).id);
      moveDbIds.set(move.id, moveDbId);
      moveDbIds.set(move.slug, moveDbId);
      moveDbIds.set(move.nameZh, moveDbId);
      insertImages("move", moveDbId, move.image ? { primary: move.image } : undefined);
      for (const record of move.generations || []) {
        const generationDbId = ensureGeneration(record.generation);
        const recordTypeId = ensureType(record.type)[0] ?? null;
        if (generationDbId) insertMoveGeneration.run(moveDbId, generationDbId, recordTypeId, record.category ?? null, record.power ?? null, record.accuracy ?? null, record.pp ?? null, record.effectSummary ?? "", record.notes ?? null);
      }
    }

    const insertAbility = db.prepare(`
      INSERT OR IGNORE INTO abilities (number, name_zh, name_ja, name_en, description, effect_detail, introduced_generation, source_url, source_title, source_fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const findAbility = db.prepare("SELECT id FROM abilities WHERE name_zh = ?");
    const insertAbilityGeneration = db.prepare(`
      INSERT OR REPLACE INTO ability_generation_records (ability_id, generation_id, description, notes)
      VALUES (?, ?, ?, ?)
    `);
    for (const ability of abilities) {
      const introducedGenerationDbId = ensureGeneration(ability.introducedGeneration) ?? null;
      insertAbility.run(ability.number ?? null, ability.nameZh, ability.nameJa ?? null, ability.nameEn ?? null, ability.description ?? null, ability.effectDetail ?? null, introducedGenerationDbId, ability.source?.url ?? null, ability.source?.title ?? null, ability.source?.fetchedAt ?? null);
      const abilityDbId = Number((findAbility.get(ability.nameZh) as { id: number }).id);
      abilityDbIds.set(ability.id, abilityDbId);
      abilityDbIds.set(ability.nameZh, abilityDbId);
      insertImages("ability", abilityDbId, ability.image ? { primary: ability.image } : undefined);
      for (const record of ability.generations || []) {
        const generationDbId = ensureGeneration(record.generation);
        if (generationDbId) insertAbilityGeneration.run(abilityDbId, generationDbId, record.description ?? "", record.notes ?? null);
      }
    }

    const insertItem = db.prepare(`
      INSERT OR IGNORE INTO items (legacy_id, slug, name_zh, name_ja, name_en, category, effect_summary, source_url, source_title, source_fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const findItem = db.prepare("SELECT id FROM items WHERE legacy_id = ?");
    for (const item of items) {
      insertItem.run(item.id, item.slug, item.nameZh, item.nameJa ?? null, item.nameEn ?? null, item.category ?? null, item.effectSummary ?? null, item.source?.url ?? null, item.source?.title ?? null, item.source?.fetchedAt ?? null);
      insertImages("item", Number((findItem.get(item.id) as { id: number }).id), item.image ? { primary: item.image } : undefined);
    }

    const insertPokemon = db.prepare(`
      INSERT INTO pokemon (legacy_id, dex_number, slug, name_zh, name_ja, name_en, category, hidden_ability, height_m, weight_kg, color, catch_rate, male_ratio, female_ratio, genderless, source_url, source_title, source_fetched_at, parse_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertBaseStats = db.prepare("INSERT INTO pokemon_base_stats (pokemon_id, hp, atk, def, spa, spd, spe) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const insertPokemonType = db.prepare("INSERT OR IGNORE INTO pokemon_types (pokemon_id, type_id, slot) VALUES (?, ?, ?)");
    const insertPokemonAbility = db.prepare("INSERT OR IGNORE INTO pokemon_abilities (pokemon_id, ability_id, ability_key, slot, is_hidden) VALUES (?, ?, ?, ?, ?)");
    const insertRegion = db.prepare("INSERT OR IGNORE INTO pokemon_generation_regions (pokemon_id, generation_id, region, dex_number) VALUES (?, ?, ?, ?)");
    const insertGenerationRecord = db.prepare(`
      INSERT OR REPLACE INTO pokemon_generation_records (pokemon_id, generation_id, label, notes)
      VALUES (?, ?, ?, ?)
    `);
    const insertGenerationType = db.prepare("INSERT OR IGNORE INTO pokemon_generation_types (pokemon_id, generation_id, type_id, slot) VALUES (?, ?, ?, ?)");
    const insertGenerationAbility = db.prepare("INSERT OR IGNORE INTO pokemon_generation_abilities (pokemon_id, generation_id, ability_id, ability_key, slot, is_hidden) VALUES (?, ?, ?, ?, ?, ?)");
    const insertGenerationStats = db.prepare("INSERT OR REPLACE INTO pokemon_generation_stats (pokemon_id, generation_id, hp, atk, def, spa, spd, spe) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const insertPokemonMove = db.prepare(`
      INSERT INTO pokemon_moves (pokemon_id, move_id, move_key, generation_id, game_version_code, move_name_zh, learn_method, level, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertForm = db.prepare("INSERT INTO pokemon_forms (legacy_id, pokemon_id, name_zh, introduced_generation, is_mega, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const insertFormStats = db.prepare("INSERT INTO pokemon_form_stats (form_id, hp, atk, def, spa, spd, spe) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const insertFormType = db.prepare("INSERT OR IGNORE INTO pokemon_form_types (form_id, type_id, slot) VALUES (?, ?, ?)");
    const insertFormAbility = db.prepare("INSERT OR IGNORE INTO pokemon_form_abilities (form_id, ability_id, ability_key, slot) VALUES (?, ?, ?, ?)");
    const insertEvolutionMember = db.prepare("INSERT OR IGNORE INTO pokemon_evolution_members (pokemon_id, related_pokemon_id, stage_label, sort_order) VALUES (?, ?, ?, ?)");

    const resolveMoveDbId = (key: string | undefined) => key ? moveDbIds.get(key) : undefined;
    const resolveAbilityDbId = (key: string | undefined) => key ? abilityDbIds.get(key) : undefined;
    const isKnownAbility = (key: string | undefined): key is string => Boolean(key && resolveAbilityDbId(key));
    const insertAbilityReference = (pokemonDbId: number, abilityKey: string, slot: number, hidden: boolean) => {
      insertPokemonAbility.run(pokemonDbId, resolveAbilityDbId(abilityKey) ?? null, abilityKey, slot, hidden ? 1 : 0);
    };
    const insertGenerationAbilityReference = (pokemonDbId: number, generationDbId: number, abilityKey: string, slot: number, hidden: boolean) => {
      insertGenerationAbility.run(pokemonDbId, generationDbId, resolveAbilityDbId(abilityKey) ?? null, abilityKey, slot, hidden ? 1 : 0);
    };

    for (const pokemon of pokemonEntries) {
      const pokemonResult = insertPokemon.run(pokemon.id, pokemon.dexNumber, pokemon.slug, pokemon.nameZh, pokemon.nameJa ?? null, pokemon.nameEn ?? null, pokemon.category ?? null, pokemon.hiddenAbility ?? null, pokemon.heightM ?? null, pokemon.weightKg ?? null, pokemon.color ?? null, pokemon.catchRate ?? null, pokemon.genderRatio?.male ?? null, pokemon.genderRatio?.female ?? null, pokemon.genderRatio?.genderless ? 1 : null, pokemon.source?.url ?? null, pokemon.source?.title ?? null, pokemon.source?.fetchedAt ?? null, pokemon.parseNote ?? null);
      const pokemonDbId = Number(pokemonResult.lastInsertRowid);
      pokemonDbIds.set(pokemon.id, pokemonDbId);
      pokemonDbIds.set(pokemon.slug, pokemonDbId);
      pokemonDbIds.set(pokemon.nameZh, pokemonDbId);
      if (pokemon.baseStats) insertBaseStats.run(pokemonDbId, pokemon.baseStats.hp, pokemon.baseStats.atk, pokemon.baseStats.def, pokemon.baseStats.spa, pokemon.baseStats.spd, pokemon.baseStats.spe);
      insertImages("pokemon", pokemonDbId, pokemon.images);

      splitTypeNames(pokemon.primaryType).forEach((type, index) => {
        const typeDbId = ensureType(type)[0];
        if (typeDbId) insertPokemonType.run(pokemonDbId, typeDbId, index + 1);
      });
      splitTypeNames(pokemon.secondaryType).forEach((type, index) => {
        const typeDbId = ensureType(type)[0];
        if (typeDbId) insertPokemonType.run(pokemonDbId, typeDbId, index + 2);
      });
      const baseHiddenAbilityKey = [pokemon.hiddenAbilityId, pokemon.hiddenAbility].find(isKnownAbility);
      const baseAbilityKeys = [...new Set([...(pokemon.abilityIds || []), ...(pokemon.abilities || [])])]
        .filter(isKnownAbility)
        .filter((abilityKey) => abilityKey !== baseHiddenAbilityKey);
      baseAbilityKeys.forEach((abilityId, index) => insertAbilityReference(pokemonDbId, abilityId, index + 1, false));
      if (baseHiddenAbilityKey) insertAbilityReference(pokemonDbId, baseHiddenAbilityKey, 99, true);

      for (const availability of pokemon.generationAvailability || []) {
        const generationDbId = ensureGeneration(availability.generation);
        if (!generationDbId) continue;
        if (availability.regions?.length) {
          availability.regions.forEach((region) => insertRegion.run(pokemonDbId, generationDbId, region.region, region.dexNumber ?? null));
        } else {
          insertRegion.run(pokemonDbId, generationDbId, null, null);
        }
      }

      const recordsByGeneration = new Map<number, NonNullable<PokemonEntry["generationRecords"]>[number]>();
      for (const record of pokemon.generationRecords || []) recordsByGeneration.set(record.generation, record);
      for (const availability of pokemon.generationAvailability || []) {
        if (!recordsByGeneration.has(availability.generation)) recordsByGeneration.set(availability.generation, { generation: availability.generation });
      }

      for (const record of [...recordsByGeneration.values()].sort((left, right) => left.generation - right.generation)) {
        const generationDbId = ensureGeneration(record.generation);
        if (!generationDbId) continue;
        const recordTypes = [...splitTypeNames(record.primaryType), ...splitTypeNames(record.secondaryType)].slice(0, 2);
        const effectiveTypes = recordTypes.length
          ? recordTypes
          : [...splitTypeNames(pokemon.primaryType), ...splitTypeNames(pokemon.secondaryType)].slice(0, 2);
        insertGenerationRecord.run(pokemonDbId, generationDbId, record.label ?? null, record.notes ?? null);
        effectiveTypes.forEach((type, index) => {
          const typeDbId = ensureType(type)[0];
          if (typeDbId) insertGenerationType.run(pokemonDbId, generationDbId, typeDbId, index + 1);
        });
        const stats = record.baseStats || pokemon.baseStats;
        if (stats) insertGenerationStats.run(pokemonDbId, generationDbId, stats.hp, stats.atk, stats.def, stats.spa, stats.spd, stats.spe);
        const recordHasExplicitAbilities = Array.isArray(record.abilityIds);
        const knownRecordAbilityKeys = (record.abilityIds || []).filter(isKnownAbility);
        const effectiveAbilityKeys = recordHasExplicitAbilities
          ? knownRecordAbilityKeys.length ? knownRecordAbilityKeys : record.generation >= 3 ? baseAbilityKeys : []
          : record.generation >= 3
            ? baseAbilityKeys
            : [];
        effectiveAbilityKeys.forEach((abilityId, index) => insertGenerationAbilityReference(pokemonDbId, generationDbId, abilityId, index + 1, false));
        const recordHiddenAbilityKey = [record.hiddenAbilityId, record.generation >= 5 ? baseHiddenAbilityKey : undefined].find(isKnownAbility);
        if (recordHiddenAbilityKey) insertGenerationAbilityReference(pokemonDbId, generationDbId, recordHiddenAbilityKey, 99, true);
        for (const [index, learnset] of (record.learnset || []).entries()) {
          const moveDbId = resolveMoveDbId(learnset.moveId) ?? resolveMoveDbId(learnset.moveNameZh);
          insertPokemonMove.run(pokemonDbId, moveDbId ?? null, learnset.moveId || learnset.moveNameZh || "", generationDbId, null, learnset.moveNameZh ?? null, learnset.learnMethod ?? null, learnset.level ?? null, learnset.notes ?? null, index);
        }
      }

      for (const [index, form] of (pokemon.forms || []).entries()) {
        const formId = `${pokemon.id}-form-${index + 1}-${form.id || "variant"}`;
        const introducedGenerationDbId = ensureGeneration(form.introducedGeneration) ?? null;
        const formResult = insertForm.run(formId, pokemonDbId, form.nameZh, introducedGenerationDbId, form.isMega ? 1 : 0, form.notes ?? null, index);
        const formDbId = Number(formResult.lastInsertRowid);
        insertImages("pokemon", pokemonDbId, form.images, formDbId);
        if (form.baseStats) insertFormStats.run(formDbId, form.baseStats.hp, form.baseStats.atk, form.baseStats.def, form.baseStats.spa, form.baseStats.spd, form.baseStats.spe);
        [...splitTypeNames(form.primaryType), ...splitTypeNames(form.secondaryType)].slice(0, 2).forEach((type, slot) => {
          const typeDbId = ensureType(type)[0];
          if (typeDbId) insertFormType.run(formDbId, typeDbId, slot + 1);
        });
        (form.abilityIds || []).forEach((abilityId, slot) => insertFormAbility.run(formDbId, resolveAbilityDbId(abilityId) ?? null, abilityId, slot + 1));
      }

    }

    for (const pokemon of pokemonEntries) {
      const pokemonDbId = pokemonDbIds.get(pokemon.id);
      if (!pokemonDbId) continue;
      for (const [index, member] of (pokemon.evolutionChain || []).entries()) {
        const relatedPokemonDbId = member.id ? pokemonDbIds.get(member.id) : undefined;
        if (relatedPokemonDbId) insertEvolutionMember.run(pokemonDbId, relatedPokemonDbId, member.stageLabel ?? null, index);
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }

  db.close();
  return { pokemonCount: pokemonEntries.length, itemCount: items.length, moveCount: moves.length, abilityCount: abilities.length, databasePath: resolveDatabasePath() };
}

export function hasSqliteData() {
  if (!hasDatabaseFile()) return false;
  const db = openDatabase();
  const pokemonCount = db.prepare("SELECT COUNT(*) AS count FROM pokemon").get() as { count: number };
  db.close();
  return pokemonCount.count > 0;
}

export function listPokemonFromSqlite(filters?: { query?: string; type?: string; generation?: number }) {
  const db = openDatabase();
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filters?.query) {
    conditions.push("(p.name_zh LIKE ? OR p.name_ja LIKE ? OR p.name_en LIKE ? OR p.slug LIKE ? OR p.legacy_id LIKE ? OR CAST(p.id AS TEXT) LIKE ?)");
    const value = `%${filters.query}%`;
    params.push(value, value, value, value, value, value);
  }
  if (filters?.type) {
    conditions.push(`(
      EXISTS (SELECT 1 FROM pokemon_types pt JOIN types t ON t.id = pt.type_id WHERE pt.pokemon_id = p.id AND t.name_zh = ?)
      OR EXISTS (SELECT 1 FROM pokemon_generation_types pgt JOIN types gt ON gt.id = pgt.type_id WHERE pgt.pokemon_id = p.id AND gt.name_zh = ?)
    )`);
    params.push(filters.type, filters.type);
  }
  if (filters?.generation) {
    conditions.push("p.introduced_generation = ?");
    params.push(filters.generation);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT p.*, bs.hp, bs.atk, bs.def, bs.spa, bs.spd, bs.spe
    FROM pokemon p
    LEFT JOIN pokemon_base_stats bs ON bs.pokemon_id = p.id
    ${where}
    ORDER BY p.dex_number ASC
  `).all(...params) as Record<string, unknown>[];
  const result = rows.map((row) => hydratePokemonRow(db, row));
  db.close();
  return result;
}

export function getPokemonFromSqlite(idOrSlug: string) {
  const db = openDatabase();
  const row = db.prepare(`
    SELECT p.*, bs.hp, bs.atk, bs.def, bs.spa, bs.spd, bs.spe
    FROM pokemon p
    LEFT JOIN pokemon_base_stats bs ON bs.pokemon_id = p.id
    WHERE p.id = ? OR p.legacy_id = ? OR p.slug = ? OR p.name_zh = ?
    LIMIT 1
  `).get(idOrSlug, idOrSlug, idOrSlug, idOrSlug) as Record<string, unknown> | undefined;
  const result = row ? hydratePokemonRow(db, row, true) : undefined;
  db.close();
  return result;
}

export function listItemsFromSqlite() {
  const db = openDatabase();
  const rows = db.prepare("SELECT * FROM items ORDER BY category ASC, name_zh ASC").all() as Record<string, unknown>[];
  const result = rows.map((row) => mapItemRow(db, row));
  db.close();
  return result;
}

export function getItemFromSqlite(idOrSlug: string) {
  const db = openDatabase();
  const row = db.prepare("SELECT * FROM items WHERE id = ? OR legacy_id = ? OR slug = ? OR name_zh = ? LIMIT 1").get(idOrSlug, idOrSlug, idOrSlug, idOrSlug) as Record<string, unknown> | undefined;
  const result = row ? mapItemRow(db, row) : undefined;
  db.close();
  return result;
}

export function listMovesFromSqlite(filters?: { query?: string; type?: string; generation?: number }) {
  const db = openDatabase();
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filters?.query) {
    conditions.push("(m.name_zh LIKE ? OR m.name_ja LIKE ? OR m.name_en LIKE ? OR m.slug LIKE ? OR m.legacy_id LIKE ? OR CAST(m.id AS TEXT) LIKE ?)");
    const value = `%${filters.query}%`;
    params.push(value, value, value, value, value, value);
  }
  if (filters?.type) {
    conditions.push("t.name_zh = ?");
    params.push(filters.type);
  }
  if (filters?.generation) {
    conditions.push("EXISTS (SELECT 1 FROM move_generation_records mgr JOIN generations g ON g.id = mgr.generation_id WHERE mgr.move_id = m.id AND g.number = ?)");
    params.push(filters.generation);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT m.*, t.name_zh AS type_name_zh
    FROM moves m
    LEFT JOIN types t ON t.id = m.type_id
    ${where}
    ORDER BY m.name_zh ASC
  `).all(...params) as Record<string, unknown>[];
  const result = rows.map((row) => hydrateMoveRow(db, row));
  db.close();
  return result;
}

export function getMoveFromSqlite(idOrSlug: string) {
  const db = openDatabase();
  const row = db.prepare(`
    SELECT m.*, t.name_zh AS type_name_zh
    FROM moves m
    LEFT JOIN types t ON t.id = m.type_id
    WHERE m.id = ? OR m.legacy_id = ? OR m.slug = ? OR m.name_zh = ?
    LIMIT 1
  `).get(idOrSlug, idOrSlug, idOrSlug, idOrSlug) as Record<string, unknown> | undefined;
  const result = row ? hydrateMoveRow(db, row) : undefined;
  db.close();
  return result;
}

export function listAbilitiesFromSqlite(filters?: { query?: string; generation?: number }) {
  const db = openDatabase();
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filters?.query) {
    conditions.push("(a.name_zh LIKE ? OR a.name_ja LIKE ? OR a.name_en LIKE ?)");
    const value = `%${filters.query}%`;
    params.push(value, value, value);
  }
  if (filters?.generation) {
    conditions.push("EXISTS (SELECT 1 FROM ability_generation_records agr JOIN generations g ON g.id = agr.generation_id WHERE agr.ability_id = a.id AND g.number = ?)");
    params.push(filters.generation);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT a.*, g.number AS introduced_generation_number
    FROM abilities a
    LEFT JOIN generations g ON g.id = a.introduced_generation
    ${where}
    ORDER BY a.number ASC, a.name_zh ASC
  `).all(...params) as Record<string, unknown>[];
  const result = rows.map((row) => hydrateAbilityRow(db, row));
  db.close();
  return result;
}

export function getAbilityFromSqlite(idOrName: string) {
  const db = openDatabase();
  const row = db.prepare(`
    SELECT a.*, g.number AS introduced_generation_number
    FROM abilities a
    LEFT JOIN generations g ON g.id = a.introduced_generation
    WHERE a.id = ? OR a.name_zh = ?
    LIMIT 1
  `).get(idOrName, idOrName) as Record<string, unknown> | undefined;
  const result = row ? hydrateAbilityRow(db, row) : undefined;
  db.close();
  return result;
}
