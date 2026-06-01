-- ═══════════════════════════════════════════════════════════════════════════════
-- 战斗效果示例数据
-- 
-- 本文件演示如何将特性/道具/招式的战斗效果结构化录入数据库。
-- 每条记录后附注释说明对应的实际游戏机制。
--
-- 枚举值参考: packages/store/shared-types/src/battle-effects.ts
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 招式标签 (move_flags)
-- ─────────────────────────────────────────────────────────────────────────────

-- 地震 (id=89): 无特殊标签
-- 十万伏特 (id=85): 无特殊标签
-- 近身战 (id=370): 接触
INSERT OR IGNORE INTO move_flags (move_id, flag) VALUES (370, 1);  -- CONTACT=1
-- 子弹拳 (id=418): 接触 + 拳类
INSERT OR IGNORE INTO move_flags (move_id, flag) VALUES (418, 1);  -- CONTACT
INSERT OR IGNORE INTO move_flags (move_id, flag) VALUES (418, 3);  -- PUNCH=3
-- 水流喷射 (id=453): 接触
INSERT OR IGNORE INTO move_flags (move_id, flag) VALUES (453, 1);  -- CONTACT
-- 流星群 (id=434): 无特殊标签
-- 音爆 (id=49): 声音
INSERT OR IGNORE INTO move_flags (move_id, flag) VALUES (49, 2);   -- SOUND=2


-- ═══════════════════════════════════════════════════════════════════════════════
-- 特性战斗效果 (ability_battle_effects)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 硬爪 (id=181) — 使用接触类招式时威力×1.3
--    effect_type: BASE_POWER_MULTIPLY (201)
--    trigger: ON_ATTACK (7)
--    target: SELF (1)
--    modifier_type: MULTIPLY (1)
--    modifier_value: 1.3
--    affected_move_flag: CONTACT (1)
--    备注: Gen6 引入，至今有效
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ability_battle_effects
  (ability_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, generation_start, generation_end, priority, note)
VALUES
  (181, 201, 7, 1, 1, 1.3,
   NULL, NULL, 1, NULL,
   NULL, 6, NULL, 0, '使用接触类招式时基础威力×1.3');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 适应力 (id=91) — 本系加成由1.5提升为2.0
--    effect_type: STAB_MODIFY (305)
--    trigger: ALWAYS (1)
--    target: SELF (1)
--    modifier_type: MULTIPLY (1)
--    modifier_value: 2.0 (直接替代默认的1.5)
--    备注: Gen4 引入
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ability_battle_effects
  (ability_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, generation_start, generation_end, priority, note)
VALUES
  (91, 305, 1, 1, 1, 2.0,
   NULL, NULL, NULL, NULL,
   NULL, 4, NULL, 0, 'STAB 加成由1.5变为2.0');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 蓄电 (id=10) — 免疫电属性招式，并回复1/4最大HP
--    effect_type: TYPE_ABSORB (302)
--    trigger: WHEN_HIT_BY_TYPE (12)
--    target: SELF (1)
--    modifier_type: FRACTION (9)
--    modifier_value: 0.25 (回复25%HP)
--    affected_type: 4 (电)
--    备注: Gen3 引入
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ability_battle_effects
  (ability_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, generation_start, generation_end, priority, note)
VALUES
  (10, 302, 12, 1, 9, 0.25,
   NULL, 4, NULL, NULL,
   NULL, 3, NULL, 0, '免疫电属性并回复25%HP');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 威吓 (id=22) — 登场时降低对手攻击1级
--    effect_type: STAT_STAGE (102)
--    trigger: ON_SWITCH_IN (2)
--    target: ALL_OPPONENTS (3)
--    modifier_type: ADD_STAGE (2)
--    modifier_value: -1
--    affected_stat: ATK (2)
--    备注: Gen3 引入
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ability_battle_effects
  (ability_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, generation_start, generation_end, priority, note)
VALUES
  (22, 102, 2, 3, 2, -1,
   2, NULL, NULL, NULL,
   NULL, 3, NULL, 0, '登场时降低所有对手攻击等级1级');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 沙之力 (id=159) — 沙暴天气中岩/地/钢属性招式威力×1.3
--    需要3条记录（每种属性一条），或用 params 存储属性列表
--    方案：用 params JSON 存储受益属性列表，effect_type 用 WEATHER_POWER_MODIFY
--    effect_type: WEATHER_POWER_MODIFY (205)
--    trigger: IN_WEATHER (5)
--    target: SELF (1)
--    modifier_type: MULTIPLY (1)
--    modifier_value: 1.3
--    params: {"weather": 3, "boosted_types": [13, 9, 17]}
--      weather=3 (SAND), boosted_types: 岩石=13, 地面=9, 钢=17
--    备注: Gen5 引入
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ability_battle_effects
  (ability_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, generation_start, generation_end, priority, note)
VALUES
  (159, 205, 5, 1, 1, 1.3,
   NULL, NULL, NULL, NULL,
   '{"weather": 3, "boosted_types": [13, 9, 17]}', 5, NULL, 0,
   '沙暴中岩石/地面/钢属性招式威力×1.3');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 铁拳 (id=89) — 拳类招式威力×1.2
--    effect_type: BASE_POWER_MULTIPLY (201)
--    trigger: ON_ATTACK (7)
--    target: SELF (1)
--    modifier_type: MULTIPLY (1)
--    modifier_value: 1.2
--    affected_move_flag: PUNCH (3)
--    备注: Gen4 引入
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ability_battle_effects
  (ability_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, generation_start, generation_end, priority, note)
VALUES
  (89, 201, 7, 1, 1, 1.2,
   NULL, NULL, 3, NULL,
   NULL, 4, NULL, 0, '使用拳类招式时基础威力×1.2');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. 超级发射器 (id=178) — 波动/脉冲类招式威力×1.5
--    effect_type: BASE_POWER_MULTIPLY (201)
--    trigger: ON_ATTACK (7)
--    target: SELF (1)
--    modifier_type: MULTIPLY (1)
--    modifier_value: 1.5
--    affected_move_flag: PULSE (5)
--    备注: Gen6 引入
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ability_battle_effects
  (ability_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, generation_start, generation_end, priority, note)
VALUES
  (178, 201, 7, 1, 1, 1.5,
   NULL, NULL, 5, NULL,
   NULL, 6, NULL, 0, '使用波动/脉冲类招式时威力×1.5');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. 干燥皮肤 (id=87) — 多重效果特性，需要多条记录
--    效果A: 免疫水属性并回复1/4HP
--    效果B: 火属性招式伤害×1.25
-- ─────────────────────────────────────────────────────────────────────────────

-- 效果A: 水属性吸收
INSERT INTO ability_battle_effects
  (ability_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, generation_start, generation_end, priority, note)
VALUES
  (87, 302, 12, 1, 9, 0.25,
   NULL, 3, NULL, NULL,
   NULL, 4, NULL, 0, '免疫水属性并回复25%HP');

-- 效果B: 火属性弱点强化
INSERT INTO ability_battle_effects
  (ability_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, generation_start, generation_end, priority, note)
VALUES
  (87, 202, 12, 1, 1, 1.25,
   NULL, 2, NULL, NULL,
   NULL, 4, NULL, 1, '受到火属性招式伤害×1.25');


-- ═══════════════════════════════════════════════════════════════════════════════
-- 道具战斗效果 (item_battle_effects)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 讲究眼镜 (id=55) — 特攻×1.5，但只能使用最先选择的招式
--    effect_type: STAT_MULTIPLY (101)
--    trigger: ALWAYS (1)
--    target: SELF (1)
--    modifier_type: MULTIPLY (1)
--    modifier_value: 1.5
--    affected_stat: SPA (4)
--    consumable: 0 (不消耗)
--    备注: Gen4 引入
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO item_battle_effects
  (item_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, consumable, species_restriction,
   generation_start, generation_end, priority, note)
VALUES
  (55, 101, 1, 1, 1, 1.5,
   4, NULL, NULL, NULL,
   NULL, 0, NULL,
   4, NULL, 0, '特攻×1.5（锁定招式）');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 生命宝珠 (id=110) — 招式威力×1.3，攻击后损失10%最大HP
--    effect_type: BASE_POWER_MULTIPLY (201)
--    trigger: ON_ATTACK (7)
--    target: SELF (1)
--    modifier_type: MULTIPLY (1)
--    modifier_value: 1.3
--    consumable: 0
--    备注: Gen4 引入
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO item_battle_effects
  (item_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, consumable, species_restriction,
   generation_start, generation_end, priority, note)
VALUES
  (110, 201, 7, 1, 1, 1.3,
   NULL, NULL, NULL, NULL,
   '{"recoil_fraction": 0.1}', 0, NULL,
   4, NULL, 0, '攻击招式威力×1.3，使用后损失10%HP');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 气势披带 (id=113) — HP满时可承受一次致命攻击保留1HP
--    effect_type: SURVIVAL (703)
--    trigger: HP_FULL (4)
--    target: SELF (1)
--    modifier_type: FIXED_VALUE (8)
--    modifier_value: 1 (保留1HP)
--    consumable: 1 (消耗品)
--    备注: Gen4 引入
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO item_battle_effects
  (item_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, consumable, species_restriction,
   generation_start, generation_end, priority, note)
VALUES
  (113, 703, 4, 1, 8, 1,
   NULL, NULL, NULL, NULL,
   NULL, 1, NULL,
   4, NULL, 0, 'HP满时承受致命伤害后保留1HP（消耗）');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 弱点保险 (id=167) — 受到超效伤害后攻击和特攻各+2级
--    需要两条记录：攻击+2 和 特攻+2
--    effect_type: STAT_STAGE (102)
--    trigger: ON_SUPER_EFFECTIVE_RECEIVED (10)
--    target: SELF (1)
--    modifier_type: ADD_STAGE (2)
--    consumable: 1
--    备注: Gen6 引入
-- ─────────────────────────────────────────────────────────────────────────────

-- 攻击+2
INSERT INTO item_battle_effects
  (item_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, consumable, species_restriction,
   generation_start, generation_end, priority, note)
VALUES
  (167, 102, 10, 1, 2, 2,
   2, NULL, NULL, NULL,
   NULL, 1, NULL,
   6, NULL, 0, '受到超效伤害后攻击+2级（消耗）');

-- 特攻+2
INSERT INTO item_battle_effects
  (item_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, consumable, species_restriction,
   generation_start, generation_end, priority, note)
VALUES
  (167, 102, 10, 1, 2, 2,
   4, NULL, NULL, NULL,
   NULL, 1, NULL,
   6, NULL, 1, '受到超效伤害后特攻+2级（消耗）');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 突击背心 (id=169) — 特防×1.5，但不能使用变化招式
--    effect_type: STAT_MULTIPLY (101)
--    trigger: ALWAYS (1)
--    target: SELF (1)
--    modifier_type: MULTIPLY (1)
--    modifier_value: 1.5
--    affected_stat: SPD (5)
--    consumable: 0
--    备注: Gen6 引入
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO item_battle_effects
  (item_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, consumable, species_restriction,
   generation_start, generation_end, priority, note)
VALUES
  (169, 101, 1, 1, 1, 1.5,
   5, NULL, NULL, NULL,
   '{"block_category": 3}', 0, NULL,
   6, NULL, 0, '特防×1.5（不能使用变化招式）');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 达人带 (id=108) — 超效攻击时伤害×1.2
--    effect_type: SUPER_EFFECTIVE_MODIFY (203)
--    trigger: ON_ATTACK (7)
--    target: SELF (1)
--    modifier_type: MULTIPLY (1)
--    modifier_value: 1.2
--    consumable: 0
--    备注: Gen4 引入
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO item_battle_effects
  (item_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, consumable, species_restriction,
   generation_start, generation_end, priority, note)
VALUES
  (108, 203, 7, 1, 1, 1.2,
   NULL, NULL, NULL, NULL,
   NULL, 0, NULL,
   4, NULL, 0, '超效攻击伤害×1.2');


-- ═══════════════════════════════════════════════════════════════════════════════
-- 招式战斗效果 (move_battle_effects)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 近身战 (id=370) — 使用后自身防御-1，特防-1
--    effect_type: STAT_STAGE (102)
--    trigger: ON_ATTACK (7)
--    target: SELF (1)
--    modifier_type: ADD_STAGE (2)
--    备注: Gen4 引入
-- ─────────────────────────────────────────────────────────────────────────────

-- 防御-1
INSERT INTO move_battle_effects
  (move_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, generation_start, generation_end, priority, note)
VALUES
  (370, 102, 7, 1, 2, -1,
   3, NULL, NULL, NULL,
   NULL, 4, NULL, 0, '使用后自身防御-1级');

-- 特防-1
INSERT INTO move_battle_effects
  (move_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, generation_start, generation_end, priority, note)
VALUES
  (370, 102, 7, 1, 2, -1,
   5, NULL, NULL, NULL,
   NULL, 4, NULL, 1, '使用后自身特防-1级');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 流星群 (id=434) — 使用后自身特攻-2
--    effect_type: STAT_STAGE (102)
--    trigger: ON_ATTACK (7)
--    target: SELF (1)
--    modifier_type: ADD_STAGE (2)
--    modifier_value: -2
--    affected_stat: SPA (4)
--    备注: Gen4 引入
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO move_battle_effects
  (move_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, generation_start, generation_end, priority, note)
VALUES
  (434, 102, 7, 1, 2, -2,
   4, NULL, NULL, NULL,
   NULL, 4, NULL, 0, '使用后自身特攻-2级');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 子弹拳 (id=418) — 先制招式 +1 优先度
--    effect_type: PRIORITY_MODIFY (601)
--    trigger: ALWAYS (1)
--    target: SELF (1)
--    modifier_type: FIXED_VALUE (8)
--    modifier_value: 1 (优先度+1)
--    备注: Gen4 引入
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO move_battle_effects
  (move_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, generation_start, generation_end, priority, note)
VALUES
  (418, 601, 1, 1, 8, 1,
   NULL, NULL, NULL, NULL,
   NULL, 4, NULL, 0, '优先度+1');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 水流喷射 (id=453) — 先制招式 +1 优先度
--    与子弹拳同理
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO move_battle_effects
  (move_id, effect_type, trigger, target, modifier_type, modifier_value,
   affected_stat, affected_type, affected_move_flag, affected_move_category,
   params, generation_start, generation_end, priority, note)
VALUES
  (453, 601, 1, 1, 8, 1,
   NULL, NULL, NULL, NULL,
   NULL, 4, NULL, 0, '优先度+1');
