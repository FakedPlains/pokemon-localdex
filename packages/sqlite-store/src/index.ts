import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

// ── Type definitions ──

export type StatBlock = {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
};

export type SourceMeta = {
  url: string;
  title: string;
  fetchedAt: string;
};

export type ImageAsset = {
  url: string;
  alt?: string;
};

export type FormStatVariant = {
  generationStart?: number;
  generationEnd?: number;
  baseStats: StatBlock;
};

export type FormTypeVariant = {
  generationStart?: number;
  generationEnd?: number;
  primaryType?: string;
  secondaryType?: string;
};

export type FormAbilityVariant = {
  generationStart?: number;
  generationEnd?: number;
  abilities: Array<{ nameZh: string; isHidden: boolean }>;
};

export type PokemonFormEntry = {
  formKey: string;
  nameZh: string;
  formType: string;
  isDefault: boolean;
  sortOrder: number;
  primaryType?: string;
  secondaryType?: string;
  abilities: Array<{ nameZh: string; isHidden: boolean }>;
  baseStats?: StatBlock;
  images: Record<string, ImageAsset>;
  /** Generation-specific stat variants (when stats changed across generations) */
  statVariants?: FormStatVariant[];
  /** Generation-specific type variants (when types changed across generations) */
  typeVariants?: FormTypeVariant[];
  /** Generation-specific ability variants (when abilities changed across generations) */
  abilityVariants?: FormAbilityVariant[];
};

export type EvolutionStep = {
  fromPokemonId?: number;
  fromNameZh?: string;
  fromFormKey?: string;
  toPokemonId: number;
  toNameZh: string;
  toFormKey?: string;
  stage: number;
  method?: string;
  condition?: string;
  item?: string;
  level?: number;
  toTypes?: string[];
  toImage?: ImageAsset;
};

export type PokemonSummary = {
  id: number;
  dexNumber: number;
  slug: string;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  primaryType?: string;
  secondaryType?: string;
  abilities: string[];
  hiddenAbility?: string;
  baseStats?: StatBlock;
  image?: ImageAsset;
  shinyImage?: ImageAsset;
  generations: number[];
};

export type PokemonEntry = PokemonSummary & {
  category?: string;
  heightM?: number;
  weightKg?: number;
  forms: PokemonFormEntry[];
  evolutionChain: EvolutionStep[];
  source?: SourceMeta;
};

export type MoveGenerationRecord = {
  generation: number;
  gameVersionCode?: string;
  gameVersionName?: string;
  type?: string;
  category?: string;
  power?: number;
  accuracy?: number;
  pp?: number;
  description: string;
  notes?: string;
};

export type MoveEntry = {
  id: string;
  number?: number;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  type?: string;
  category?: string;
  power?: number;
  accuracy?: number;
  pp?: number;
  description?: string;
  effectDetail?: string;
  introducedGeneration?: number;
  generations: MoveGenerationRecord[];
  source?: SourceMeta;
};

export type AbilityGenerationRecord = {
  generation: number;
  gameVersionCode?: string;
  gameVersionName?: string;
  description: string;
  notes?: string;
};

export type AbilityEntry = {
  id: string;
  number?: number;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  description?: string;
  effectDetail?: string;
  introducedGeneration?: number;
  generations: AbilityGenerationRecord[];
  source?: SourceMeta;
};

export type ItemEntry = {
  id: string;
  slug: string;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  category?: string;
  effectSummary?: string;
  source?: SourceMeta;
};

export type LearnsetRecord = {
  moveId?: number;
  moveNameZh: string;
  learnMethod: string;
  level?: number;
  tmNumber?: string;
  moveType?: string;
  moveCategory?: string;
  movePower?: number;
  moveAccuracy?: number;
  movePP?: number;
};

export type TeamMember = {
  slot: number;
  pokemonId: number;
  formKey: string;
  nameZh?: string;
  level: number;
  itemId?: number;
  abilityId?: number;
  nature?: string;
  moves: (number | null)[];
  ivs: Partial<StatBlock>;
  evs: Partial<StatBlock>;
};

export type BattleTeam = {
  id: string;
  name: string;
  format: string;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
};

// ── Constants ──

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
  [9, "第九世代", "Generation IX"],
  [99, "Champions", "Champions"],
] as const;

const GAME_VERSIONS: Array<[string, string, number]> = [
  ["RG", "红/绿", 1], ["B", "蓝", 1], ["Y", "黄", 1],
  ["GS", "金/银", 2], ["C", "水晶", 2],
  ["RS", "红宝石/蓝宝石", 3], ["E", "绿宝石", 3], ["FRLG", "火红/叶绿", 3],
  ["DP", "钻石/珍珠", 4], ["Pt", "白金", 4], ["HGSS", "心金/魂银", 4],
  ["BW", "黑/白", 5], ["B2W2", "黑2/白2", 5],
  ["XY", "X/Y", 6], ["ORAS", "欧米伽红宝石/阿尔法蓝宝石", 6],
  ["SM", "太阳/月亮", 7], ["USUM", "究极之日/究极之月", 7], ["LPLE", "Let's Go 皮卡丘/伊布", 7],
  ["SWSH", "剑/盾", 8], ["SWSHE", "剑/盾 铠之孤岛+冠之雪原", 8], ["BDSP", "晶灿钻石/明亮珍珠", 8], ["LA", "传说 阿尔宙斯", 8],
  ["SV", "朱/紫", 9], ["SVT", "朱/紫 零之秘宝", 9], ["ZA", "传说 Z-A", 9],
  ["CHAMP", "冠军", 99],
];

const GAME_VERSION_NAMES = new Map<string, string>(
  GAME_VERSIONS.map(([code, nameZh]) => [code, nameZh])
);

const TYPE_NAMES = [
  "一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面",
  "飞行", "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精",
];

const TYPE_ALIASES: Record<string, string> = {
  電: "电", 飛行: "飞行", 蟲: "虫", 龍: "龙",
  惡: "恶", 鋼: "钢", 格鬥: "格斗", 幽靈: "幽灵",
};

// ── Helpers ──

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
  const candidates = [...TYPE_NAMES, ...Object.keys(TYPE_ALIASES)].sort((a, b) => b.length - a.length);
  while (rest) {
    const match = candidates.find((c) => rest.startsWith(c));
    if (!match) break;
    result.push(normalizeTypeName(match));
    rest = rest.slice(match.length);
  }
  return rest ? [normalized] : [...new Set(result)];
}

// ── Database ──

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

/**
 * 轻量级迁移：检测旧的列结构并自动迁移。
 * 在首次打开数据库时自动执行。
 *
 * 迁移内容：
 * 1. pokemon_form_types: type_id → type_name（属性汉字）
 * 2. moves: type_id → type_name
 * 3. 所有表: generation_id → generation（世代数字）
 */
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
  // 辅助函数：检测表是否有 generation_id 列
  const _hasCol = (table: string, col: string) => {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Record<string, unknown>[];
      return cols.some((c) => String(c.name) === col);
    } catch { return false; }
  };

  // pokemon: introduced_generation_id → introduced_generation
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

  // pokemon_forms: 移除废弃的 generation_start/generation_end 列
  // 世代变体信息已迁移到子表（pokemon_form_stats/types/abilities）
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

  // pokemon_generation_regions: generation_id → generation
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

  // pokemon_learnsets: generation_id → generation
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

  // move_generation_records: generation_id → generation
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

  // ability_generation_records: generation_id → generation
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

  // moves.introduced_generation: 如果存的是 generations.id 而非世代数字，需要转换
  // 检测方式：如果 generations 表存在且 moves.introduced_generation 的值与 generations.id 匹配
  try {
    const genExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='generations'").get();
    if (genExists) {
      // 检查是否有 moves 的 introduced_generation 值对应 generations.id
      const sample = db.prepare(`
        SELECT m.introduced_generation, g.number
        FROM moves m
        JOIN generations g ON g.id = m.introduced_generation
        WHERE m.introduced_generation IS NOT NULL
        LIMIT 1
      `).get() as Record<string, unknown> | undefined;
      if (sample && Number(sample.introduced_generation) !== Number(sample.number)) {
        // 值是 ID 而非世代数字，需要转换
        db.exec(`
          UPDATE moves SET introduced_generation = (
            SELECT g.number FROM generations g WHERE g.id = moves.introduced_generation
          ) WHERE introduced_generation IS NOT NULL;
        `);
      }
      // 同样处理 abilities.introduced_generation
      const abSample = db.prepare(`
        SELECT a.introduced_generation, g.number
        FROM abilities a
        JOIN generations g ON g.id = a.introduced_generation
        WHERE a.introduced_generation IS NOT NULL
        LIMIT 1
      `).get() as Record<string, unknown> | undefined;
      if (abSample && Number(abSample.introduced_generation) !== Number(abSample.number)) {
        db.exec(`
          UPDATE abilities SET introduced_generation = (
            SELECT g.number FROM generations g WHERE g.id = abilities.introduced_generation
          ) WHERE introduced_generation IS NOT NULL;
        `);
      }
    }
  } catch { /* generations table doesn't exist, no migration needed */ }
}

/**
 * 增量式确保 schema 存在。保留已有数据（moves, abilities 等）。
 * 如果检测到旧版 pokemon_forms 表结构，自动迁移。
 */
export function ensureSchema() {
  const db = openDatabase();

  // 检测旧表结构并迁移
  try {
    const cols = db.prepare("PRAGMA table_info(pokemon_forms)").all() as Record<string, unknown>[];
    if (cols.length > 0) {
      const colNames = cols.map((c) => String(c.name));
      if (!colNames.includes("form_key")) {
        // 旧表结构，需要迁移 pokemon 相关表
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

  // type_id → type_name 和 generation_id → generation 的迁移
  // 已在 _migrateOldSchema() 中处理（openDatabase 首次调用时自动执行）

  // ── 迁移: pokemon_form_stats/types/abilities 添加 generation_start/generation_end ──
  // 旧表没有这些列且 UNIQUE 约束不同，需要 drop 重建
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

  // image_assets 表已废弃，清理旧表
  try {
    db.exec(`DROP TABLE IF EXISTS image_assets; DROP TABLE IF EXISTS _image_assets_backup;`);
  } catch { /* table doesn't exist */ }

  db.exec(`
    PRAGMA foreign_keys = OFF;

    -- ============================================================
    -- generations / game_versions / types 表已废弃
    -- 世代直接以数字存储，游戏版本以 code 存储，属性以汉字存储
    -- ============================================================

    -- ============================================================
    -- 宝可梦主表（精简）
    -- ============================================================
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

    -- ============================================================
    -- 宝可梦形态（核心：形态优先架构）
    -- ============================================================
    CREATE TABLE IF NOT EXISTS pokemon_forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      form_key TEXT NOT NULL,
      name_zh TEXT NOT NULL,
      form_type TEXT NOT NULL DEFAULT 'default',
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
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

    -- ============================================================
    -- 进化链（含进化条件）
    -- ============================================================
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

    -- ============================================================
    -- 宝可梦世代可用性
    -- ============================================================
    CREATE TABLE IF NOT EXISTS pokemon_generation_regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
      generation INTEGER NOT NULL,
      region TEXT,
      regional_dex_number TEXT,
      UNIQUE (pokemon_id, generation, region)
    );

    -- ============================================================
    -- 招式学习
    -- ============================================================
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

    -- ============================================================
    -- 招式表
    -- ============================================================
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

    -- ============================================================
    -- 特性表
    -- ============================================================
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

    -- ============================================================
    -- 道具表
    -- ============================================================
    CREATE TABLE IF NOT EXISTS items (
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

    -- ============================================================
    -- 索引
    -- ============================================================
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

    PRAGMA foreign_keys = ON;
  `);

  // generations / game_versions / types 表已废弃，不再填充维度数据。
  // 世代直接以数字存储，游戏版本以 code 存储，属性以汉字存储。

  db.close();
}

/**
 * 迁移旧 schema 到新 schema。保留 moves/abilities/items 数据，
 * 删除旧的 pokemon 相关表。
 */
export function migrateSchema() {
  const db = openDatabase();
  db.exec(`
    PRAGMA foreign_keys = OFF;

    -- 删除旧的 pokemon 相关表
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
    DROP TABLE IF EXISTS pokemon_form_images;
    DROP TABLE IF EXISTS pokemon;

    PRAGMA foreign_keys = ON;
  `);
  db.close();

  // 重新创建所有表
  ensureSchema();
}

/**
 * 完全重建：删除所有表后重新创建。
 */
export function resetSchema() {
  const db = openDatabase();
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS pokemon_learnsets;
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
    DROP TABLE IF EXISTS game_versions;  -- legacy, no longer used
    DROP TABLE IF EXISTS types;  -- legacy, no longer used
    DROP TABLE IF EXISTS generations;  -- legacy, no longer used
    -- 旧表清理
    DROP TABLE IF EXISTS pokemon_moves;
    DROP TABLE IF EXISTS pokemon_evolution_members;
    DROP TABLE IF EXISTS pokemon_abilities;
    DROP TABLE IF EXISTS pokemon_types;
    DROP TABLE IF EXISTS pokemon_generation_regions;
    DROP TABLE IF EXISTS pokemon_generation_abilities;
    DROP TABLE IF EXISTS pokemon_generation_types;
    DROP TABLE IF EXISTS pokemon_generation_stats;
    DROP TABLE IF EXISTS pokemon_generation_records;
    DROP TABLE IF EXISTS pokemon_base_stats;
    DROP TABLE IF EXISTS image_assets;
    DROP TABLE IF EXISTS _image_assets_backup;
    PRAGMA foreign_keys = ON;
  `);
  db.close();
  ensureSchema();
}

// ── Query helpers ──

function statBlockFromRow(row: Record<string, unknown>): StatBlock | undefined {
  if (row.hp === null || row.hp === undefined) return undefined;
  return { hp: Number(row.hp), atk: Number(row.atk), def: Number(row.def), spa: Number(row.spa), spd: Number(row.spd), spe: Number(row.spe) };
}

function sourceFromRow(row: Record<string, unknown>): SourceMeta | undefined {
  return row.source_url || row.source_title || row.source_fetched_at
    ? { url: String(row.source_url ?? ""), title: String(row.source_title ?? ""), fetchedAt: String(row.source_fetched_at ?? "") }
    : undefined;
}

// ── Pokemon queries (N+1 eliminated) ──

/**
 * 列表查询：单次 JOIN 获取所有宝可梦的默认形态信息。
 */
export function listPokemonFromSqlite(filters?: { query?: string; type?: string; generation?: number }) {
  const db = openDatabase();
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters?.query) {
    conditions.push("(p.name_zh LIKE ? OR p.name_ja LIKE ? OR p.name_en LIKE ? OR p.slug LIKE ? OR CAST(p.dex_number AS TEXT) LIKE ?)");
    const v = `%${filters.query}%`;
    params.push(v, v, v, v, v);
  }
  if (filters?.type) {
    conditions.push(`EXISTS (
      SELECT 1 FROM pokemon_form_types pft2
      WHERE pft2.form_id = pf.id AND pft2.type_name = ?
    )`);
    params.push(filters.type);
  }
  if (filters?.generation) {
    conditions.push(`EXISTS (
      SELECT 1 FROM pokemon_generation_regions pgr
      WHERE pgr.pokemon_id = p.id AND pgr.generation = ?
    )`);
    params.push(filters.generation);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  // 主查询：pokemon + 默认形态 + 最新种族值（generation_end IS NULL 表示最新世代）
  const rows = db.prepare(`
    SELECT
      p.id, p.dex_number, p.slug, p.name_zh, p.name_ja, p.name_en,
      pf.id AS form_id,
      pfs.hp, pfs.atk, pfs.def, pfs.spa, pfs.spd, pfs.spe
    FROM pokemon p
    JOIN pokemon_forms pf ON pf.pokemon_id = p.id AND pf.is_default = 1
    LEFT JOIN pokemon_form_stats pfs ON pfs.form_id = pf.id AND pfs.generation_end IS NULL
    ${where}
    ORDER BY p.dex_number ASC
  `).all(...params) as Record<string, unknown>[];

  if (rows.length === 0) { db.close(); return []; }

  // 批量获取所有默认形态的属性
  const formIds = rows.map((r) => Number(r.form_id));
  const placeholders = formIds.map(() => "?").join(",");

  const typeRows = db.prepare(`
    SELECT pft.form_id, pft.type_name, pft.slot
    FROM pokemon_form_types pft
    WHERE pft.form_id IN (${placeholders})
    ORDER BY pft.form_id, pft.slot
  `).all(...formIds) as Record<string, unknown>[];

  const typeMap = new Map<number, string[]>();
  for (const r of typeRows) {
    const fid = Number(r.form_id);
    if (!typeMap.has(fid)) typeMap.set(fid, []);
    typeMap.get(fid)!.push(String(r.type_name));
  }

  // 批量获取所有默认形态的特性
  const abilityRows = db.prepare(`
    SELECT pfa.form_id, pfa.ability_name_zh, pfa.is_hidden
    FROM pokemon_form_abilities pfa
    WHERE pfa.form_id IN (${placeholders})
    ORDER BY pfa.form_id, pfa.slot
  `).all(...formIds) as Record<string, unknown>[];

  const abilityMap = new Map<number, { abilities: string[]; hidden?: string }>();
  for (const r of abilityRows) {
    const fid = Number(r.form_id);
    if (!abilityMap.has(fid)) abilityMap.set(fid, { abilities: [] });
    const entry = abilityMap.get(fid)!;
    if (Number(r.is_hidden)) {
      entry.hidden = String(r.ability_name_zh);
    } else {
      entry.abilities.push(String(r.ability_name_zh));
    }
  }

  // 批量获取所有默认形态的图片
  const imageRows = db.prepare(`
    SELECT pfi.form_id, pfi.image_kind, pfi.url, pfi.alt
    FROM pokemon_form_images pfi
    WHERE pfi.form_id IN (${placeholders})
  `).all(...formIds) as Record<string, unknown>[];

  const imageMap = new Map<number, Record<string, ImageAsset>>();
  for (const r of imageRows) {
    const fid = Number(r.form_id);
    if (!imageMap.has(fid)) imageMap.set(fid, {});
    imageMap.get(fid)![String(r.image_kind)] = { url: String(r.url), alt: r.alt ? String(r.alt) : undefined };
  }

  // 批量获取世代可用性
  const pokemonIds = rows.map((r) => Number(r.id));
  const pPlaceholders = pokemonIds.map(() => "?").join(",");
  const genRows = db.prepare(`
    SELECT pgr.pokemon_id, pgr.generation
    FROM pokemon_generation_regions pgr
    WHERE pgr.pokemon_id IN (${pPlaceholders})
    ORDER BY pgr.pokemon_id, pgr.generation
  `).all(...pokemonIds) as Record<string, unknown>[];

  const genMap = new Map<number, number[]>();
  for (const r of genRows) {
    const pid = Number(r.pokemon_id);
    if (!genMap.has(pid)) genMap.set(pid, []);
    const num = Number(r.generation);
    if (!genMap.get(pid)!.includes(num)) genMap.get(pid)!.push(num);
  }

  // 批量获取进化链（用于列表页分组）
  const evoRows = db.prepare(`
    SELECT ec.chain_id, ec.to_pokemon_id, ec.stage, ec.sort_order
    FROM evolution_chains ec
    WHERE ec.to_pokemon_id IN (${pPlaceholders})
    ORDER BY ec.chain_id, ec.sort_order
  `).all(...pokemonIds) as Record<string, unknown>[];

  const chainMap = new Map<number, number>(); // pokemonId -> chainId
  for (const r of evoRows) {
    chainMap.set(Number(r.to_pokemon_id), Number(r.chain_id));
  }

  db.close();

  return rows.map((row) => {
    const fid = Number(row.form_id);
    const pid = Number(row.id);
    const types = typeMap.get(fid) || [];
    const ab = abilityMap.get(fid) || { abilities: [] };
    const imgs = imageMap.get(fid) || {};
    return {
      id: pid,
      dexNumber: Number(row.dex_number),
      slug: String(row.slug),
      nameZh: String(row.name_zh),
      nameJa: row.name_ja ? String(row.name_ja) : undefined,
      nameEn: row.name_en ? String(row.name_en) : undefined,
      primaryType: types[0],
      secondaryType: types[1],
      abilities: ab.abilities,
      hiddenAbility: ab.hidden,
      baseStats: statBlockFromRow(row),
      image: imgs.official,
      shinyImage: imgs.shiny,
      generations: genMap.get(pid) || [],
      _chainId: chainMap.get(pid),
    } as PokemonSummary & { _chainId?: number };
  });
}

/**
 * 详情查询：获取宝可梦的完整信息（所有形态 + 进化链）。
 */
export function getPokemonFromSqlite(idOrSlug: string) {
  const db = openDatabase();

  // 查询 1: 基础信息
  const row = db.prepare(`
    SELECT p.*
    FROM pokemon p
    WHERE p.id = ? OR p.slug = ? OR p.name_zh = ? OR CAST(p.dex_number AS TEXT) = ?
    LIMIT 1
  `).get(idOrSlug, idOrSlug, idOrSlug, idOrSlug) as Record<string, unknown> | undefined;

  if (!row) { db.close(); return undefined; }

  const pokemonId = Number(row.id);

  // 查询 2: 所有形态
  const formRows = db.prepare(`
    SELECT pf.*
    FROM pokemon_forms pf
    WHERE pf.pokemon_id = ?
    ORDER BY pf.sort_order ASC
  `).all(pokemonId) as Record<string, unknown>[];

  const formIds = formRows.map((f) => Number(f.id));
  const fPlaceholders = formIds.map(() => "?").join(",") || "NULL";

  // 批量获取形态种族值（可能有多条，按世代区分）
  const fsRows = formIds.length ? db.prepare(`
    SELECT pfs.form_id, pfs.generation_start, pfs.generation_end,
           pfs.hp, pfs.atk, pfs.def, pfs.spa, pfs.spd, pfs.spe
    FROM pokemon_form_stats pfs
    WHERE pfs.form_id IN (${fPlaceholders})
    ORDER BY pfs.form_id, pfs.generation_start ASC
  `).all(...formIds) as Record<string, unknown>[] : [];

  const fsMap = new Map<number, Array<{ genStart?: number; genEnd?: number; stats: StatBlock }>>();
  for (const r of fsRows) {
    const fid = Number(r.form_id);
    if (!fsMap.has(fid)) fsMap.set(fid, []);
    fsMap.get(fid)!.push({
      genStart: r.generation_start !== null && r.generation_start !== undefined ? Number(r.generation_start) : undefined,
      genEnd: r.generation_end !== null && r.generation_end !== undefined ? Number(r.generation_end) : undefined,
      stats: statBlockFromRow(r)!,
    });
  }

  // 批量获取形态属性（可能有多条，按世代区分）
  const ftRows = formIds.length ? db.prepare(`
    SELECT pft.form_id, pft.type_name, pft.slot, pft.generation_start, pft.generation_end
    FROM pokemon_form_types pft
    WHERE pft.form_id IN (${fPlaceholders})
    ORDER BY pft.form_id, pft.generation_start ASC, pft.slot
  `).all(...formIds) as Record<string, unknown>[] : [];

  const ftMap = new Map<number, Array<{ genStart?: number; genEnd?: number; types: string[] }>>();
  for (const r of ftRows) {
    const fid = Number(r.form_id);
    const genStart = r.generation_start !== null && r.generation_start !== undefined ? Number(r.generation_start) : undefined;
    const genEnd = r.generation_end !== null && r.generation_end !== undefined ? Number(r.generation_end) : undefined;
    if (!ftMap.has(fid)) ftMap.set(fid, []);
    const arr = ftMap.get(fid)!;
    // Group by generation range
    let group = arr.find((g) => g.genStart === genStart && g.genEnd === genEnd);
    if (!group) {
      group = { genStart, genEnd, types: [] };
      arr.push(group);
    }
    group.types.push(String(r.type_name));
  }

  // 批量获取形态特性（可能有多条，按世代区分）
  const faRows = formIds.length ? db.prepare(`
    SELECT pfa.form_id, pfa.ability_name_zh, pfa.is_hidden, pfa.slot,
           pfa.generation_start, pfa.generation_end
    FROM pokemon_form_abilities pfa
    WHERE pfa.form_id IN (${fPlaceholders})
    ORDER BY pfa.form_id, pfa.generation_start ASC, pfa.slot
  `).all(...formIds) as Record<string, unknown>[] : [];

  const faMap = new Map<number, Array<{ genStart?: number; genEnd?: number; abilities: Array<{ nameZh: string; isHidden: boolean }> }>>();
  for (const r of faRows) {
    const fid = Number(r.form_id);
    const genStart = r.generation_start !== null && r.generation_start !== undefined ? Number(r.generation_start) : undefined;
    const genEnd = r.generation_end !== null && r.generation_end !== undefined ? Number(r.generation_end) : undefined;
    if (!faMap.has(fid)) faMap.set(fid, []);
    const arr = faMap.get(fid)!;
    let group = arr.find((g) => g.genStart === genStart && g.genEnd === genEnd);
    if (!group) {
      group = { genStart, genEnd, abilities: [] };
      arr.push(group);
    }
    group.abilities.push({ nameZh: String(r.ability_name_zh), isHidden: Boolean(Number(r.is_hidden)) });
  }

  // 批量获取形态图片
  const fiRows = formIds.length ? db.prepare(`
    SELECT pfi.form_id, pfi.image_kind, pfi.url, pfi.alt
    FROM pokemon_form_images pfi
    WHERE pfi.form_id IN (${fPlaceholders})
  `).all(...formIds) as Record<string, unknown>[] : [];

  const fiMap = new Map<number, Record<string, ImageAsset>>();
  for (const r of fiRows) {
    const fid = Number(r.form_id);
    if (!fiMap.has(fid)) fiMap.set(fid, {});
    fiMap.get(fid)![String(r.image_kind)] = { url: String(r.url), alt: r.alt ? String(r.alt) : undefined };
  }

  const forms: PokemonFormEntry[] = formRows.map((f) => {
    const fid = Number(f.id);
    // Resolve stats: pick the latest (no generation_end) or the first entry
    const statEntries = fsMap.get(fid) || [];
    const latestStat = statEntries.find((s) => s.genEnd === undefined) || statEntries[0];
    // Resolve types: pick the latest or the first entry
    const typeEntries = ftMap.get(fid) || [];
    const latestType = typeEntries.find((t) => t.genEnd === undefined) || typeEntries[0];
    // Resolve abilities: pick the latest or the first entry
    const abilityEntries = faMap.get(fid) || [];
    const latestAbility = abilityEntries.find((a) => a.genEnd === undefined) || abilityEntries[0];

    const entry: PokemonFormEntry = {
      formKey: String(f.form_key),
      nameZh: String(f.name_zh),
      formType: String(f.form_type),
      isDefault: Boolean(Number(f.is_default)),
      sortOrder: Number(f.sort_order),
      primaryType: latestType?.types[0],
      secondaryType: latestType?.types[1],
      abilities: latestAbility?.abilities || [],
      baseStats: latestStat?.stats,
      images: fiMap.get(fid) || {},
    };

    // Attach generation variants if there are multiple entries
    if (statEntries.length > 1) {
      entry.statVariants = statEntries.map((s) => ({
        generationStart: s.genStart,
        generationEnd: s.genEnd,
        baseStats: s.stats,
      }));
    }
    if (typeEntries.length > 1) {
      entry.typeVariants = typeEntries.map((t) => ({
        generationStart: t.genStart,
        generationEnd: t.genEnd,
        primaryType: t.types[0],
        secondaryType: t.types[1],
      }));
    }
    if (abilityEntries.length > 1) {
      entry.abilityVariants = abilityEntries.map((a) => ({
        generationStart: a.genStart,
        generationEnd: a.genEnd,
        abilities: a.abilities,
      }));
    }

    return entry;
  });

  // 查询 3: 进化链
  // 先找到该宝可梦所属的 chain_id
  const chainRow = db.prepare(`
    SELECT chain_id FROM evolution_chains WHERE to_pokemon_id = ? LIMIT 1
  `).get(pokemonId) as Record<string, unknown> | undefined;

  let evolutionChain: EvolutionStep[] = [];
  if (chainRow) {
    const chainId = Number(chainRow.chain_id);
    const evoRows = db.prepare(`
      SELECT ec.*,
        pf.name_zh AS from_name, pt.name_zh AS to_name,
        fi_to.url AS to_image_url, fi_to.alt AS to_image_alt
      FROM evolution_chains ec
      LEFT JOIN pokemon pf ON pf.id = ec.from_pokemon_id
      LEFT JOIN pokemon pt ON pt.id = ec.to_pokemon_id
      LEFT JOIN pokemon_forms pf_to ON pf_to.pokemon_id = ec.to_pokemon_id AND pf_to.is_default = 1
      LEFT JOIN pokemon_form_images fi_to ON fi_to.form_id = pf_to.id AND fi_to.image_kind = 'official'
      WHERE ec.chain_id = ?
      ORDER BY ec.sort_order ASC
    `).all(chainId) as Record<string, unknown>[];

    evolutionChain = evoRows.map((e) => {
      // 获取 to_pokemon 的属性
      const toFormRow = db.prepare(`
        SELECT pf.id FROM pokemon_forms pf WHERE pf.pokemon_id = ? AND pf.is_default = 1 LIMIT 1
      `).get(Number(e.to_pokemon_id)) as Record<string, unknown> | undefined;
      let toTypes: string[] = [];
      if (toFormRow) {
        const tRows = db.prepare(`
          SELECT pft.type_name FROM pokemon_form_types pft
          WHERE pft.form_id = ? ORDER BY pft.slot
        `).all(Number(toFormRow.id)) as Record<string, unknown>[];
        toTypes = tRows.map((t) => String(t.type_name));
      }
      return {
        fromPokemonId: e.from_pokemon_id ? Number(e.from_pokemon_id) : undefined,
        fromNameZh: e.from_name ? String(e.from_name) : undefined,
        fromFormKey: e.from_form_key ? String(e.from_form_key) : undefined,
        toPokemonId: Number(e.to_pokemon_id),
        toNameZh: String(e.to_name),
        toFormKey: e.to_form_key ? String(e.to_form_key) : undefined,
        stage: Number(e.stage),
        method: e.evolution_method ? String(e.evolution_method) : undefined,
        condition: e.evolution_condition ? String(e.evolution_condition) : undefined,
        item: e.evolution_item ? String(e.evolution_item) : undefined,
        level: e.evolution_level !== null ? Number(e.evolution_level) : undefined,
        toTypes,
        toImage: e.to_image_url ? { url: String(e.to_image_url), alt: e.to_image_alt ? String(e.to_image_alt) : undefined } : undefined,
      };
    });
  }

  // 查询 4: 世代可用性
  const genRegRows = db.prepare(`
    SELECT pgr.generation FROM pokemon_generation_regions pgr
    WHERE pgr.pokemon_id = ?
    ORDER BY pgr.generation
  `).all(pokemonId) as Record<string, unknown>[];
  const generations = [...new Set(genRegRows.map((r) => Number(r.generation)))];

  db.close();

  // 组装默认形态信息到顶层
  const defaultForm = forms.find((f) => f.isDefault) || forms[0];

  const result: PokemonEntry = {
    id: pokemonId,
    dexNumber: Number(row.dex_number),
    slug: String(row.slug),
    nameZh: String(row.name_zh),
    nameJa: row.name_ja ? String(row.name_ja) : undefined,
    nameEn: row.name_en ? String(row.name_en) : undefined,
    primaryType: defaultForm?.primaryType,
    secondaryType: defaultForm?.secondaryType,
    abilities: defaultForm?.abilities.filter((a) => !a.isHidden).map((a) => a.nameZh) || [],
    hiddenAbility: defaultForm?.abilities.find((a) => a.isHidden)?.nameZh,
    baseStats: defaultForm?.baseStats,
    image: defaultForm?.images.official,
    shinyImage: defaultForm?.images.shiny,
    generations,
    category: row.category ? String(row.category) : undefined,
    heightM: row.height_m !== null ? Number(row.height_m) : undefined,
    weightKg: row.weight_kg !== null ? Number(row.weight_kg) : undefined,
    forms,
    evolutionChain,
    source: sourceFromRow(row),
  };

  return result;
}

/**
 * 获取宝可梦的招式学习列表（按世代 + 形态）。
 */
export function getPokemonLearnset(pokemonId: number, generation: number, formKey = "default") {
  const db = openDatabase();
  const rows = db.prepare(`
    SELECT pl.move_name_zh, pl.learn_method, pl.level, pl.tm_number, pl.notes,
      m.type_name, m.category AS move_category,
      m.power AS move_power, m.accuracy AS move_accuracy, m.pp AS move_pp, m.id AS move_id
    FROM pokemon_learnsets pl
    LEFT JOIN moves m ON m.id = pl.move_id
    WHERE pl.pokemon_id = ? AND pl.generation = ? AND pl.form_key = ?
    ORDER BY pl.learn_method, pl.sort_order
  `).all(pokemonId, generation, formKey) as Record<string, unknown>[];
  db.close();

  return rows.map((r) => ({
    moveId: r.move_id !== null ? Number(r.move_id) : undefined,
    moveNameZh: String(r.move_name_zh),
    learnMethod: String(r.learn_method),
    level: r.level !== null ? Number(r.level) : undefined,
    tmNumber: r.tm_number ? String(r.tm_number) : undefined,
    moveType: r.type_name ? String(r.type_name) : undefined,
    moveCategory: r.move_category ? String(r.move_category) : undefined,
    movePower: r.move_power !== null ? Number(r.move_power) : undefined,
    moveAccuracy: r.move_accuracy !== null ? Number(r.move_accuracy) : undefined,
    movePP: r.move_pp !== null ? Number(r.move_pp) : undefined,
  } as LearnsetRecord));
}

// ── Move queries ──

function hydrateMoveRow(db: DatabaseSync, row: Record<string, unknown>): MoveEntry {
  const generations = db.prepare(`
    SELECT mgr.*
    FROM move_generation_records mgr
    WHERE mgr.move_id = ?
    ORDER BY mgr.generation ASC
  `).all(String(row.id)) as Record<string, unknown>[];

  return {
    id: String(row.id),
    number: row.number !== null && row.number !== undefined ? Number(row.number) : undefined,
    nameZh: String(row.name_zh),
    nameJa: row.name_ja ? String(row.name_ja) : undefined,
    nameEn: row.name_en ? String(row.name_en) : undefined,
    type: row.type_name ? String(row.type_name) : undefined,
    category: row.category ? String(row.category) : undefined,
    power: row.power !== null ? Number(row.power) : undefined,
    accuracy: row.accuracy !== null && row.accuracy !== undefined ? Number(row.accuracy) : undefined,
    pp: row.pp !== null ? Number(row.pp) : undefined,
    description: row.description ? String(row.description) : undefined,
    effectDetail: row.effect_detail ? String(row.effect_detail) : undefined,
    introducedGeneration: row.introduced_generation !== null && row.introduced_generation !== undefined ? Number(row.introduced_generation) : undefined,
    generations: generations.map((g) => {
      const code = g.game_version_code ? String(g.game_version_code) : undefined;
      return {
        generation: Number(g.generation),
        gameVersionCode: code,
        gameVersionName: code ? GAME_VERSION_NAMES.get(code) : undefined,
        description: g.description ? String(g.description) : "",
        notes: g.notes ? String(g.notes) : undefined,
      };
    }),
    source: sourceFromRow(row),
  };
}

export function listMovesFromSqlite(filters?: { query?: string; type?: string; generation?: number }) {
  const db = openDatabase();
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filters?.query) {
    conditions.push("(m.name_zh LIKE ? OR m.name_ja LIKE ? OR m.name_en LIKE ? OR CAST(m.id AS TEXT) LIKE ?)");
    const v = `%${filters.query}%`;
    params.push(v, v, v, v);
  }
  if (filters?.type) {
    conditions.push("m.type_name = ?");
    params.push(filters.type);
  }
  if (filters?.generation) {
    conditions.push("EXISTS (SELECT 1 FROM move_generation_records mgr WHERE mgr.move_id = m.id AND mgr.generation = ?)");
    params.push(filters.generation);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT m.*
    FROM moves m
    ${where}
    ORDER BY m.name_zh ASC
  `).all(...params) as Record<string, unknown>[];
  const result = rows.map((r) => hydrateMoveRow(db, r));
  db.close();
  return result;
}

export function getMoveFromSqlite(idOrSlug: string) {
  const db = openDatabase();
  const row = db.prepare(`
    SELECT m.*
    FROM moves m
    WHERE m.id = ? OR m.name_zh = ?
    LIMIT 1
  `).get(idOrSlug, idOrSlug) as Record<string, unknown> | undefined;
  const result = row ? hydrateMoveRow(db, row) : undefined;
  db.close();
  return result;
}

// ── Ability queries ──

function hydrateAbilityRow(db: DatabaseSync, row: Record<string, unknown>): AbilityEntry {
  const generations = db.prepare(`
    SELECT agr.*
    FROM ability_generation_records agr
    WHERE agr.ability_id = ?
    ORDER BY agr.generation ASC
  `).all(String(row.id)) as Record<string, unknown>[];

  return {
    id: String(row.id),
    number: row.number !== null && row.number !== undefined ? Number(row.number) : undefined,
    nameZh: String(row.name_zh),
    nameJa: row.name_ja ? String(row.name_ja) : undefined,
    nameEn: row.name_en ? String(row.name_en) : undefined,
    description: row.description ? String(row.description) : undefined,
    effectDetail: row.effect_detail ? String(row.effect_detail) : undefined,
    introducedGeneration: row.introduced_generation !== null && row.introduced_generation !== undefined ? Number(row.introduced_generation) : undefined,
    generations: generations.map((g) => {
      const code = g.game_version_code ? String(g.game_version_code) : undefined;
      return {
        generation: Number(g.generation),
        gameVersionCode: code,
        gameVersionName: code ? GAME_VERSION_NAMES.get(code) : undefined,
        description: g.description ? String(g.description) : "",
        notes: g.notes ? String(g.notes) : undefined,
      };
    }),
    source: sourceFromRow(row),
  };
}

export function listAbilitiesFromSqlite(filters?: { query?: string; generation?: number }) {
  const db = openDatabase();
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filters?.query) {
    conditions.push("(a.name_zh LIKE ? OR a.name_ja LIKE ? OR a.name_en LIKE ?)");
    const v = `%${filters.query}%`;
    params.push(v, v, v);
  }
  if (filters?.generation) {
    conditions.push("EXISTS (SELECT 1 FROM ability_generation_records agr WHERE agr.ability_id = a.id AND agr.generation = ?)");
    params.push(filters.generation);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT a.*
    FROM abilities a
    ${where}
    ORDER BY a.number ASC, a.name_zh ASC
  `).all(...params) as Record<string, unknown>[];
  const result = rows.map((r) => hydrateAbilityRow(db, r));
  db.close();
  return result;
}

export function getAbilityFromSqlite(idOrName: string) {
  const db = openDatabase();
  const row = db.prepare(`
    SELECT a.*
    FROM abilities a
    WHERE a.id = ? OR a.name_zh = ?
    LIMIT 1
  `).get(idOrName, idOrName) as Record<string, unknown> | undefined;
  const result = row ? hydrateAbilityRow(db, row) : undefined;
  db.close();
  return result;
}

// ── Item queries ──

export function listItemsFromSqlite() {
  const db = openDatabase();
  const rows = db.prepare("SELECT * FROM items ORDER BY category ASC, name_zh ASC").all() as Record<string, unknown>[];
  db.close();
  return rows.map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    nameZh: String(row.name_zh),
    nameJa: row.name_ja ? String(row.name_ja) : undefined,
    nameEn: row.name_en ? String(row.name_en) : undefined,
    category: row.category ? String(row.category) : undefined,
    effectSummary: row.effect_summary ? String(row.effect_summary) : undefined,
    source: sourceFromRow(row),
  } as ItemEntry));
}

export function getItemFromSqlite(idOrSlug: string) {
  const db = openDatabase();
  const row = db.prepare("SELECT * FROM items WHERE id = ? OR legacy_id = ? OR slug = ? OR name_zh = ? LIMIT 1").get(idOrSlug, idOrSlug, idOrSlug, idOrSlug) as Record<string, unknown> | undefined;
  if (!row) { db.close(); return undefined; }
  db.close();
  return {
    id: String(row.id),
    slug: String(row.slug),
    nameZh: String(row.name_zh),
    nameJa: row.name_ja ? String(row.name_ja) : undefined,
    nameEn: row.name_en ? String(row.name_en) : undefined,
    category: row.category ? String(row.category) : undefined,
    effectSummary: row.effect_summary ? String(row.effect_summary) : undefined,
    source: sourceFromRow(row),
  } as ItemEntry;
}

// ── Utility ──

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

// ── Export helpers for crawler ──

export { normalizeTypeName, splitTypeNames, typeLegacyId, GENERATIONS, GAME_VERSIONS, TYPE_NAMES, TYPE_ALIASES };