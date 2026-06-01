-- ==========================================================================
-- Pokemon LocalDex — Field Effect Sources Seed Data (Idempotent)
-- 场地效果来源关联表：记录哪些特性/招式/道具可以触发/延长/移除场地效果
-- Enum reference: packages/store/shared-types/src/battle-effects.ts
--   FIELD_EFFECT_SOURCE_TYPE: 1=ability, 2=move, 3=item
--   FIELD_EFFECT_TRIGGER_METHOD:
--     1=SET_ON_SWITCH_IN  2=SET_ON_USE  3=SET_ON_HIT
--     4=SET_ON_CONTACT    5=EXTEND_DURATION  6=MAINTAIN
--     7=REMOVE            8=PREVENT
-- Field Effect IDs: SELECT id, kind, key, name_zh FROM field_effects ORDER BY id;
-- ==========================================================================

-- Drop and recreate table (faster than DELETE for full reseed)
DROP TABLE IF EXISTS field_effect_sources;

CREATE TABLE IF NOT EXISTS field_effect_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_effect_id INTEGER NOT NULL REFERENCES field_effects(id) ON DELETE CASCADE,
  source_type INTEGER NOT NULL,
  source_id INTEGER NOT NULL,
  trigger_method INTEGER NOT NULL DEFAULT 2,
  layers INTEGER,
  turns_override INTEGER,
  condition_key TEXT,
  probability REAL,
  generation_start INTEGER NOT NULL DEFAULT 1,
  generation_end INTEGER,
  note TEXT
);

-- Unique index using expression (supported by SQLite 3.9.0+)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fes_unique
  ON field_effect_sources(field_effect_id, source_type, source_id, trigger_method, COALESCE(condition_key, ''));

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_fes_field_effect ON field_effect_sources(field_effect_id);
CREATE INDEX IF NOT EXISTS idx_fes_source ON field_effect_sources(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_fes_source_type ON field_effect_sources(source_type);

-- ==========================================================================
-- WEATHER (kind=1): field_effect_id 1~8
-- ==========================================================================

-- ── 大晴天 (id=1, sun) ──
INSERT INTO field_effect_sources
  (field_effect_id, source_type, source_id, trigger_method, layers, turns_override, condition_key, probability, generation_start, generation_end, note)
VALUES
  -- 特性：日照（Drought）— 登场时设置
  (1, 1, 70, 1, NULL, NULL, NULL, NULL, 3, NULL, 'Drought: sets Sun on switch-in'),
  -- 特性：绯红脉动（Orichalcum Pulse）— 登场时设置
  (1, 1, 288, 1, NULL, NULL, NULL, NULL, 9, NULL, 'Orichalcum Pulse: sets Sun on switch-in'),
  -- 招式：大晴天（Sunny Day）— 使用时设置
  (1, 2, 241, 2, NULL, NULL, NULL, NULL, 2, NULL, 'Sunny Day: sets Sun on use'),
  -- 道具：炽热岩石（Heat Rock）— 延长持续回合
  (1, 3, 122, 5, NULL, 8, NULL, NULL, 4, NULL, 'Heat Rock: extends Sun to 8 turns'),

-- ── 下雨 (id=2, rain) ──
  -- 特性：降雨（Drizzle）— 登场时设置
  (2, 1, 2, 1, NULL, NULL, NULL, NULL, 3, NULL, 'Drizzle: sets Rain on switch-in'),
  -- 招式：求雨（Rain Dance）— 使用时设置
  (2, 2, 240, 2, NULL, NULL, NULL, NULL, 2, NULL, 'Rain Dance: sets Rain on use'),
  -- 道具：潮湿岩石（Damp Rock）— 延长持续回合
  (2, 3, 123, 5, NULL, 8, NULL, NULL, 4, NULL, 'Damp Rock: extends Rain to 8 turns'),

-- ── 沙暴 (id=3, sandstorm) ──
  -- 特性：扬沙（Sand Stream）— 登场时设置
  (3, 1, 45, 1, NULL, NULL, NULL, NULL, 3, NULL, 'Sand Stream: sets Sandstorm on switch-in'),
  -- 招式：沙暴（Sandstorm）— 使用时设置
  (3, 2, 201, 2, NULL, NULL, NULL, NULL, 2, NULL, 'Sandstorm: sets Sandstorm on use'),
  -- 道具：沙沙岩石（Smooth Rock）— 延长持续回合
  (3, 3, 121, 5, NULL, 8, NULL, NULL, 4, NULL, 'Smooth Rock: extends Sandstorm to 8 turns'),
  -- 道具：防尘护目镜（Safety Goggles）— 阻止沙暴伤害
  (3, 3, 174, 8, NULL, NULL, 'damage_immune', NULL, 6, NULL, 'Safety Goggles: prevents Sandstorm damage'),

-- ── 冰雹 (id=4, hail) ──
  -- 特性：降雪（Snow Warning）— 登场时设置（第三~八世代召唤冰雹）
  (4, 1, 117, 1, NULL, NULL, NULL, NULL, 3, 8, 'Snow Warning: sets Hail on switch-in (Gen3-8)'),
  -- 招式：冰雹（Hail）— 使用时设置
  (4, 2, 258, 2, NULL, NULL, NULL, NULL, 3, 8, 'Hail: sets Hail on use (removed Gen9)'),
  -- 道具：冰冷岩石（Icy Rock）— 延长持续回合
  (4, 3, 120, 5, NULL, 8, NULL, NULL, 4, 8, 'Icy Rock: extends Hail to 8 turns (Gen4-8)'),
  -- 道具：防尘护目镜（Safety Goggles）— 阻止冰雹伤害
  (4, 3, 174, 8, NULL, NULL, 'damage_immune', NULL, 6, NULL, 'Safety Goggles: prevents Hail damage'),

-- ── 下雪 (id=5, snow) ──
  -- 特性：降雪（Snow Warning）— 登场时设置（第九世代起召唤下雪）
  (5, 1, 117, 1, NULL, NULL, NULL, NULL, 9, NULL, 'Snow Warning: sets Snow on switch-in (Gen9+)'),
  -- 招式：雪景（Snowscape）— 使用时设置
  (5, 2, 898, 2, NULL, NULL, NULL, NULL, 9, NULL, 'Snowscape: sets Snow on use'),
  -- 道具：冰冷岩石（Icy Rock）— 延长持续回合
  (5, 3, 120, 5, NULL, 8, NULL, NULL, 9, NULL, 'Icy Rock: extends Snow to 8 turns (Gen9+)'),

-- ── 大日照 (id=6, harsh-sun) ──
  -- 特性：终结之地（Desolate Land）— 登场时设置
  (6, 1, 190, 1, NULL, NULL, NULL, NULL, 6, NULL, 'Desolate Land: sets Harsh Sun on switch-in'),

-- ── 大雨 (id=7, heavy-rain) ──
  -- 特性：始源之海（Primordial Sea）— 登场时设置
  (7, 1, 189, 1, NULL, NULL, NULL, NULL, 6, NULL, 'Primordial Sea: sets Heavy Rain on switch-in'),

-- ── 乱流 (id=8, strong-winds) ──
  -- 特性：德尔塔气流（Delta Stream）— 登场时设置
  (8, 1, 191, 1, NULL, NULL, NULL, NULL, 6, NULL, 'Delta Stream: sets Strong Winds on switch-in');

-- ── 天气 — 移除/覆盖 ──
-- 无关天气和气闸可以消除天气效果（对所有天气生效，插入到 field_effect_id=1 作为代表）
-- 实际运行时需要检查 source_type + source_id 来判断是否对目标天气生效
INSERT INTO field_effect_sources
  (field_effect_id, source_type, source_id, trigger_method, layers, turns_override, condition_key, probability, generation_start, generation_end, note)
VALUES
  -- 特性：无关天气（Cloud Nine）— 抑制天气效果
  (1, 1, 13, 8, NULL, NULL, 'suppress_all_weather', NULL, 3, NULL, 'Cloud Nine: suppresses all weather effects'),
  -- 特性：气闸（Air Lock）— 抑制天气效果
  (1, 1, 76, 8, NULL, NULL, 'suppress_all_weather', NULL, 3, NULL, 'Air Lock: suppresses all weather effects');

-- ==========================================================================
-- TERRAIN (kind=2): field_effect_id 9~12
-- ==========================================================================

-- ── 电气场地 (id=9, electric) ──
INSERT INTO field_effect_sources
  (field_effect_id, source_type, source_id, trigger_method, layers, turns_override, condition_key, probability, generation_start, generation_end, note)
VALUES
  -- 特性：电气制造者（Electric Surge）— 登场时设置
  (9, 1, 226, 1, NULL, NULL, NULL, NULL, 7, NULL, 'Electric Surge: sets Electric Terrain on switch-in'),
  -- 特性：强子引擎（Hadron Engine）— 登场时设置
  (9, 1, 289, 1, NULL, NULL, NULL, NULL, 9, NULL, 'Hadron Engine: sets Electric Terrain on switch-in'),
  -- 招式：电气场地（Electric Terrain）— 使用时设置
  (9, 2, 604, 2, NULL, NULL, NULL, NULL, 6, NULL, 'Electric Terrain: sets Electric Terrain on use'),
  -- 道具：大地膜（Terrain Extender）— 延长持续回合
  (9, 3, 176, 5, NULL, 8, NULL, NULL, 7, NULL, 'Terrain Extender: extends Electric Terrain to 8 turns'),

-- ── 青草场地 (id=10, grassy) ──
  -- 特性：青草制造者（Grassy Surge）— 登场时设置
  (10, 1, 229, 1, NULL, NULL, NULL, NULL, 7, NULL, 'Grassy Surge: sets Grassy Terrain on switch-in'),
  -- 特性：掉出种子（Seed Sower）— 被命中时设置
  (10, 1, 269, 3, NULL, NULL, NULL, NULL, 9, NULL, 'Seed Sower: sets Grassy Terrain when hit'),
  -- 招式：青草场地（Grassy Terrain）— 使用时设置
  (10, 2, 580, 2, NULL, NULL, NULL, NULL, 6, NULL, 'Grassy Terrain: sets Grassy Terrain on use'),
  -- 道具：大地膜（Terrain Extender）— 延长持续回合
  (10, 3, 176, 5, NULL, 8, NULL, NULL, 7, NULL, 'Terrain Extender: extends Grassy Terrain to 8 turns'),

-- ── 薄雾场地 (id=11, misty) ──
  -- 特性：薄雾制造者（Misty Surge）— 登场时设置
  (11, 1, 228, 1, NULL, NULL, NULL, NULL, 7, NULL, 'Misty Surge: sets Misty Terrain on switch-in'),
  -- 招式：薄雾场地（Misty Terrain）— 使用时设置
  (11, 2, 581, 2, NULL, NULL, NULL, NULL, 6, NULL, 'Misty Terrain: sets Misty Terrain on use'),
  -- 道具：大地膜（Terrain Extender）— 延长持续回合
  (11, 3, 176, 5, NULL, 8, NULL, NULL, 7, NULL, 'Terrain Extender: extends Misty Terrain to 8 turns'),

-- ── 精神场地 (id=12, psychic) ──
  -- 特性：精神制造者（Psychic Surge）— 登场时设置
  (12, 1, 227, 1, NULL, NULL, NULL, NULL, 7, NULL, 'Psychic Surge: sets Psychic Terrain on switch-in'),
  -- 招式：精神场地（Psychic Terrain）— 使用时设置
  (12, 2, 660, 2, NULL, NULL, NULL, NULL, 7, NULL, 'Psychic Terrain: sets Psychic Terrain on use'),
  -- 道具：大地膜（Terrain Extender）— 延长持续回合
  (12, 3, 176, 5, NULL, 8, NULL, NULL, 7, NULL, 'Terrain Extender: extends Psychic Terrain to 8 turns');

-- ==========================================================================
-- STATUS (kind=3): field_effect_id 13~21
-- ==========================================================================

-- ── 灼伤 (id=13, burn) ──
INSERT INTO field_effect_sources
  (field_effect_id, source_type, source_id, trigger_method, layers, turns_override, condition_key, probability, generation_start, generation_end, note)
VALUES
  -- 招式：磷火（Will-O-Wisp）— 使用时施加
  (13, 2, 261, 2, NULL, NULL, NULL, NULL, 3, NULL, 'Will-O-Wisp: inflicts Burn on use'),
  -- 招式：热水（Scald）— 命中时30%概率
  (13, 2, 503, 3, NULL, NULL, NULL, 0.3, 5, NULL, 'Scald: 30% chance to Burn on hit'),
  -- 招式：喷射火焰（Flamethrower）— 命中时10%概率
  (13, 2, 53, 3, NULL, NULL, NULL, 0.1, 1, NULL, 'Flamethrower: 10% chance to Burn on hit'),
  -- 招式：喷烟（Lava Plume）— 命中时30%概率
  (13, 2, 436, 3, NULL, NULL, NULL, 0.3, 4, NULL, 'Lava Plume: 30% chance to Burn on hit'),
  -- 招式：神圣之火（Sacred Fire）— 命中时50%概率
  (13, 2, 221, 3, NULL, NULL, NULL, 0.5, 2, NULL, 'Sacred Fire: 50% chance to Burn on hit'),
  -- 招式：火焰拳（Fire Punch）— 命中时10%概率
  (13, 2, 7, 3, NULL, NULL, NULL, 0.1, 1, NULL, 'Fire Punch: 10% chance to Burn on hit'),
  -- 招式：三重攻击（Tri Attack）— 命中时6.67%概率灼伤
  (13, 2, 161, 3, NULL, NULL, 'tri_attack_burn', 0.0667, 2, NULL, 'Tri Attack: 6.67% Burn (1/3 of 20%)'),
  -- 特性：火焰之躯（Flame Body）— 被接触时30%概率
  (13, 1, 49, 4, NULL, NULL, NULL, 0.3, 3, NULL, 'Flame Body: 30% Burn on contact received'),

-- ── 麻痹 (id=14, paralysis) ──
  -- 招式：电磁波（Thunder Wave）— 使用时施加
  (14, 2, 86, 2, NULL, NULL, NULL, NULL, 1, NULL, 'Thunder Wave: inflicts Paralysis on use'),
  -- 招式：麻痹粉（Stun Spore）— 使用时施加
  (14, 2, 78, 2, NULL, NULL, NULL, NULL, 1, NULL, 'Stun Spore: inflicts Paralysis on use'),
  -- 招式：大蛇瞪眼（Glare）— 使用时施加
  (14, 2, 137, 2, NULL, NULL, NULL, NULL, 1, NULL, 'Glare: inflicts Paralysis on use'),
  -- 招式：蹭蹭脸颊（Nuzzle）— 命中时必定
  (14, 2, 609, 3, NULL, NULL, NULL, 1.0, 6, NULL, 'Nuzzle: 100% Paralysis on hit'),
  -- 招式：泰山压顶（Body Slam）— 命中时30%概率
  (14, 2, 34, 3, NULL, NULL, NULL, 0.3, 1, NULL, 'Body Slam: 30% chance to Paralyze on hit'),
  -- 招式：放电（Discharge）— 命中时30%概率
  (14, 2, 435, 3, NULL, NULL, NULL, 0.3, 4, NULL, 'Discharge: 30% chance to Paralyze on hit'),
  -- 招式：十万伏特（Thunderbolt）— 命中时10%概率
  (14, 2, 85, 3, NULL, NULL, NULL, 0.1, 1, NULL, 'Thunderbolt: 10% chance to Paralyze on hit'),
  -- 招式：打雷（Thunder）— 命中时30%概率
  (14, 2, 87, 3, NULL, NULL, NULL, 0.3, 1, NULL, 'Thunder: 30% chance to Paralyze on hit'),
  -- 招式：雷电拳（Thunder Punch）— 命中时10%概率
  (14, 2, 9, 3, NULL, NULL, NULL, 0.1, 1, NULL, 'Thunder Punch: 10% chance to Paralyze on hit'),
  -- 招式：三重攻击（Tri Attack）— 命中时6.67%概率麻痹
  (14, 2, 161, 3, NULL, NULL, 'tri_attack_paralysis', 0.0667, 2, NULL, 'Tri Attack: 6.67% Paralysis (1/3 of 20%)'),
  -- 特性：静电（Static）— 被接触时30%概率
  (14, 1, 9, 4, NULL, NULL, NULL, 0.3, 3, NULL, 'Static: 30% Paralysis on contact received'),

-- ── 中毒 (id=15, poison) ──
  -- 招式：毒粉（Poison Powder）— 使用时施加
  (15, 2, 77, 2, NULL, NULL, NULL, NULL, 1, NULL, 'Poison Powder: inflicts Poison on use'),
  -- 特性：毒刺（Poison Point）— 被接触时30%概率
  (15, 1, 38, 4, NULL, NULL, NULL, 0.3, 3, NULL, 'Poison Point: 30% Poison on contact received'),
  -- 特性：毒手（Poison Touch）— 接触招式命中时30%概率
  (15, 1, 143, 3, NULL, NULL, 'contact_move', 0.3, 5, NULL, 'Poison Touch: 30% Poison on contact move hit'),

-- ── 剧毒 (id=16, bad-poison) ──
  -- 招式：剧毒（Toxic）— 使用时施加
  (16, 2, 92, 2, NULL, NULL, NULL, NULL, 1, NULL, 'Toxic: inflicts Bad Poison on use'),
  -- 招式：毒菱 2层（Toxic Spikes x2）— 入场时施加
  (16, 2, 390, 2, NULL, NULL, 'layer_2', NULL, 4, NULL, 'Toxic Spikes (2 layers): inflicts Bad Poison on entry'),
  -- 招式：碉堡（Baneful Bunker）— 被接触时施加
  (16, 2, 643, 4, NULL, NULL, NULL, NULL, 7, NULL, 'Baneful Bunker: poisons on contact'),
  -- 招式：毒丝（Toxic Thread）— 使用时施加
  (16, 2, 654, 2, NULL, NULL, NULL, NULL, 7, NULL, 'Toxic Thread: inflicts Poison + Spe -1 on use'),
  -- 特性：毒锁链（Toxic Chain）— 命中时30%概率
  (16, 1, 305, 3, NULL, NULL, NULL, 0.3, 9, NULL, 'Toxic Chain: 30% Bad Poison on any hit'),

-- ── 睡眠 (id=17, sleep) ──
  -- 招式：蘑菇孢子（Spore）— 使用时施加
  (17, 2, 147, 2, NULL, NULL, NULL, NULL, 2, NULL, 'Spore: inflicts Sleep on use'),
  -- 招式：催眠粉（Sleep Powder）— 使用时施加
  (17, 2, 79, 2, NULL, NULL, NULL, NULL, 1, NULL, 'Sleep Powder: inflicts Sleep on use'),
  -- 招式：催眠术（Hypnosis）— 使用时施加
  (17, 2, 95, 2, NULL, NULL, NULL, NULL, 1, NULL, 'Hypnosis: inflicts Sleep on use'),
  -- 招式：唱歌（Sing）— 使用时施加
  (17, 2, 47, 2, NULL, NULL, NULL, NULL, 1, NULL, 'Sing: inflicts Sleep on use'),
  -- 招式：恶魔之吻（Lovely Kiss）— 使用时施加
  (17, 2, 142, 2, NULL, NULL, NULL, NULL, 1, NULL, 'Lovely Kiss: inflicts Sleep on use'),
  -- 招式：暗黑洞（Dark Void）— 使用时施加
  (17, 2, 464, 2, NULL, NULL, NULL, NULL, 4, NULL, 'Dark Void: inflicts Sleep on use'),
  -- 招式：哈欠（Yawn）— 使用时施加（延迟一回合）
  (17, 2, 281, 2, NULL, NULL, 'delayed_1_turn', NULL, 3, NULL, 'Yawn: inflicts Sleep after 1 turn'),
  -- 特性：孢子（Effect Spore）— 被接触时11%概率催眠
  (17, 1, 27, 4, NULL, NULL, 'effect_spore_sleep', 0.11, 3, NULL, 'Effect Spore: 11% Sleep on contact received'),

-- ── 冰冻 (id=18, freeze) ──
  -- 招式：冰冻光束（Ice Beam）— 命中时10%概率
  (18, 2, 58, 3, NULL, NULL, NULL, 0.1, 1, NULL, 'Ice Beam: 10% chance to Freeze on hit'),
  -- 招式：暴风雪（Blizzard）— 命中时10%概率
  (18, 2, 59, 3, NULL, NULL, NULL, 0.1, 1, NULL, 'Blizzard: 10% chance to Freeze on hit'),
  -- 招式：冰冻拳（Ice Punch）— 命中时10%概率
  (18, 2, 8, 3, NULL, NULL, NULL, 0.1, 1, NULL, 'Ice Punch: 10% chance to Freeze on hit'),
  -- 招式：冷冻干燥（Freeze-Dry）— 命中时10%概率
  (18, 2, 573, 3, NULL, NULL, NULL, 0.1, 6, NULL, 'Freeze-Dry: 10% chance to Freeze on hit'),
  -- 招式：三重攻击（Tri Attack）— 命中时6.67%概率冰冻
  (18, 2, 161, 3, NULL, NULL, 'tri_attack_freeze', 0.0667, 2, NULL, 'Tri Attack: 6.67% Freeze (1/3 of 20%)'),

-- ── 混乱 (id=20, confusion) ──
  -- 招式：奇异之光（Confuse Ray）— 使用时施加
  (20, 2, 109, 2, NULL, NULL, NULL, NULL, 1, NULL, 'Confuse Ray: inflicts Confusion on use'),
  -- 招式：虚张声势（Swagger）— 使用时施加
  (20, 2, 207, 2, NULL, NULL, NULL, NULL, 2, NULL, 'Swagger: inflicts Confusion on use'),
  -- 招式：天使之吻（Sweet Kiss）— 使用时施加
  (20, 2, 186, 2, NULL, NULL, NULL, NULL, 2, NULL, 'Sweet Kiss: inflicts Confusion on use'),
  -- 招式：吹捧（Flatter）— 使用时施加
  (20, 2, 260, 2, NULL, NULL, NULL, NULL, 3, NULL, 'Flatter: inflicts Confusion on use'),
  -- 特性：我行我素（Own Tempo）— 阻止混乱
  (20, 1, 20, 8, NULL, NULL, NULL, NULL, 3, NULL, 'Own Tempo: prevents Confusion'),

-- ── 着迷 (id=21, infatuation) ──
  -- 招式：迷人（Attract）— 使用时施加
  (21, 2, 213, 2, NULL, NULL, NULL, NULL, 2, NULL, 'Attract: inflicts Infatuation on use');

-- ==========================================================================
-- STATUS — 免疫/阻止特性
-- ==========================================================================
INSERT INTO field_effect_sources
  (field_effect_id, source_type, source_id, trigger_method, layers, turns_override, condition_key, probability, generation_start, generation_end, note)
VALUES
  -- 灼伤免疫
  (13, 1, 41, 8, NULL, NULL, NULL, NULL, 3, NULL, 'Water Veil: prevents Burn'),
  -- 麻痹免疫
  (14, 1, 7, 8, NULL, NULL, NULL, NULL, 3, NULL, 'Limber: prevents Paralysis'),
  -- 中毒免疫
  (15, 1, 17, 8, NULL, NULL, NULL, NULL, 3, NULL, 'Immunity: prevents Poison'),
  -- 睡眠免疫
  (17, 1, 15, 8, NULL, NULL, NULL, NULL, 3, NULL, 'Insomnia: prevents Sleep'),
  (17, 1, 72, 8, NULL, NULL, NULL, NULL, 3, NULL, 'Vital Spirit: prevents Sleep'),
  -- 冰冻免疫（岩浆铠甲等 — 查询后补充）
  -- 混乱免疫
  (20, 1, 20, 8, NULL, NULL, 'duplicate_check', NULL, 3, NULL, 'Own Tempo: prevents Confusion (redundant row removed)');

-- 删除重复行（Own Tempo 已在上面 STATUS 段中插入过），此处用 DELETE 清理
DELETE FROM field_effect_sources WHERE note = 'Own Tempo: prevents Confusion (redundant row removed)';

-- ==========================================================================
-- SIDE EFFECTS (kind=4): field_effect_id 22~29
-- ==========================================================================

-- ── 反射壁 (id=22, reflect) ──
INSERT INTO field_effect_sources
  (field_effect_id, source_type, source_id, trigger_method, layers, turns_override, condition_key, probability, generation_start, generation_end, note)
VALUES
  -- 招式：反射壁（Reflect）— 使用时设置
  (22, 2, 115, 2, NULL, NULL, NULL, NULL, 1, NULL, 'Reflect: sets Reflect on use'),
  -- 道具：光之黏土（Light Clay）— 延长持续回合
  (22, 3, 109, 5, NULL, 8, NULL, NULL, 4, NULL, 'Light Clay: extends Reflect to 8 turns'),
  -- 招式：劈瓦（Brick Break）— 移除
  (22, 2, 280, 7, NULL, NULL, NULL, NULL, 3, NULL, 'Brick Break: removes Reflect'),
  -- 招式：精神之牙（Psychic Fangs）— 移除
  (22, 2, 688, 7, NULL, NULL, NULL, NULL, 7, NULL, 'Psychic Fangs: removes Reflect'),
  -- 特性：除障（Screen Cleaner）— 登场时移除
  (22, 1, 251, 7, NULL, NULL, NULL, NULL, 8, NULL, 'Screen Cleaner: removes screens on switch-in'),

-- ── 光墙 (id=23, light-screen) ──
  -- 招式：光墙（Light Screen）— 使用时设置
  (23, 2, 113, 2, NULL, NULL, NULL, NULL, 1, NULL, 'Light Screen: sets Light Screen on use'),
  -- 道具：光之黏土（Light Clay）— 延长持续回合
  (23, 3, 109, 5, NULL, 8, NULL, NULL, 1, NULL, 'Light Clay: extends Light Screen to 8 turns'),
  -- 特性：除障（Screen Cleaner）— 登场时移除
  (23, 1, 251, 7, NULL, NULL, NULL, NULL, 8, NULL, 'Screen Cleaner: removes screens on switch-in'),

-- ── 极光幕 (id=24, aurora-veil) ──
  -- 招式：极光幕（Aurora Veil）— 使用时设置（需冰雹/雪景）
  (24, 2, 676, 2, NULL, NULL, 'requires_hail_or_snow', NULL, 7, NULL, 'Aurora Veil: sets veil on use (needs hail/snow)'),
  -- 道具：光之黏土（Light Clay）— 延长持续回合
  (24, 3, 109, 5, NULL, 8, NULL, NULL, 7, NULL, 'Light Clay: extends Aurora Veil to 8 turns'),
  -- 特性：除障（Screen Cleaner）— 登场时移除
  (24, 1, 251, 7, NULL, NULL, NULL, NULL, 7, NULL, 'Screen Cleaner: removes Aurora Veil on switch-in'),

-- ── 撒菱 (id=25, spikes) ──
  -- 招式：撒菱（Spikes）— 使用时设置
  (25, 2, 191, 2, 1, NULL, NULL, NULL, 2, NULL, 'Spikes: sets 1 layer on use'),
  -- 招式：高速旋转（Rapid Spin）— 使用者侧清除
  (25, 2, 229, 7, NULL, NULL, NULL, NULL, 2, NULL, 'Rapid Spin: removes Spikes from own side'),
  -- 招式：清除浓雾（Defog）— 移除
  (25, 2, 432, 7, NULL, NULL, NULL, NULL, 4, NULL, 'Defog: removes Spikes'),
  -- 招式：晶光转转（Mortal Spin）— 移除
  (25, 2, 881, 7, NULL, NULL, NULL, NULL, 9, NULL, 'Mortal Spin: removes Spikes from own side'),
  -- 招式：大扫除（Tidy Up）— 移除
  (25, 2, 897, 7, NULL, NULL, NULL, NULL, 9, NULL, 'Tidy Up: removes Spikes from both sides'),
  -- 道具：厚底靴（Heavy-Duty Boots）— 阻止踩中
  (25, 3, 210, 8, NULL, NULL, NULL, NULL, 8, NULL, 'Heavy-Duty Boots: prevents Spikes damage'),

-- ── 毒菱 (id=26, toxic-spikes) ──
  -- 招式：毒菱（Toxic Spikes）— 使用时设置
  (26, 2, 390, 2, 1, NULL, NULL, NULL, 4, NULL, 'Toxic Spikes: sets 1 layer on use'),
  -- 招式：高速旋转（Rapid Spin）— 移除
  (26, 2, 229, 7, NULL, NULL, NULL, NULL, 2, NULL, 'Rapid Spin: removes Toxic Spikes from own side'),
  -- 招式：清除浓雾（Defog）— 移除
  (26, 2, 432, 7, NULL, NULL, NULL, NULL, 4, NULL, 'Defog: removes Toxic Spikes'),
  -- 招式：晶光转转（Mortal Spin）— 移除
  (26, 2, 881, 7, NULL, NULL, NULL, NULL, 9, NULL, 'Mortal Spin: removes Toxic Spikes from own side'),
  -- 招式：大扫除（Tidy Up）— 移除
  (26, 2, 897, 7, NULL, NULL, NULL, NULL, 9, NULL, 'Tidy Up: removes Toxic Spikes from both sides'),
  -- 道具：厚底靴（Heavy-Duty Boots）— 阻止踩中
  (26, 3, 210, 8, NULL, NULL, NULL, NULL, 8, NULL, 'Heavy-Duty Boots: prevents Toxic Spikes'),

-- ── 隐形岩 (id=27, stealth-rock) ──
  -- 招式：隐形岩（Stealth Rock）— 使用时设置
  (27, 2, 446, 2, NULL, NULL, NULL, NULL, 4, NULL, 'Stealth Rock: sets on use'),
  -- 招式：高速旋转（Rapid Spin）— 移除
  (27, 2, 229, 7, NULL, NULL, NULL, NULL, 2, NULL, 'Rapid Spin: removes Stealth Rock from own side'),
  -- 招式：清除浓雾（Defog）— 移除
  (27, 2, 432, 7, NULL, NULL, NULL, NULL, 4, NULL, 'Defog: removes Stealth Rock'),
  -- 招式：晶光转转（Mortal Spin）— 移除
  (27, 2, 881, 7, NULL, NULL, NULL, NULL, 9, NULL, 'Mortal Spin: removes Stealth Rock from own side'),
  -- 招式：大扫除（Tidy Up）— 移除
  (27, 2, 897, 7, NULL, NULL, NULL, NULL, 9, NULL, 'Tidy Up: removes Stealth Rock from both sides'),
  -- 道具：厚底靴（Heavy-Duty Boots）— 阻止踩中
  (27, 3, 210, 8, NULL, NULL, NULL, NULL, 8, NULL, 'Heavy-Duty Boots: prevents Stealth Rock damage'),

-- ── 黏黏网 (id=28, sticky-web) ──
  -- 招式：黏黏网（Sticky Web）— 使用时设置
  (28, 2, 564, 2, NULL, NULL, NULL, NULL, 6, NULL, 'Sticky Web: sets on use'),
  -- 招式：高速旋转（Rapid Spin）— 移除
  (28, 2, 229, 7, NULL, NULL, NULL, NULL, 2, NULL, 'Rapid Spin: removes Sticky Web from own side'),
  -- 招式：清除浓雾（Defog）— 移除
  (28, 2, 432, 7, NULL, NULL, NULL, NULL, 4, NULL, 'Defog: removes Sticky Web'),
  -- 招式：大扫除（Tidy Up）— 移除
  (28, 2, 897, 7, NULL, NULL, NULL, NULL, 9, NULL, 'Tidy Up: removes Sticky Web from both sides'),
  -- 道具：厚底靴（Heavy-Duty Boots）— 阻止踩中
  (28, 3, 210, 8, NULL, NULL, NULL, NULL, 8, NULL, 'Heavy-Duty Boots: prevents Sticky Web effect'),

-- ── 顺风 (id=29, tailwind) ──
  -- 招式：顺风（Tailwind）— 使用时设置
  (29, 2, 366, 2, NULL, NULL, NULL, NULL, 4, NULL, 'Tailwind: sets on use');

-- ==========================================================================
-- FIELD-WIDE EFFECTS (kind=5): field_effect_id 30~33
-- ==========================================================================

INSERT INTO field_effect_sources
  (field_effect_id, source_type, source_id, trigger_method, layers, turns_override, condition_key, probability, generation_start, generation_end, note)
VALUES
-- ── 戏法空间 (id=30, trick-room) ──
  -- 招式：戏法空间（Trick Room）— 使用时设置/解除（toggle）
  (30, 2, 433, 2, NULL, NULL, NULL, NULL, 4, NULL, 'Trick Room: sets/cancels on use'),

-- ── 重力 (id=31, gravity) ──
  -- 招式：重力（Gravity）— 使用时设置
  (31, 2, 356, 2, NULL, NULL, NULL, NULL, 4, NULL, 'Gravity: sets on use'),

-- ── 魔法空间 (id=32, magic-room) ──
  -- 招式：魔法空间（Magic Room）— 使用时设置/解除（toggle）
  (32, 2, 478, 2, NULL, NULL, NULL, NULL, 5, NULL, 'Magic Room: sets/cancels on use'),

-- ── 奇妙空间 (id=33, wonder-room) ──
  -- 招式：奇妙空间（Wonder Room）— 使用时设置/解除（toggle）
  (33, 2, 472, 2, NULL, NULL, NULL, NULL, 5, NULL, 'Wonder Room: sets/cancels on use');

-- DONE
