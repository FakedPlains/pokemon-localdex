-- ============================================================
-- Pokemon LocalDex — Cloudflare D1 Schema
-- 与 packages/store/drizzle-schema/src/index.ts 保持同步
-- D1 使用 SQLite 语法，直接兼容
-- ============================================================

PRAGMA foreign_keys = OFF;

-- ============================================================
-- 宝可梦主表
-- ============================================================
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

-- ============================================================
-- 宝可梦形态（核心：形态优先架构）
-- ============================================================
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

-- ============================================================
-- 进化链（含进化条件）
-- ============================================================
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

-- ============================================================
-- 宝可梦可学招式
-- ============================================================
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
  version_exclusive INTEGER NOT NULL DEFAULT 0,
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
  version_exclusive INTEGER NOT NULL DEFAULT 0,
  UNIQUE (ability_id, generation)
);

-- ============================================================
-- 道具表
-- ============================================================
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

-- ============================================================
-- 战斗效果结构化数据
-- 所有枚举字段存储整数，映射见 shared-types/src/battle-effects.ts
-- ============================================================

-- 招式标签（接触/声音/拳类等）
-- 一对多：一个招式可带多个标签
CREATE TABLE IF NOT EXISTS move_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  move_id INTEGER NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
  flag INTEGER NOT NULL,           -- MOVE_FLAG 枚举值
  UNIQUE (move_id, flag)
);

-- 特性战斗效果
CREATE TABLE IF NOT EXISTS ability_battle_effects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ability_id INTEGER NOT NULL REFERENCES abilities(id) ON DELETE CASCADE,
  effect_type INTEGER NOT NULL,    -- EFFECT_TYPE 枚举
  trigger INTEGER NOT NULL DEFAULT 1,  -- TRIGGER 枚举, 1=ALWAYS
  target INTEGER NOT NULL DEFAULT 1,   -- TARGET 枚举, 1=SELF
  modifier_type INTEGER NOT NULL,  -- MODIFIER_TYPE 枚举
  modifier_value REAL,             -- 倍率/等级数等主数值
  affected_stat INTEGER,           -- BATTLE_STAT 枚举
  affected_type INTEGER,           -- 属性 ID（TYPE_DEFS 的 id）
  affected_move_flag INTEGER,      -- MOVE_FLAG 枚举
  affected_move_category INTEGER,  -- MOVE_CATEGORY 枚举 (1=物理,2=特殊,3=变化)
  params TEXT,                     -- JSON 扩展参数
  generation_start INTEGER NOT NULL DEFAULT 1,
  generation_end INTEGER,          -- NULL = 当前仍有效
  priority INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

-- 道具战斗效果
CREATE TABLE IF NOT EXISTS item_battle_effects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  effect_type INTEGER NOT NULL,
  trigger INTEGER NOT NULL DEFAULT 1,
  target INTEGER NOT NULL DEFAULT 1,
  modifier_type INTEGER NOT NULL,
  modifier_value REAL,
  affected_stat INTEGER,
  affected_type INTEGER,
  affected_move_flag INTEGER,
  affected_move_category INTEGER,
  params TEXT,
  consumable INTEGER NOT NULL DEFAULT 0,   -- 是否消耗品
  species_restriction TEXT,                -- JSON 数组，限定宝可梦
  generation_start INTEGER NOT NULL DEFAULT 1,
  generation_end INTEGER,
  priority INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

-- 招式战斗效果（反作用力、多段、特殊公式等）
CREATE TABLE IF NOT EXISTS move_battle_effects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  move_id INTEGER NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
  effect_type INTEGER NOT NULL,
  trigger INTEGER NOT NULL DEFAULT 7,  -- TRIGGER 枚举, 7=ON_ATTACK
  target INTEGER NOT NULL DEFAULT 2,   -- TARGET 枚举, 2=OPPONENT
  modifier_type INTEGER NOT NULL,
  modifier_value REAL,
  affected_stat INTEGER,
  affected_type INTEGER,
  affected_move_flag INTEGER,
  affected_move_category INTEGER,
  params TEXT,
  generation_start INTEGER NOT NULL DEFAULT 1,
  generation_end INTEGER,
  priority INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

-- ============================================================
-- Pokémon Champions 赛季 / 赛制 / 可用池
-- ============================================================
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

-- ============================================================
-- 索引
-- ============================================================
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
  form_id,
  move_name_zh,
  generation,
  COALESCE(game_version_code, ''),
  learn_method,
  COALESCE(level, -1),
  COALESCE(tm_number, '')
);
CREATE INDEX IF NOT EXISTS idx_pokemon_moves_lookup ON pokemon_moves(pokemon_id, generation, form_id, game_version_code, learn_method, sort_order);
CREATE INDEX IF NOT EXISTS idx_pokemon_moves_form_gen ON pokemon_moves(form_id, generation);
CREATE INDEX IF NOT EXISTS idx_pokemon_moves_move ON pokemon_moves(move_id);

CREATE INDEX IF NOT EXISTS idx_moves_name_zh ON moves(name_zh);
CREATE INDEX IF NOT EXISTS idx_moves_type ON moves(type_name);
CREATE INDEX IF NOT EXISTS idx_moves_number ON moves(number);
CREATE INDEX IF NOT EXISTS idx_moves_sort ON moves(CASE WHEN number IS NULL OR number = 0 THEN 1 ELSE 0 END, number);
CREATE INDEX IF NOT EXISTS idx_abilities_name ON abilities(name_zh);
CREATE INDEX IF NOT EXISTS idx_abilities_number ON abilities(number);
CREATE INDEX IF NOT EXISTS idx_items_name_zh ON items(name_zh);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);

CREATE INDEX IF NOT EXISTS idx_champions_seasons_regulation ON champions_seasons(regulation_id);
CREATE INDEX IF NOT EXISTS idx_champions_regulation_pokemon_regulation ON champions_regulation_pokemon(regulation_id);
CREATE INDEX IF NOT EXISTS idx_champions_regulation_pokemon_pokemon ON champions_regulation_pokemon(pokemon_id);
CREATE INDEX IF NOT EXISTS idx_champions_regulation_items_regulation ON champions_regulation_items(regulation_id);

CREATE INDEX IF NOT EXISTS idx_move_flags_move ON move_flags(move_id);
CREATE INDEX IF NOT EXISTS idx_move_flags_flag ON move_flags(flag);
CREATE INDEX IF NOT EXISTS idx_abe_ability ON ability_battle_effects(ability_id);
CREATE INDEX IF NOT EXISTS idx_abe_effect_type ON ability_battle_effects(effect_type);
CREATE INDEX IF NOT EXISTS idx_abe_trigger ON ability_battle_effects(trigger);
CREATE INDEX IF NOT EXISTS idx_ibe_item ON item_battle_effects(item_id);
CREATE INDEX IF NOT EXISTS idx_ibe_effect_type ON item_battle_effects(effect_type);
CREATE INDEX IF NOT EXISTS idx_mbe_move ON move_battle_effects(move_id);
CREATE INDEX IF NOT EXISTS idx_mbe_effect_type ON move_battle_effects(effect_type);

PRAGMA foreign_keys = ON;
