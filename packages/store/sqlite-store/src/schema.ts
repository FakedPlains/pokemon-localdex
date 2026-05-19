import { openDatabase } from "./database.ts";

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
