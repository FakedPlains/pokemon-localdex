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
  formKey?: string;             // 形态 key（fallback，如 "超级喷火龙x"）
  level?: number;               // 等级，默认 50
  nature?: string;              // 性格中文名，默认 "认真"
  abilityId?: string | number;  // 特性数据库 ID（优先）
  ability?: string;             // 特性中文名（fallback）
  itemId?: string | number;     // 道具数据库 ID（优先）
  item?: string;                // 道具中文名（fallback）
  evs?: Partial<StatsTable>;
  ivs?: Partial<StatsTable>;
  boosts?: Partial<StatsTable>;
  status?: string;              // 状态: "burn" | "paralysis" | "poison" | "sleep" | ""
  teraType?: string;            // 太晶属性中文名
};

export type SideInput = {
  isSR?: boolean;
  spikes?: number;
  isReflect?: boolean;
  isLightScreen?: boolean;
  isAuroraVeil?: boolean;
  isProtected?: boolean;
  isSeeded?: boolean;
  isSaltCured?: boolean;
  isTailwind?: boolean;
  isHelpingHand?: boolean;
  isPowerTrick?: boolean;
  isFriendGuard?: boolean;
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
  };
  field?: {
    gameType?: "singles" | "doubles";
    weather?: string;       // "none" | "sun" | "rain" | "sand" | "hail" | "snow"
    terrain?: string;       // "none" | "electric" | "grassy" | "misty" | "psychic"
    isGravity?: boolean;
    isMagicRoom?: boolean;
    isWonderRoom?: boolean;
    attackerSide?: SideInput;
    defenderSide?: SideInput;
  };
};

export type DamageCalcResult = {
  min: number;
  max: number;
  average: number;
  minPercent: number;
  maxPercent: number;
  defenderHp: number;
  description: string;      // @smogon/calc 生成的完整描述
  damageRolls: number[];    // 所有 16 个乱数伤害值
};

// ══════════════════════════════════════════════════════════════════════════════
// 名称解析查询参数类型
// ══════════════════════════════════════════════════════════════════════════════

export type PokemonNameQuery = {
  pokemonId?: string | number;
  formId?: string | number;
  formKey?: string;
  nameZh?: string;
};

export type EntityNameQuery = {
  id?: string | number;
  nameZh?: string;
};

// ══════════════════════════════════════════════════════════════════════════════
// 同步名称解析接口（用于 sqlite-store）
// ══════════════════════════════════════════════════════════════════════════════

export interface NameResolver {
  queryPokemonFormNameEn(opts: PokemonNameQuery): string | undefined;
  queryMoveNameEn(opts: EntityNameQuery): string | undefined;
  queryAbilityNameEn(opts: EntityNameQuery): string | undefined;
  queryItemNameEn(opts: EntityNameQuery): string | undefined;
}

// ══════════════════════════════════════════════════════════════════════════════
// 异步名称解析接口（用于 d1-store）
// ══════════════════════════════════════════════════════════════════════════════

export interface DbAdapter {
  queryPokemonFormNameEn(opts: PokemonNameQuery): Promise<string | undefined>;
  queryMoveNameEn(opts: EntityNameQuery): Promise<string | undefined>;
  queryAbilityNameEn(opts: EntityNameQuery): Promise<string | undefined>;
  queryItemNameEn(opts: EntityNameQuery): Promise<string | undefined>;
}

// ══════════════════════════════════════════════════════════════════════════════
// 内部接口（已解析名称）
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
