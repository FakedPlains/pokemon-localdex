-- ============================================================
-- Pokemon LocalDex — Supabase (PostgreSQL) Schema
-- 从 SQLite 迁移而来，保持表结构一致
-- ============================================================

-- ============================================================
-- 招式表（先建，因为 learnsets 和 form_abilities 会引用）
-- ============================================================
CREATE TABLE IF NOT EXISTS moves (
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
  move_id INTEGER NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  game_version_code TEXT NOT NULL DEFAULT '',
  description TEXT,
  notes TEXT,
  version_exclusive INTEGER NOT NULL DEFAULT 0,
  UNIQUE (move_id, generation, game_version_code)
);

-- ============================================================
-- 特性表（先建，因为 form_abilities 会引用）
-- ============================================================
CREATE TABLE IF NOT EXISTS abilities (
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  game_version_code TEXT,
  description TEXT,
  notes TEXT,
  version_exclusive INTEGER NOT NULL DEFAULT 0,
  UNIQUE (item_id, generation)
);

-- ============================================================
-- 宝可梦主表
-- ============================================================
CREATE TABLE IF NOT EXISTS pokemon (
  id SERIAL PRIMARY KEY,
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
-- 宝可梦形态
-- ============================================================
CREATE TABLE IF NOT EXISTS pokemon_forms (
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
  form_id INTEGER NOT NULL REFERENCES pokemon_forms(id) ON DELETE CASCADE,
  type_name TEXT NOT NULL,
  slot INTEGER NOT NULL,
  generation_start INTEGER,
  generation_end INTEGER,
  UNIQUE (form_id, slot, generation_start)
);

CREATE TABLE IF NOT EXISTS pokemon_form_abilities (
  id SERIAL PRIMARY KEY,
  form_id INTEGER NOT NULL REFERENCES pokemon_forms(id) ON DELETE CASCADE,
  ability_id INTEGER REFERENCES abilities(id) ON DELETE SET NULL,
  ability_name_zh TEXT NOT NULL,
  slot INTEGER NOT NULL,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  generation_start INTEGER,
  generation_end INTEGER,
  UNIQUE (form_id, slot, generation_start)
);

CREATE TABLE IF NOT EXISTS pokemon_form_images (
  id SERIAL PRIMARY KEY,
  form_id INTEGER NOT NULL REFERENCES pokemon_forms(id) ON DELETE CASCADE,
  image_kind TEXT NOT NULL,
  url TEXT NOT NULL,
  alt TEXT,
  UNIQUE (form_id, image_kind)
);

-- ============================================================
-- 进化链
-- ============================================================
CREATE TABLE IF NOT EXISTS evolution_chains (
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
  pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
  form_key TEXT NOT NULL DEFAULT 'default',
  move_id INTEGER REFERENCES moves(id) ON DELETE SET NULL,
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

-- ============================================================
-- Row Level Security (RLS) — 公开只读
-- ============================================================
ALTER TABLE pokemon ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_form_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_form_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_form_abilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_form_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE evolution_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_generation_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_learnsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE move_generation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE abilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ability_generation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_generation_records ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户（anon）读取所有表
CREATE POLICY "Allow public read" ON pokemon FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON pokemon_forms FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON pokemon_form_stats FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON pokemon_form_types FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON pokemon_form_abilities FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON pokemon_form_images FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON evolution_chains FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON pokemon_generation_regions FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON pokemon_learnsets FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON moves FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON move_generation_records FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON abilities FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON ability_generation_records FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON items FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON item_generation_records FOR SELECT USING (true);
