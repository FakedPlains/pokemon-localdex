-- ==========================================================================
-- Pokemon LocalDex — Field Effect Modifiers Seed Data (Idempotent)
-- 场地效果对战数值修正表：天气、场地、异常状态、场侧效果、全场效果
-- Enum reference: packages/store/shared-types/src/battle-effects.ts
-- Field Effect IDs: SELECT id, kind, key, name_zh FROM field_effects ORDER BY id;
-- ==========================================================================

-- Drop and recreate table (faster than DELETE for full reseed)
DROP TABLE IF EXISTS field_effect_modifiers;

CREATE TABLE IF NOT EXISTS field_effect_modifiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_effect_id INTEGER NOT NULL REFERENCES field_effects(id) ON DELETE CASCADE,
  effect_type INTEGER NOT NULL,
  trigger INTEGER NOT NULL DEFAULT 1,
  target INTEGER NOT NULL DEFAULT 7,
  modifier_type INTEGER NOT NULL,
  modifier_value REAL,
  affected_stat INTEGER,
  affected_type INTEGER,
  affected_move_flag INTEGER,
  affected_move_category INTEGER,
  condition_key TEXT,
  params TEXT,
  generation_start INTEGER NOT NULL DEFAULT 1,
  generation_end INTEGER,
  priority INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_fem_field_effect ON field_effect_modifiers(field_effect_id);
CREATE INDEX IF NOT EXISTS idx_fem_effect_type ON field_effect_modifiers(effect_type);

-- ==========================================================================
-- WEATHER (kind=1): field_effect_id 1~8
-- ==========================================================================

-- ── 大晴天 (id=1, sun) ──
-- 火属性招式威力 x1.5
-- 水属性招式威力 x0.5
-- 第五世代后日照+太阳能量(花)回复量受影响(params记录)
INSERT INTO field_effect_modifiers
  (field_effect_id, effect_type, trigger, target, modifier_type, modifier_value, affected_stat, affected_type, affected_move_flag, affected_move_category, condition_key, params, generation_start, generation_end, priority, note)
VALUES
  (1, 205, 1, 7, 1, 1.5, NULL, 2, NULL, NULL, NULL, NULL, 2, NULL, 0, 'Sun: Fire x1.5'),
  (1, 205, 1, 7, 1, 0.5, NULL, 3, NULL, NULL, NULL, NULL, 2, NULL, 1, 'Sun: Water x0.5'),

-- ── 下雨 (id=2, rain) ──
-- 水属性招式威力 x1.5
-- 火属性招式威力 x0.5
  (2, 205, 1, 7, 1, 1.5, NULL, 3, NULL, NULL, NULL, NULL, 2, NULL, 0, 'Rain: Water x1.5'),
  (2, 205, 1, 7, 1, 0.5, NULL, 2, NULL, NULL, NULL, NULL, 2, NULL, 1, 'Rain: Fire x0.5'),

-- ── 沙暴 (id=3, sandstorm) ──
-- 岩石属性宝可梦特防 x1.5
-- 非岩/地/钢属性每回合损失 1/16 HP（伤害计算相关的特防修正）
  (3, 101, 1, 7, 1, 1.5, 5, 13, NULL, NULL, 'type_rock', NULL, 4, NULL, 0, 'Sandstorm: Rock-type SpD x1.5'),
  (3, 804, 1, 7, 9, 0.0625, NULL, NULL, NULL, NULL, 'not_immune', '{"immune_types":[13,9,17]}', 2, NULL, 1, 'Sandstorm: 1/16 HP dmg (non-Rock/Ground/Steel)'),

-- ── 冰雹 (id=4, hail) ──
-- 非冰属性每回合损失 1/16 HP
  (4, 804, 1, 7, 9, 0.0625, NULL, NULL, NULL, NULL, 'not_immune', '{"immune_types":[6]}', 3, NULL, 0, 'Hail: 1/16 HP dmg (non-Ice)'),

-- ── 下雪 (id=5, snow) ──
-- 冰属性宝可梦防御 x1.5（第九世代起取代冰雹）
  (5, 101, 1, 7, 1, 1.5, 3, 6, NULL, NULL, 'type_ice', NULL, 9, NULL, 0, 'Snow: Ice-type Def x1.5'),

-- ── 大日照 (id=6, harsh-sun) ──
-- 火属性招式威力 x1.5
-- 水属性招式威力 x0（完全无效）
  (6, 205, 1, 7, 1, 1.5, NULL, 2, NULL, NULL, NULL, NULL, 6, NULL, 0, 'Harsh Sun: Fire x1.5'),
  (6, 205, 1, 7, 1, 0.0, NULL, 3, NULL, NULL, NULL, '{"nullify":true}', 6, NULL, 1, 'Harsh Sun: Water nullified'),

-- ── 大雨 (id=7, heavy-rain) ──
-- 水属性招式威力 x1.5
-- 火属性招式威力 x0（完全无效）
  (7, 205, 1, 7, 1, 1.5, NULL, 3, NULL, NULL, NULL, NULL, 6, NULL, 0, 'Heavy Rain: Water x1.5'),
  (7, 205, 1, 7, 1, 0.0, NULL, 2, NULL, NULL, NULL, '{"nullify":true}', 6, NULL, 1, 'Heavy Rain: Fire nullified'),

-- ── 乱流 (id=8, strong-winds) ──
-- 飞行属性的弱点被减弱（超效变为普效）
  (8, 204, 1, 7, 1, 0.5, NULL, 10, NULL, NULL, 'flying_weakness_reduce', '{"target_type":10,"reduces_se_to_neutral":true}', 6, NULL, 0, 'Strong Winds: Flying weakness neutralized');

-- ==========================================================================
-- TERRAIN (kind=2): field_effect_id 9~12
-- ==========================================================================

-- ── 电气场地 (id=9, electric) ──
-- 接地宝可梦的电属性招式威力 x1.3（第八世代前 x1.5→第八世代起 x1.3）
-- 接地宝可梦不会陷入睡眠
INSERT INTO field_effect_modifiers
  (field_effect_id, effect_type, trigger, target, modifier_type, modifier_value, affected_stat, affected_type, affected_move_flag, affected_move_category, condition_key, params, generation_start, generation_end, priority, note)
VALUES
  (9, 206, 1, 7, 1, 1.5, NULL, 4, NULL, NULL, 'grounded', NULL, 6, 7, 0, 'Electric Terrain: Electric x1.5 (Gen6-7)'),
  (9, 206, 1, 7, 1, 1.3, NULL, 4, NULL, NULL, 'grounded', NULL, 8, NULL, 0, 'Electric Terrain: Electric x1.3 (Gen8+)'),
  (9, 301, 1, 7, 3, NULL, NULL, NULL, NULL, NULL, 'grounded', '{"prevent_status":"sleep"}', 6, NULL, 1, 'Electric Terrain: prevent Sleep (grounded)'),

-- ── 青草场地 (id=10, grassy) ──
-- 接地宝可梦的草属性招式威力 x1.3（第八世代前 x1.5→第八世代起 x1.3）
-- 接地宝可梦每回合回复 1/16 HP
-- 地震/震级威力减半
  (10, 206, 1, 7, 1, 1.5, NULL, 5, NULL, NULL, 'grounded', NULL, 6, 7, 0, 'Grassy Terrain: Grass x1.5 (Gen6-7)'),
  (10, 206, 1, 7, 1, 1.3, NULL, 5, NULL, NULL, 'grounded', NULL, 8, NULL, 0, 'Grassy Terrain: Grass x1.3 (Gen8+)'),
  (10, 804, 1, 7, 9, -0.0625, NULL, NULL, NULL, NULL, 'grounded', '{"heal":true}', 6, NULL, 1, 'Grassy Terrain: heal 1/16 HP (grounded)'),
  (10, 202, 1, 7, 1, 0.5, NULL, 9, NULL, NULL, 'grounded_target', '{"moves":["earthquake","magnitude","bulldoze"]}', 6, NULL, 2, 'Grassy Terrain: Earthquake/etc x0.5 vs grounded'),

-- ── 薄雾场地 (id=11, misty) ──
-- 接地宝可梦不会陷入异常状态（含混乱）
-- 龙属性招式对接地目标威力 x0.5
  (11, 301, 1, 7, 3, NULL, NULL, NULL, NULL, NULL, 'grounded', '{"prevent_status":"all"}', 6, NULL, 0, 'Misty Terrain: prevent all status (grounded)'),
  (11, 202, 1, 7, 1, 0.5, NULL, 15, NULL, NULL, 'grounded_target', NULL, 6, NULL, 1, 'Misty Terrain: Dragon x0.5 vs grounded'),

-- ── 精神场地 (id=12, psychic) ──
-- 接地宝可梦的超能力属性招式威力 x1.3（第八世代前 x1.5→第八世代起 x1.3）
-- 阻挡优先度 >0 的招式（对接地宝可梦）
  (12, 206, 1, 7, 1, 1.5, NULL, 11, NULL, NULL, 'grounded', NULL, 7, 7, 0, 'Psychic Terrain: Psychic x1.5 (Gen7)'),
  (12, 206, 1, 7, 1, 1.3, NULL, 11, NULL, NULL, 'grounded', NULL, 8, NULL, 0, 'Psychic Terrain: Psychic x1.3 (Gen8+)'),
  (12, 702, 1, 7, 6, NULL, NULL, NULL, NULL, NULL, 'grounded_target', '{"block_priority_above":0}', 7, NULL, 1, 'Psychic Terrain: block priority moves vs grounded');

-- ==========================================================================
-- STATUS (kind=3): field_effect_id 13~21
-- ==========================================================================

-- ── 灼伤 (id=13, burn) ──
-- 物理招式伤害 x0.5（第一~四世代：攻击力 x0.5）
INSERT INTO field_effect_modifiers
  (field_effect_id, effect_type, trigger, target, modifier_type, modifier_value, affected_stat, affected_type, affected_move_flag, affected_move_category, condition_key, params, generation_start, generation_end, priority, note)
VALUES
  (13, 101, 1, 1, 1, 0.5, 2, NULL, NULL, 1, NULL, NULL, 1, NULL, 0, 'Burn: physical Atk x0.5'),

-- ── 麻痹 (id=14, paralysis) ──
-- 速度 x0.5（第一~六世代 x0.25→第七世代起 x0.5）
  (14, 101, 1, 1, 1, 0.25, 6, NULL, NULL, NULL, NULL, NULL, 1, 6, 0, 'Paralysis: Spe x0.25 (Gen1-6)'),
  (14, 101, 1, 1, 1, 0.5, 6, NULL, NULL, NULL, NULL, NULL, 7, NULL, 0, 'Paralysis: Spe x0.5 (Gen7+)'),

-- ── 中毒 (id=15, poison) ──
-- 每回合损失 1/8 HP
  (15, 804, 1, 1, 9, 0.125, NULL, NULL, NULL, NULL, NULL, NULL, 1, NULL, 0, 'Poison: 1/8 HP per turn'),

-- ── 剧毒 (id=16, bad-poison) ──
-- 每回合递增损失（1/16, 2/16, 3/16...）
  (16, 804, 1, 1, 9, 0.0625, NULL, NULL, NULL, NULL, NULL, '{"escalating":true,"increment":0.0625}', 1, NULL, 0, 'Bad Poison: escalating 1/16 per turn'),

-- ── 冻伤 (id=19, frostbite — 传说阿尔宙斯) ──
-- 特攻 x0.5（类比灼伤对物攻的效果）
-- 每回合损失 1/16 HP
  (19, 101, 1, 1, 1, 0.5, 4, NULL, NULL, 2, NULL, NULL, 8, NULL, 0, 'Frostbite: special SpA x0.5'),
  (19, 804, 1, 1, 9, 0.0625, NULL, NULL, NULL, NULL, NULL, NULL, 8, NULL, 1, 'Frostbite: 1/16 HP per turn');

-- ==========================================================================
-- SIDE EFFECTS (kind=4): field_effect_id 22~29
-- ==========================================================================

-- ── 反射壁 (id=22, reflect) ──
-- 物理伤害减半（双打时减为2/3）
INSERT INTO field_effect_modifiers
  (field_effect_id, effect_type, trigger, target, modifier_type, modifier_value, affected_stat, affected_type, affected_move_flag, affected_move_category, condition_key, params, generation_start, generation_end, priority, note)
VALUES
  (22, 701, 1, 5, 1, 0.5, NULL, NULL, NULL, 1, NULL, '{"doubles":0.667}', 1, NULL, 0, 'Reflect: physical dmg x0.5 (x0.667 doubles)'),

-- ── 光墙 (id=23, light-screen) ──
-- 特殊伤害减半（双打时减为2/3）
  (23, 701, 1, 5, 1, 0.5, NULL, NULL, NULL, 2, NULL, '{"doubles":0.667}', 1, NULL, 0, 'Light Screen: special dmg x0.5 (x0.667 doubles)'),

-- ── 极光幕 (id=24, aurora-veil) ──
-- 物理和特殊伤害均减半（双打时减为2/3），仅在冰雹/下雪中可用
  (24, 701, 1, 5, 1, 0.5, NULL, NULL, NULL, 1, NULL, '{"doubles":0.667,"requires_weather":"hail_or_snow"}', 7, NULL, 0, 'Aurora Veil: physical dmg x0.5 (x0.667 doubles)'),
  (24, 701, 1, 5, 1, 0.5, NULL, NULL, NULL, 2, NULL, '{"doubles":0.667,"requires_weather":"hail_or_snow"}', 7, NULL, 1, 'Aurora Veil: special dmg x0.5 (x0.667 doubles)'),

-- ── 撒菱 (id=25, spikes) ──
-- 入场伤害：1层=1/8, 2层=1/6, 3层=1/4 HP
  (25, 804, 1, 6, 9, 0.125, NULL, NULL, NULL, NULL, 'on_switch_in', '{"layers":[0.125,0.167,0.25],"max_layers":3}', 2, NULL, 0, 'Spikes: entry dmg 1/8~1/4 by layers'),

-- ── 毒菱 (id=26, toxic-spikes) ──
-- 入场：1层=中毒, 2层=剧毒（毒属性入场可清除）
  (26, 804, 1, 6, 9, 0, NULL, NULL, NULL, NULL, 'on_switch_in', '{"layers_effect":["poison","bad_poison"],"max_layers":2,"removed_by_type":8}', 4, NULL, 0, 'Toxic Spikes: poison/bad-poison on entry'),

-- ── 隐形岩 (id=27, stealth-rock) ──
-- 入场伤害：基于岩石属性对入场宝可梦的克制（1/2x~1/32 HP）
  (27, 804, 1, 6, 9, 0.125, NULL, 13, NULL, NULL, 'on_switch_in', '{"type_effectiveness_based":true,"base_fraction":0.125}', 4, NULL, 0, 'Stealth Rock: entry dmg by Rock effectiveness'),

-- ── 黏黏网 (id=28, sticky-web) ──
-- 入场速度-1
  (28, 102, 1, 6, 2, -1, 6, NULL, NULL, NULL, 'on_switch_in', '{"grounded_only":true}', 6, NULL, 0, 'Sticky Web: Spe -1 on entry'),

-- ── 顺风 (id=29, tailwind) ──
-- 己方速度 x2
  (29, 101, 1, 5, 1, 2.0, 6, NULL, NULL, NULL, NULL, NULL, 4, NULL, 0, 'Tailwind: team Spe x2');

-- ==========================================================================
-- FIELD-WIDE EFFECTS (kind=5): field_effect_id 30~33
-- ==========================================================================

-- ── 戏法空间 (id=30, trick-room) ──
-- 速度判定反转（慢者先攻）
INSERT INTO field_effect_modifiers
  (field_effect_id, effect_type, trigger, target, modifier_type, modifier_value, affected_stat, affected_type, affected_move_flag, affected_move_category, condition_key, params, generation_start, generation_end, priority, note)
VALUES
  (30, 601, 1, 7, 1, -1, 6, NULL, NULL, NULL, NULL, '{"invert_speed_order":true}', 4, NULL, 0, 'Trick Room: invert speed order'),

-- ── 重力 (id=31, gravity) ──
-- 所有宝可梦被视为接地（飞行/浮游无效）
-- 命中率 x5/3（约 x1.667）
-- 飞行属性免疫地面失效
  (31, 101, 1, 7, 1, 1.6667, 7, NULL, NULL, NULL, NULL, '{"grounded_all":true}', 4, NULL, 0, 'Gravity: accuracy x5/3'),
  (31, 301, 1, 7, 3, NULL, NULL, 9, NULL, NULL, 'negate_flying_immunity', '{"remove_ground_immunity":true}', 4, NULL, 1, 'Gravity: negate Ground immunity'),

-- ── 魔法空间 (id=32, magic-room) ──
-- 所有宝可梦的道具效果失效
  (32, 1002, 1, 7, 6, NULL, NULL, NULL, NULL, NULL, NULL, '{"suppress":"items"}', 5, NULL, 0, 'Magic Room: suppress all items'),

-- ── 奇妙空间 (id=33, wonder-room) ──
-- 所有宝可梦的防御和特防互换
  (33, 103, 1, 7, 7, NULL, 3, NULL, NULL, NULL, NULL, '{"swap":[3,5]}', 5, NULL, 0, 'Wonder Room: swap Def <-> SpD');

-- DONE
