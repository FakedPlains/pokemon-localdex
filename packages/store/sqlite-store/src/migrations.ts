import { DatabaseSync } from "node:sqlite";

export function migrateOldSchema(db: InstanceType<typeof DatabaseSync>) {
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
