/**
 * @pokemon-localdex/battle-core — 类型定义
 *
 * 伤害计算引擎的所有类型、接口定义集中在此文件。
 */

// ══════════════════════════════════════════════════════════════════════════════
// 基础类型
// ══════════════════════════════════════════════════════════════════════════════

export type StatsTable = {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
};

// ══════════════════════════════════════════════════════════════════════════════
// 计算输入/输出类型
// ══════════════════════════════════════════════════════════════════════════════

export type PokemonCalcInput = {
  pokemonId?: string | number;  // 宝可梦数据库 ID（优先）
  formId?: string | number;     // 形态数据库 ID（优先）
  name?: string;                // 宝可梦中文名（fallback）
  level?: number;               // 等级，默认 50
  nature?: string;              // 性格中文名，默认 "认真"
  abilityId?: string | number;  // 特性数据库 ID（优先）
  ability?: string;             // 特性中文名（fallback）
  abilityOn?: boolean;          // 特性是否激活（如威吓），默认 true
  itemId?: string | number;     // 道具数据库 ID（优先）
  item?: string;                // 道具中文名（fallback）
  gender?: string;              // 性别: "M" | "F" | "N"
  evs?: Partial<StatsTable>;
  ivs?: Partial<StatsTable>;
  boosts?: Partial<StatsTable>;
  curHP?: number;               // 当前 HP（非满血计算用）
  status?: string;              // 状态: "burn" | "paralysis" | "poison" | "sleep" | "freeze" | "tox" | ""
  toxicCounter?: number;        // 剧毒回合计数（status 为 tox 时生效）
  teraType?: string;            // 太晶属性中文名
  isDynamaxed?: boolean;        // 是否极巨化
  alliesFainted?: number;       // 已倒下队友数（影响灵魂之心等）
  boostedStat?: string;         // 古代活性/夸克充能强化的能力
  overrides?: {                 // 手动覆盖种族值/属性
    baseStats?: Partial<StatsTable>;
    types?: [string, string?];  // [属性1, 属性2?]
  };
};

export type SideInput = {
  isSR?: boolean;
  spikes?: number;
  steelsurge?: boolean;         // 钢刺
  isReflect?: boolean;
  isLightScreen?: boolean;
  isAuroraVeil?: boolean;
  isProtected?: boolean;
  isSeeded?: boolean;           // 寄生种子
  isSaltCured?: boolean;        // 盐腌
  isForesight?: boolean;        // 识破
  isTailwind?: boolean;
  isHelpingHand?: boolean;
  isFlowerGift?: boolean;       // 花之礼
  isPowerTrick?: boolean;
  isSteelySpirit?: boolean;     // 钢之意志
  isFriendGuard?: boolean;
  isBattery?: boolean;          // 蓄电池
  isPowerSpot?: boolean;        // 能量点
  isSwitching?: "in" | "out";
};

export type DamageCalcInput = {
  generation: number;  // 世代 0-9（0 为 Champions 模式）
  attacker: PokemonCalcInput;
  defender: PokemonCalcInput;
  move: {
    id?: string | number;   // 招式数据库 ID（优先）
    name?: string;          // 招式中文名（fallback）
    isCrit?: boolean;       // 是否暴击
    hits?: number;          // 连续攻击次数
    timesUsed?: number;     // 招式已使用次数（影响怒火冲天等）
    timesUsedWithMetronome?: number; // 节拍器连续使用次数
    useZ?: boolean;         // 是否使用 Z 招式（Gen 7）
    useMax?: boolean;       // 是否使用极巨招式（Gen 8）
    isStellarFirstUse?: boolean; // 星晶属性首次使用
    overrides?: {           // 手动覆盖招式属性
      basePower?: number;
      type?: string;
      category?: string;
    };
  };
  field?: {
    gameType?: "singles" | "doubles";
    weather?: string;       // "none" | "sun" | "rain" | "sand" | "hail" | "snow" | "harshSunlight" | "heavyRain" | "strongWinds"
    terrain?: string;       // "none" | "electric" | "grassy" | "misty" | "psychic"
    isGravity?: boolean;
    isMagicRoom?: boolean;
    isWonderRoom?: boolean;
    isBeadsOfRuin?: boolean;   // 灾祸之珠
    isTabletsOfRuin?: boolean; // 灾祸之碑
    isSwordOfRuin?: boolean;   // 灾祸之剑
    isVesselOfRuin?: boolean;  // 灾祸之鼎
    attackerSide?: SideInput;
    defenderSide?: SideInput;
  };
};

/**
 * 伤害因素的影响方向
 */
export type FactorEffect = "boost" | "reduce" | "neutral";

/**
 * 单个伤害因素
 */
export type DamageFactor = {
  name: string;        // 因素名称（中文）
  effect: FactorEffect; // 影响方向
  value?: string;      // 可选的具体数值描述（如 "×2"、"×0.5"）
  category: "type" | "stab" | "weather" | "terrain" | "ability" | "item" | "field" | "status" | "critical";
};

/**
 * 伤害分解明细
 */
export type DamageBreakdown = {
  /** 属性克制倍率（如 0.25, 0.5, 1, 2, 4） */
  typeEffectiveness: number;
  /** 是否有本属性加成（STAB） */
  stab: boolean;
  /** 参与计算的所有因素列表 */
  factors: DamageFactor[];
};

export type DamageCalcResult = {
  min: number;
  max: number;
  average: number;
  minPercent: number;
  maxPercent: number;
  defenderHp: number;
  description: string;      // @smogon/calc 生成的完整英文描述
  descriptionZh: string;    // 中文版本的总结描述
  damageRolls: number[];    // 所有 16 个乱数伤害值
  breakdown: DamageBreakdown; // 伤害组成部分分解
};

// ══════════════════════════════════════════════════════════════════════════════
// 已解析名称
// ══════════════════════════════════════════════════════════════════════════════

export interface ResolvedNames {
  atkNameEn: string;
  atkAbilityEn: string | undefined;
  atkItemEn: string | undefined;
  defNameEn: string;
  defAbilityEn: string | undefined;
  defItemEn: string | undefined;
  moveNameEn: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// 名称查询接口（由 store 层实现，注入给 resolveNames 使用）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * store 层需要实现的两个原子查询能力。
 * battle-core 的 resolveNames() 通过此接口与 store 解耦。
 */
export interface NameLookup {
  /**
   * 解析宝可梦英文名。
   * 查询优先级由 store 实现决定（通常：formId > pokemonId 默认形态 > nameZh）。
   */
  pokemonNameEn(opts: {
    pokemonId?: string | number;
    formId?: string | number;
    name?: string;
  }): Promise<string | undefined>;

  /**
   * 解析实体（招式/特性/道具）英文名。
   * 查询优先级由 store 实现决定（通常：id > nameZh）。
   */
  entityNameEn(
    kind: "move" | "ability" | "item",
    id?: string | number,
    nameZh?: string,
  ): Promise<string | undefined>;

  /**
   * 查询特性/道具在伤害计算中的倍率修正值。
   * 返回结构体包含 value（倍率）、effectType（效果类型 ID）、affectedStat（受影响能力值 ID）。
   * 可选方法 — 未实现时 breakdown 不显示具体倍率。
   */
  getDamageModifier?(
    kind: "ability" | "item",
    id?: string | number,
    nameZh?: string,
    generation?: number,
  ): Promise<DamageModifierInfo | undefined>;
}

/** getDamageModifier 返回的结构体 */
export interface DamageModifierInfo {
  /** 倍率值，如 1.3、2 */
  value: number;
  /** 效果类型 ID（101=能力值倍率, 201=威力倍率, 202=最终伤害倍率） */
  effectType: number;
  /** 受影响的能力值 ID（2=攻击, 3=防御, 4=特攻 等），仅 effectType=101 时有意义 */
  affectedStat?: number;
}
