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
-- 场地效果（天气、场地、异常状态等）— 主实体表 + 效果明细 + 世代记录
-- ============================================================

-- 效果类型枚举（field_effect_kind）：
--   1 = weather    天气
--   2 = terrain    场地
--   3 = status     异常状态（烧伤/麻痹/中毒等）
--   4 = side       场侧效果（反射壁/光墙/撒菱等）
--   5 = field      全场效果（重力/戏法空间/魔法空间等）

-- 主实体表：每种天气/场地/异常状态一条记录
CREATE TABLE IF NOT EXISTS field_effects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind INTEGER NOT NULL,                 -- 效果大类 (1~5)
  key TEXT NOT NULL,                     -- 程序内标识，如 "sun"、"electric"、"burn"、"reflect"
  name_zh TEXT NOT NULL,                 -- 中文名，如 "晴天"、"电气场地"、"烧伤"
  name_en TEXT,                          -- 英文名，如 "Sunny"、"Electric Terrain"、"Burn"
  name_ja TEXT,                          -- 日文名
  description TEXT,                      -- 当前最新世代的效果描述
  introduced_generation INTEGER,         -- 初登场世代
  max_turns INTEGER,                     -- 默认最大持续回合数（NULL = 无固定回合限制）
  max_layers INTEGER,                    -- 最大叠加层数（如撒菱 3 层；NULL = 不可叠加）
  source_url TEXT,
  source_title TEXT,
  source_fetched_at TEXT,
  UNIQUE (kind, key)
);

-- 效果对战明细表：存储该效果对伤害计算的具体数值影响
-- 结构复用 ability/item/move_battle_effects 的枚举体系
CREATE TABLE IF NOT EXISTS field_effect_modifiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_effect_id INTEGER NOT NULL REFERENCES field_effects(id) ON DELETE CASCADE,
  effect_type INTEGER NOT NULL,          -- EFFECT_TYPE 枚举（如 201=威力倍率, 101=能力值倍率）
  trigger INTEGER NOT NULL DEFAULT 1,    -- TRIGGER 枚举
  target INTEGER NOT NULL DEFAULT 7,     -- TARGET 枚举, 7=FIELD 全场
  modifier_type INTEGER NOT NULL,        -- MODIFIER_TYPE 枚举
  modifier_value REAL,                   -- 倍率/数值
  affected_stat INTEGER,                 -- BATTLE_STAT 枚举
  affected_type INTEGER,                 -- 属性 ID（TYPE_DEFS 的 id）
  affected_move_flag INTEGER,            -- MOVE_FLAG 枚举
  affected_move_category INTEGER,        -- MOVE_CATEGORY 枚举
  condition_key TEXT,                    -- 额外条件标识（如 "grounded" 表示仅接地）
  params TEXT,                           -- JSON 扩展参数
  generation_start INTEGER NOT NULL DEFAULT 1,
  generation_end INTEGER,                -- NULL = 当前仍有效
  priority INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

-- 世代差异记录：记录效果在不同世代的描述/规则变化
CREATE TABLE IF NOT EXISTS field_effect_generation_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_effect_id INTEGER NOT NULL REFERENCES field_effects(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  game_version_code TEXT,
  description TEXT,                      -- 该世代的效果描述
  notes TEXT,                            -- 备注（如"第五世代前为冰雹而非雪"）
  version_exclusive INTEGER NOT NULL DEFAULT 0,
  UNIQUE (field_effect_id, generation, COALESCE(game_version_code, ''))
);

-- 场地效果来源关联表：记录哪些特性/招式/道具能触发或维持某个场地效果
-- source_type: 1=ability, 2=move, 3=item
-- trigger_method: 1=登场设置, 2=使用设置, 3=命中附带, 4=接触附带,
--                 5=延长持续, 6=维持/增强, 7=移除, 8=阻止
CREATE TABLE IF NOT EXISTS field_effect_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_effect_id INTEGER NOT NULL REFERENCES field_effects(id) ON DELETE CASCADE,
  source_type INTEGER NOT NULL,           -- 来源大类：1=ability, 2=move, 3=item
  source_id INTEGER NOT NULL,             -- abilities.id / moves.id / items.id
  trigger_method INTEGER NOT NULL DEFAULT 2,  -- 触发方式枚举
  layers INTEGER,                         -- 每次触发叠加层数（NULL=不适用）
  turns_override INTEGER,                 -- 回合数覆盖（延长道具等；NULL=使用默认）
  condition_key TEXT,                     -- 附加触发条件标识
  probability REAL,                       -- 触发概率（NULL或1.0=必定触发）
  generation_start INTEGER NOT NULL DEFAULT 1,
  generation_end INTEGER,                 -- NULL = 当前仍有效
  note TEXT,
  UNIQUE (field_effect_id, source_type, source_id, trigger_method, COALESCE(condition_key, ''))
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
-- Champions 使用率统计（数据源: pokechamdb.com）
-- 优先通过 ID 关联；关联失败时 ID 为 NULL，保留原始名称供后续修复
-- ============================================================

-- 宝可梦使用率排名（主表）
CREATE TABLE IF NOT EXISTS champions_usage_pokemon (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES champions_seasons(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  event_id TEXT NOT NULL DEFAULT '',
  pokemon_id INTEGER REFERENCES pokemon(id) ON DELETE SET NULL,
  form_id INTEGER REFERENCES pokemon_forms(id) ON DELETE SET NULL,
  pokemon_slug TEXT NOT NULL,
  rank INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  UNIQUE (season_id, format, event_id, pokemon_slug)
);

-- 招式使用率
CREATE TABLE IF NOT EXISTS champions_usage_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usage_pokemon_id INTEGER NOT NULL REFERENCES champions_usage_pokemon(id) ON DELETE CASCADE,
  move_id INTEGER REFERENCES moves(id) ON DELETE SET NULL,
  move_name_zh TEXT NOT NULL,
  rank INTEGER NOT NULL,
  percentage REAL NOT NULL,
  UNIQUE (usage_pokemon_id, move_name_zh)
);

-- 道具使用率
CREATE TABLE IF NOT EXISTS champions_usage_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usage_pokemon_id INTEGER NOT NULL REFERENCES champions_usage_pokemon(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_name_zh TEXT NOT NULL,
  rank INTEGER NOT NULL,
  percentage REAL NOT NULL,
  UNIQUE (usage_pokemon_id, item_name_zh)
);

-- 特性使用率
CREATE TABLE IF NOT EXISTS champions_usage_abilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usage_pokemon_id INTEGER NOT NULL REFERENCES champions_usage_pokemon(id) ON DELETE CASCADE,
  ability_id INTEGER REFERENCES abilities(id) ON DELETE SET NULL,
  ability_name_zh TEXT NOT NULL,
  rank INTEGER NOT NULL,
  percentage REAL NOT NULL,
  UNIQUE (usage_pokemon_id, ability_name_zh)
);

-- 性格使用率（nature_id 对应 shared-types NATURE_DEFS 枚举 1-25）
CREATE TABLE IF NOT EXISTS champions_usage_natures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usage_pokemon_id INTEGER NOT NULL REFERENCES champions_usage_pokemon(id) ON DELETE CASCADE,
  nature_id INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  percentage REAL NOT NULL,
  UNIQUE (usage_pokemon_id, nature_id)
);

-- 队友排名
CREATE TABLE IF NOT EXISTS champions_usage_partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usage_pokemon_id INTEGER NOT NULL REFERENCES champions_usage_pokemon(id) ON DELETE CASCADE,
  partner_pokemon_id INTEGER REFERENCES pokemon(id) ON DELETE SET NULL,
  partner_slug TEXT NOT NULL,
  rank INTEGER NOT NULL,
  UNIQUE (usage_pokemon_id, partner_slug)
);

-- EV 分布排名
CREATE TABLE IF NOT EXISTS champions_usage_ev_spreads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usage_pokemon_id INTEGER NOT NULL REFERENCES champions_usage_pokemon(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  percentage REAL NOT NULL,
  hp INTEGER NOT NULL DEFAULT 0,
  atk INTEGER NOT NULL DEFAULT 0,
  def INTEGER NOT NULL DEFAULT 0,
  sp_atk INTEGER NOT NULL DEFAULT 0,
  sp_def INTEGER NOT NULL DEFAULT 0,
  speed INTEGER NOT NULL DEFAULT 0,
  UNIQUE (usage_pokemon_id, hp, atk, def, sp_atk, sp_def, speed)
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

CREATE INDEX IF NOT EXISTS idx_usage_pokemon_season ON champions_usage_pokemon(season_id, format);
CREATE INDEX IF NOT EXISTS idx_usage_pokemon_pid ON champions_usage_pokemon(pokemon_id);
CREATE INDEX IF NOT EXISTS idx_usage_moves_parent ON champions_usage_moves(usage_pokemon_id);
CREATE INDEX IF NOT EXISTS idx_usage_moves_mid ON champions_usage_moves(move_id);
CREATE INDEX IF NOT EXISTS idx_usage_items_parent ON champions_usage_items(usage_pokemon_id);
CREATE INDEX IF NOT EXISTS idx_usage_items_iid ON champions_usage_items(item_id);
CREATE INDEX IF NOT EXISTS idx_usage_abilities_parent ON champions_usage_abilities(usage_pokemon_id);
CREATE INDEX IF NOT EXISTS idx_usage_abilities_aid ON champions_usage_abilities(ability_id);
CREATE INDEX IF NOT EXISTS idx_usage_natures_parent ON champions_usage_natures(usage_pokemon_id);
CREATE INDEX IF NOT EXISTS idx_usage_partners_parent ON champions_usage_partners(usage_pokemon_id);
CREATE INDEX IF NOT EXISTS idx_usage_ev_spreads_parent ON champions_usage_ev_spreads(usage_pokemon_id);

CREATE INDEX IF NOT EXISTS idx_move_flags_move ON move_flags(move_id);
CREATE INDEX IF NOT EXISTS idx_move_flags_flag ON move_flags(flag);
CREATE INDEX IF NOT EXISTS idx_abe_ability ON ability_battle_effects(ability_id);
CREATE INDEX IF NOT EXISTS idx_abe_effect_type ON ability_battle_effects(effect_type);
CREATE INDEX IF NOT EXISTS idx_abe_trigger ON ability_battle_effects(trigger);
CREATE INDEX IF NOT EXISTS idx_ibe_item ON item_battle_effects(item_id);
CREATE INDEX IF NOT EXISTS idx_ibe_effect_type ON item_battle_effects(effect_type);
CREATE INDEX IF NOT EXISTS idx_mbe_move ON move_battle_effects(move_id);
CREATE INDEX IF NOT EXISTS idx_mbe_effect_type ON move_battle_effects(effect_type);

CREATE INDEX IF NOT EXISTS idx_fe_kind ON field_effects(kind);
CREATE INDEX IF NOT EXISTS idx_fe_key ON field_effects(key);
CREATE INDEX IF NOT EXISTS idx_fe_name_zh ON field_effects(name_zh);
CREATE INDEX IF NOT EXISTS idx_fem_field_effect ON field_effect_modifiers(field_effect_id);
CREATE INDEX IF NOT EXISTS idx_fem_effect_type ON field_effect_modifiers(effect_type);
CREATE INDEX IF NOT EXISTS idx_fegr_field_effect ON field_effect_generation_records(field_effect_id);
CREATE INDEX IF NOT EXISTS idx_fes_field_effect ON field_effect_sources(field_effect_id);
CREATE INDEX IF NOT EXISTS idx_fes_source ON field_effect_sources(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_fes_source_type ON field_effect_sources(source_type);

PRAGMA foreign_keys = ON;
