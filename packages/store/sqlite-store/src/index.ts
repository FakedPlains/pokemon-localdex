/**
 * @pokemon-localdex/sqlite-store
 *
 * Node.js SQLite 数据访问层（薄包装）。
 *
 * 查询逻辑全部委托给 @pokemon-localdex/drizzle-queries（DrizzleStore），
 * 本模块只负责：
 *   1. 数据库文件管理（路径、打开、关闭）
 *   2. Schema 迁移（ensureSchema / migrateSchema / resetSchema）
 *   3. 创建 Drizzle 实例并包装为 IStore
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

// ── Re-export shared types ──

export type {
  StatBlock,
  SourceMeta,
  ImageAsset,
  FormStatVariant,
  FormTypeVariant,
  FormAbilityVariant,
  PokemonFormEntry,
  EvolutionStep,
  PokemonSummary,
  PokemonCardSummary,
  PokemonTableSummary,
  PokemonEntry,
  PokemonIdentity,
  ChampionsSeasonSummary,
  MoveGenerationRecord,
  MoveEntry,
  AbilityGenerationRecord,
  AbilityEntry,
  ItemGenerationRecord,
  ItemEntry,
  LearnsetRecord,
  PaginationParams,
  PaginatedResult,
} from "@pokemon-localdex/store-types";

// ── Re-export helpers for crawler ──

export {
  normalizeTypeName,
  splitTypeNames,
  typeLegacyId,
  GENERATIONS,
  GAME_VERSIONS,
  GAME_VERSION_NAMES,
  TYPE_NAMES,
  TYPE_ALIASES,
  statBlockFromRow,
  sourceFromRow,
} from "@pokemon-localdex/store-types";

// ── Drizzle ──

import { drizzle } from "drizzle-orm/sqlite-proxy";
import { createDrizzleStore, DrizzleStore } from "@pokemon-localdex/drizzle-queries";
import type { IStore } from "@pokemon-localdex/store-types";

const ROOT = resolve(import.meta.dirname, "../../../../");

// ══════════════════════════════════════════════════════════════════════════════
// 数据库文件管理
// ══════════════════════════════════════════════════════════════════════════════

function resolveDatabasePath() {
  return process.env.LOCALDEX_DB_PATH
    ? resolve(process.env.LOCALDEX_DB_PATH)
    : resolve(ROOT, "data/sqlite/localdex.sqlite");
}

function ensureDbDir() {
  mkdirSync(dirname(resolveDatabasePath()), { recursive: true });
}

export function getDatabasePath() { return resolveDatabasePath(); }
export function hasDatabaseFile() { return existsSync(resolveDatabasePath()); }

let _migrationDone = false;

export function openDatabase() {
  ensureDbDir();
  const db = new DatabaseSync(resolveDatabasePath(), { timeout: 3000 });
  if (!_migrationDone) {
    _migrationDone = true;
    _migrateOldSchema(db);
  }
  return db;
}

// ══════════════════════════════════════════════════════════════════════════════
// 轻量级迁移
// ══════════════════════════════════════════════════════════════════════════════

function _migrateOldSchema(db: InstanceType<typeof DatabaseSync>) {
  // ── 迁移 1: pokemon_form_types type_id → type_name ──
  try {
    const cols = db.prepare("PRAGMA table_info(pokemon_form_types)").all() as Record<string, unknown>[];
    if (cols.length > 0) {
      const colNames = cols.map((c) => String(c.name));
      if (colNames.includes("type_id") && !colNames.includes("type_name")) {
        db.exec(`
          PRAGMA foreign_keys = OFF;
          CREATE TABLE IF NOT EXISTS _pft_backup AS
            SELECT pft.id, pft.form_id, t.name_zh AS type_name, pft.slot
            FROM pokemon_form_types pft
            LEFT JOIN types t ON t.id = pft.type_id;
          DROP TABLE pokemon_form_types;
          CREATE TABLE pokemon_form_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            form_id INTEGER NOT NULL REFERENCES pokemon_forms(id) ON DELETE CASCADE,
            type_name TEXT NOT NULL,
            slot INTEGER NOT NULL,
            UNIQUE (form_id, slot)
          );
          INSERT INTO pokemon_form_types (id, form_id, type_name, slot)
            SELECT id, form_id, COALESCE(type_name, ''), slot FROM _pft_backup;
          DROP TABLE _pft_backup;
          PRAGMA foreign_keys = ON;
        `);
      }
    }
  } catch { /* table doesn't exist yet */ }

  // ── 迁移 2: moves type_id → type_name ──
  try {
    const cols = db.prepare("PRAGMA table_info(moves)").all() as Record<string, unknown>[];
    if (cols.length > 0) {
      const colNames = cols.map((c) => String(c.name));
      if (colNames.includes("type_id") && !colNames.includes("type_name")) {
        db.exec(`
          PRAGMA foreign_keys = OFF;
          ALTER TABLE moves ADD COLUMN type_name TEXT;
          UPDATE moves SET type_name = (SELECT t.name_zh FROM types t WHERE t.id = moves.type_id);
          PRAGMA foreign_keys = ON;
        `);
      }
    }
  } catch { /* table doesn't exist yet */ }

  // ── 迁移 3: generation_id → generation（所有相关表）──
  const _hasCol = (table: string, col: string) => {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Record<string, unknown>[];
      return cols.some((c) => String(c.name) === col);
    } catch { return false; }
  };

  if (_hasCol("pokemon", "introduced_generation_id") && !_hasCol("pokemon", "introduced_generation")) {
    try {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        ALTER TABLE pokemon ADD COLUMN introduced_generation INTEGER;
        UPDATE pokemon SET introduced_generation = (SELECT g.number FROM generations g WHERE g.id = pokemon.introduced_generation_id);
        PRAGMA foreign_keys = ON;
      `);
    } catch { /* column may already exist */ }
  }

  if (_hasCol("pokemon_forms", "generation_start")) {
    try {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE _pf_backup AS
          SELECT id, pokemon_id, form_key, name_zh, form_type, is_default, sort_order
          FROM pokemon_forms;
        DROP TABLE pokemon_forms;
        CREATE TABLE pokemon_forms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
          form_key TEXT NOT NULL,
          name_zh TEXT NOT NULL,
          form_type TEXT NOT NULL DEFAULT 'default',
          is_default INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          UNIQUE (pokemon_id, form_key)
        );
        INSERT INTO pokemon_forms (id, pokemon_id, form_key, name_zh, form_type, is_default, sort_order)
          SELECT id, pokemon_id, form_key, name_zh, form_type, is_default, sort_order FROM _pf_backup;
        DROP TABLE _pf_backup;
        PRAGMA foreign_keys = ON;
      `);
    } catch { /* table doesn't exist or already migrated */ }
  }

  if (_hasCol("pokemon_generation_regions", "generation_id") && !_hasCol("pokemon_generation_regions", "generation")) {
    try {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        ALTER TABLE pokemon_generation_regions ADD COLUMN generation INTEGER;
        UPDATE pokemon_generation_regions SET generation = (SELECT g.number FROM generations g WHERE g.id = pokemon_generation_regions.generation_id);
        UPDATE pokemon_generation_regions SET generation = 0 WHERE generation IS NULL;
        PRAGMA foreign_keys = ON;
      `);
    } catch { /* column may already exist */ }
  }

  if (_hasCol("pokemon_learnsets", "generation_id") && !_hasCol("pokemon_learnsets", "generation")) {
    try {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        ALTER TABLE pokemon_learnsets ADD COLUMN generation INTEGER;
        UPDATE pokemon_learnsets SET generation = (SELECT g.number FROM generations g WHERE g.id = pokemon_learnsets.generation_id);
        UPDATE pokemon_learnsets SET generation = 0 WHERE generation IS NULL;
        PRAGMA foreign_keys = ON;
      `);
    } catch { /* column may already exist */ }
  }

  if (_hasCol("move_generation_records", "generation_id") && !_hasCol("move_generation_records", "generation")) {
    try {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        ALTER TABLE move_generation_records ADD COLUMN generation INTEGER;
        UPDATE move_generation_records SET generation = (SELECT g.number FROM generations g WHERE g.id = move_generation_records.generation_id);
        UPDATE move_generation_records SET generation = 0 WHERE generation IS NULL;
        PRAGMA foreign_keys = ON;
      `);
    } catch { /* column may already exist */ }
  }

  if (_hasCol("ability_generation_records", "generation_id") && !_hasCol("ability_generation_records", "generation")) {
    try {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        ALTER TABLE ability_generation_records ADD COLUMN generation INTEGER;
        UPDATE ability_generation_records SET generation = (SELECT g.number FROM generations g WHERE g.id = ability_generation_records.generation_id);
        UPDATE ability_generation_records SET generation = 0 WHERE generation IS NULL;
        PRAGMA foreign_keys = ON;
      `);
    } catch { /* column may already exist */ }
  }

  // ── 迁移: items 表删除废弃的 legacy_id 列 ──
  if (_hasCol("items", "legacy_id")) {
    try {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE _items_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
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
        INSERT INTO _items_new (id, slug, name_zh, name_ja, name_en, category, effect_summary,
          effect_detail, introduced_generation, image_url, source_url, source_title, source_fetched_at)
          SELECT id, slug, name_zh, name_ja, name_en, category, effect_summary,
            effect_detail, introduced_generation, image_url, source_url, source_title, source_fetched_at
          FROM items;
        DROP TABLE items;
        ALTER TABLE _items_new RENAME TO items;
        PRAGMA foreign_keys = ON;
      `);
    } catch { /* table doesn't exist or already migrated */ }
  }

  // ── 迁移: item_generation_records 添加 version_exclusive 列 ──
  if (!_hasCol("item_generation_records", "version_exclusive")) {
    try {
      db.exec(`ALTER TABLE item_generation_records ADD COLUMN version_exclusive INTEGER NOT NULL DEFAULT 0`);
    } catch { /* column may already exist or table doesn't exist */ }
  }

  // ── 迁移: move_generation_records 添加 version_exclusive 列 ──
  if (!_hasCol("move_generation_records", "version_exclusive")) {
    try {
      db.exec(`ALTER TABLE move_generation_records ADD COLUMN version_exclusive INTEGER NOT NULL DEFAULT 0`);
    } catch { /* column may already exist or table doesn't exist */ }
  }

  // ── 迁移: ability_generation_records 添加 version_exclusive 列 ──
  if (!_hasCol("ability_generation_records", "version_exclusive")) {
    try {
      db.exec(`ALTER TABLE ability_generation_records ADD COLUMN version_exclusive INTEGER NOT NULL DEFAULT 0`);
    } catch { /* column may already exist or table doesn't exist */ }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Schema 管理
// ══════════════════════════════════════════════════════════════════════════════

export function ensureSchema() {
  const db = openDatabase();

  // 检测旧表结构并迁移
  try {
    const cols = db.prepare("PRAGMA table_info(pokemon_forms)").all() as Record<string, unknown>[];
    if (cols.length > 0) {
      const colNames = cols.map((c) => String(c.name));
      if (!colNames.includes("form_key")) {
        db.exec(`
          PRAGMA foreign_keys = OFF;
          DROP TABLE IF EXISTS pokemon_moves;
          DROP TABLE IF EXISTS pokemon_evolution_members;
          DROP TABLE IF EXISTS pokemon_form_abilities;
          DROP TABLE IF EXISTS pokemon_form_types;
          DROP TABLE IF EXISTS pokemon_form_stats;
          DROP TABLE IF EXISTS pokemon_form_images;
          DROP TABLE IF EXISTS pokemon_forms;
          DROP TABLE IF EXISTS pokemon_abilities;
          DROP TABLE IF EXISTS pokemon_types;
          DROP TABLE IF EXISTS pokemon_generation_regions;
          DROP TABLE IF EXISTS pokemon_generation_abilities;
          DROP TABLE IF EXISTS pokemon_generation_types;
          DROP TABLE IF EXISTS pokemon_generation_stats;
          DROP TABLE IF EXISTS pokemon_generation_records;
          DROP TABLE IF EXISTS pokemon_base_stats;
          DROP TABLE IF EXISTS evolution_chains;
          DROP TABLE IF EXISTS pokemon_learnsets;
          DROP TABLE IF EXISTS pokemon;
          PRAGMA foreign_keys = ON;
        `);
      }
    }
  } catch { /* table doesn't exist yet, that's fine */ }

  // ── 迁移: pokemon_form_stats/types/abilities 添加 generation_start/generation_end ──
  try {
    const statCols = db.prepare("PRAGMA table_info(pokemon_form_stats)").all() as Record<string, unknown>[];
    if (statCols.length > 0) {
      const colNames = statCols.map((c) => String(c.name));
      if (!colNames.includes("generation_start")) {
        db.exec(`
          PRAGMA foreign_keys = OFF;
          DROP TABLE IF EXISTS pokemon_form_stats;
          DROP TABLE IF EXISTS pokemon_form_types;
          DROP TABLE IF EXISTS pokemon_form_abilities;
          PRAGMA foreign_keys = ON;
        `);
      }
    }
  } catch { /* table doesn't exist yet */ }

  try {
    db.exec(`DROP TABLE IF EXISTS image_assets; DROP TABLE IF EXISTS _image_assets_backup;`);
  } catch { /* table doesn't exist */ }

  // ── 迁移: Champions 道具关联直接指向 items，移除旧 champions_items 表 ──
  try {
    const championItemCols = db.prepare("PRAGMA table_info(champions_regulation_items)").all() as Record<string, unknown>[];
    const colNames = championItemCols.map((c) => String(c.name));
    if (colNames.includes("champions_item_id")) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        DROP TABLE IF EXISTS champions_regulation_items;
        DROP TABLE IF EXISTS champions_items;
        PRAGMA foreign_keys = ON;
      `);
    } else {
      db.exec(`DROP TABLE IF EXISTS champions_items;`);
    }
  } catch { /* tables don't exist yet */ }

  db.exec(`
    PRAGMA foreign_keys = OFF;

    CREATE TABLE IF NOT EXISTS pokemon (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dex_number INTEGER NOT NULL,
      slug TEXT NOT NULL UNIQUE,
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
      form_key TEXT NOT NULL,
      name_zh TEXT NOT NULL,
      form_type TEXT NOT NULL DEFAULT 'default',
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      required_item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
      UNIQUE (pokemon_id, form_key)
    );

    CREATE TABLE IF NOT EXISTS pokemon_form_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL REFERENCES pokemon_forms(id) ON DELETE CASCADE,
      generation_start INTEGER,
      generation_end INTEGER,
      hp INTEGER NOT NULL, atk INTEGER NOT NULL, def INTEGER NOT NULL,
      spa INTEGER NOT NULL, spd INTEGER NOT NULL, spe INTEGER NOT NULL,
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
      from_form_key TEXT,
      to_form_key TEXT,
      stage INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      evolution_method TEXT,
      evolution_condition TEXT,
      evolution_item TEXT,
      evolution_level INTEGER,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS pokemon_generation_regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      generation INTEGER NOT NULL,
      region TEXT,
      regional_dex_number TEXT,
      UNIQUE (pokemon_id, generation, region)
    );

    CREATE TABLE IF NOT EXISTS pokemon_learnsets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      form_key TEXT NOT NULL DEFAULT 'default',
      move_id INTEGER REFERENCES moves(id),
      move_name_zh TEXT NOT NULL,
      generation INTEGER NOT NULL,
      game_version_code TEXT,
      learn_method TEXT NOT NULL,
      level INTEGER,
      tm_number TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      UNIQUE (pokemon_id, form_key, move_name_zh, generation,
              game_version_code, learn_method, level)
    );

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
      UNIQUE (move_id, generation, game_version_code)
    );

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
      UNIQUE (ability_id, generation)
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
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
      UNIQUE (item_id, generation)
    );

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
      form_key TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_pokemon_dex ON pokemon(dex_number);
    CREATE INDEX IF NOT EXISTS idx_pokemon_name ON pokemon(name_zh);
    CREATE INDEX IF NOT EXISTS idx_pokemon_slug ON pokemon(slug);

    CREATE INDEX IF NOT EXISTS idx_forms_pokemon ON pokemon_forms(pokemon_id);
    CREATE INDEX IF NOT EXISTS idx_forms_default ON pokemon_forms(pokemon_id, is_default);
    CREATE INDEX IF NOT EXISTS idx_form_types_form ON pokemon_form_types(form_id);
    CREATE INDEX IF NOT EXISTS idx_form_abilities_form ON pokemon_form_abilities(form_id);
    CREATE INDEX IF NOT EXISTS idx_form_stats_form ON pokemon_form_stats(form_id);
    CREATE INDEX IF NOT EXISTS idx_form_images_form ON pokemon_form_images(form_id);

    CREATE INDEX IF NOT EXISTS idx_evo_chain ON evolution_chains(chain_id);
    CREATE INDEX IF NOT EXISTS idx_evo_to ON evolution_chains(to_pokemon_id);

    CREATE INDEX IF NOT EXISTS idx_learnsets_pokemon ON pokemon_learnsets(pokemon_id, form_key);
    CREATE INDEX IF NOT EXISTS idx_learnsets_pokemon_gen ON pokemon_learnsets(pokemon_id, generation);
    CREATE INDEX IF NOT EXISTS idx_learnsets_move ON pokemon_learnsets(move_id);

    CREATE INDEX IF NOT EXISTS idx_regions_pokemon ON pokemon_generation_regions(pokemon_id);

    CREATE INDEX IF NOT EXISTS idx_moves_name_zh ON moves(name_zh);
    CREATE INDEX IF NOT EXISTS idx_moves_type ON moves(type_name);
    CREATE INDEX IF NOT EXISTS idx_moves_number ON moves(number);
    CREATE INDEX IF NOT EXISTS idx_abilities_name ON abilities(name_zh);
    CREATE INDEX IF NOT EXISTS idx_abilities_number ON abilities(number);
    CREATE INDEX IF NOT EXISTS idx_items_name_zh ON items(name_zh);

    CREATE INDEX IF NOT EXISTS idx_champions_seasons_regulation ON champions_seasons(regulation_id);
    CREATE INDEX IF NOT EXISTS idx_champions_regulation_pokemon_regulation ON champions_regulation_pokemon(regulation_id);
    CREATE INDEX IF NOT EXISTS idx_champions_regulation_pokemon_pokemon ON champions_regulation_pokemon(pokemon_id);
    CREATE INDEX IF NOT EXISTS idx_champions_regulation_items_regulation ON champions_regulation_items(regulation_id);

    PRAGMA foreign_keys = ON;
  `);

  db.close();
}

export function migrateSchema() {
  const db = openDatabase();
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS pokemon_learnsets_old;
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
    DROP TABLE IF EXISTS evolution_chains;
    DROP TABLE IF EXISTS pokemon_learnsets;
    DROP TABLE IF EXISTS champions_regulation_items;
    DROP TABLE IF EXISTS champions_regulation_pokemon;
    DROP TABLE IF EXISTS champions_seasons;
    DROP TABLE IF EXISTS champions_regulations;
    DROP TABLE IF EXISTS champions_items;
    DROP TABLE IF EXISTS pokemon_form_images;
    DROP TABLE IF EXISTS pokemon;
    PRAGMA foreign_keys = ON;
  `);
  db.close();
  ensureSchema();
}

export function resetSchema() {
  const db = openDatabase();
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS pokemon_learnsets;
    DROP TABLE IF EXISTS champions_regulation_items;
    DROP TABLE IF EXISTS champions_regulation_pokemon;
    DROP TABLE IF EXISTS champions_seasons;
    DROP TABLE IF EXISTS champions_regulations;
    DROP TABLE IF EXISTS champions_items;
    DROP TABLE IF EXISTS evolution_chains;
    DROP TABLE IF EXISTS pokemon_form_images;
    DROP TABLE IF EXISTS pokemon_form_abilities;
    DROP TABLE IF EXISTS pokemon_form_types;
    DROP TABLE IF EXISTS pokemon_form_stats;
    DROP TABLE IF EXISTS pokemon_forms;
    DROP TABLE IF EXISTS pokemon_generation_regions;
    DROP TABLE IF EXISTS move_generation_records;
    DROP TABLE IF EXISTS ability_generation_records;
    DROP TABLE IF EXISTS items;
    DROP TABLE IF EXISTS moves;
    DROP TABLE IF EXISTS abilities;
    DROP TABLE IF EXISTS pokemon;
    DROP TABLE IF EXISTS game_versions;
    DROP TABLE IF EXISTS types;
    DROP TABLE IF EXISTS generations;
    DROP TABLE IF EXISTS pokemon_moves;
    DROP TABLE IF EXISTS pokemon_evolution_members;
    DROP TABLE IF EXISTS pokemon_abilities;
    DROP TABLE IF EXISTS pokemon_types;
    DROP TABLE IF EXISTS pokemon_generation_abilities;
    DROP TABLE IF EXISTS pokemon_generation_types;
    DROP TABLE IF EXISTS pokemon_generation_stats;
    DROP TABLE IF EXISTS pokemon_generation_records;
    DROP TABLE IF EXISTS pokemon_base_stats;
    DROP TABLE IF EXISTS image_assets;
    DROP TABLE IF EXISTS _image_assets_backup;
    DROP TABLE IF EXISTS item_generation_records;
    PRAGMA foreign_keys = ON;
  `);
  db.close();
  ensureSchema();
}

// ══════════════════════════════════════════════════════════════════════════════
// 数据检测
// ══════════════════════════════════════════════════════════════════════════════

export function hasSqliteData() {
  if (!hasDatabaseFile()) return false;
  const db = openDatabase();
  try {
    const row = db.prepare(
      "SELECT (SELECT COUNT(*) FROM pokemon) + (SELECT COUNT(*) FROM moves) + (SELECT COUNT(*) FROM abilities) AS total"
    ).get() as { total: number };
    db.close();
    return row.total > 0;
  } catch {
    db.close();
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Drizzle 实例创建（sqlite-proxy 包装 node:sqlite）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 用 sqlite-proxy 包装 node:sqlite 的 DatabaseSync。
 *
 * sqlite-proxy 需要一个 async 回调 (sql, params, method) => { rows }，
 * 我们在回调内部同步执行 DatabaseSync 的 prepare/all/get/run。
 *
 * 重要：Drizzle 的 mapResultRow 使用数字索引（row[columnIndex]）访问行数据，
 * 因此回调必须返回二维数组格式（每行是值数组，按 SELECT 列顺序排列）。
 *
 * 使用 stmt.setReturnArrays(true) 直接获取原生数组格式，
 * 避免 stmt.all() 返回对象时同名列被覆盖的问题（如 LEFT JOIN 时两表有同名列）。
 */
function createDrizzleDb() {
  const rawDb = openDatabase();

  const db = drizzle(async (sql, params, method) => {
    try {
      const stmt = rawDb.prepare(sql);

      if (method === "run") {
        stmt.run(...params);
        return { rows: [] };
      }

      // 使用 setReturnArrays(true) 直接获取二维数组格式
      // 这样即使有同名列（如 JOIN 时），也能保持正确的列顺序和值
      stmt.setReturnArrays(true);
      const rows = stmt.all(...params) as unknown[][];

      return { rows };
    } catch (e: any) {
      console.error("[sqlite-proxy] SQL error:", e.message, "\nSQL:", sql);
      throw e;
    }
  });

  return { db, rawDb };
}

// ══════════════════════════════════════════════════════════════════════════════
// IStore 工厂（统一接口）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 创建符合 IStore 接口的 SQLite 适配器。
 */
export function createSqliteStore(): IStore {
  const { db } = createDrizzleDb();
  return createDrizzleStore(db);
}
