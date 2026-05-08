/**
 * d1-battle-core: Cloudflare Workers 专用伤害计算引擎
 *
 * 与 packages/battle-core 逻辑完全一致，区别：
 *   - 使用 D1Database（异步）替代 node:sqlite（同步）做中英文名称映射
 *   - 不依赖任何 Node.js 专属 API，可在 workerd 运行时中运行
 */

import { calculate, Pokemon, Move, Field } from "@fakedplains/smogon-calc";

// ── D1 类型（与 d1-store 保持一致，避免循环依赖直接内联） ──

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<D1ExecResult>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}
interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}
interface D1ExecResult {
  count: number;
  duration: number;
}

// ── 性格中英文映射（固定，不查数据库） ──

const NATURE_ZH_TO_EN: Record<string, string> = {
  勤奋: "Hardy",
  怕寂寞: "Lonely",
  固执: "Adamant",
  顽皮: "Naughty",
  勇敢: "Brave",
  大胆: "Bold",
  坦率: "Docile",
  淘气: "Impish",
  乐天: "Lax",
  悠闲: "Relaxed",
  胆小: "Timid",
  急躁: "Hasty",
  认真: "Serious",
  爽朗: "Jolly",
  天真: "Naive",
  内敛: "Modest",
  慢吞吞: "Mild",
  害羞: "Bashful",
  马虎: "Rash",
  冷静: "Quiet",
  温和: "Calm",
  温顺: "Gentle",
  慎重: "Careful",
  浮躁: "Quirky",
  自大: "Sassy",
};

// ── 天气 / 场地 / 属性 / 状态 映射 ──

const WEATHER_MAP: Record<string, string | undefined> = {
  none: undefined,
  sun: "Sun",
  rain: "Rain",
  sand: "Sand",
  hail: "Snow",
  snow: "Snow",
};

const TERRAIN_MAP: Record<string, string | undefined> = {
  none: undefined,
  electric: "Electric",
  grassy: "Grassy",
  misty: "Misty",
  psychic: "Psychic",
};

const TYPE_ZH_TO_EN: Record<string, string> = {
  一般: "Normal",
  火: "Fire",
  水: "Water",
  电: "Electric",
  草: "Grass",
  冰: "Ice",
  格斗: "Fighting",
  毒: "Poison",
  地面: "Ground",
  飞行: "Flying",
  超能力: "Psychic",
  虫: "Bug",
  岩石: "Rock",
  幽灵: "Ghost",
  龙: "Dragon",
  恶: "Dark",
  钢: "Steel",
  妖精: "Fairy",
};

const STATUS_MAP: Record<string, string> = {
  burn: "brn",
  paralysis: "par",
  poison: "psn",
  sleep: "slp",
  freeze: "frz",
  烧伤: "brn",
  麻痹: "par",
  中毒: "psn",
  睡眠: "slp",
  冰冻: "frz",
};

// ── D1 名称查询（异步） ──

async function queryPokemonFormNameEn(
  db: D1Database,
  nameZh: string,
  formKey?: string
): Promise<string | undefined> {
  // 1. 有 formKey 且不是 default：先按 form_key + pokemon 中文名查
  if (formKey && formKey !== "default") {
    const row = await db
      .prepare(
        `SELECT pf.name_en FROM pokemon_forms pf
         JOIN pokemon p ON pf.pokemon_id = p.id
         WHERE pf.form_key = ? AND p.name_zh = ? LIMIT 1`
      )
      .bind(formKey, nameZh)
      .first<{ name_en: string }>();
    if (row?.name_en) return row.name_en;

    // 2. 只用 form_key 查（不依赖 nameZh）
    const row2 = await db
      .prepare(
        `SELECT name_en FROM pokemon_forms WHERE form_key = ? AND name_en IS NOT NULL LIMIT 1`
      )
      .bind(formKey)
      .first<{ name_en: string }>();
    if (row2?.name_en) return row2.name_en;
  }

  // 3. 用中文名查 pokemon_forms（形态中文名直接传入的情况）
  const row3 = await db
    .prepare(
      `SELECT name_en FROM pokemon_forms WHERE name_zh = ? AND name_en IS NOT NULL LIMIT 1`
    )
    .bind(nameZh)
    .first<{ name_en: string }>();
  if (row3?.name_en) return row3.name_en;

  // 4. fallback：查基础宝可梦表
  const row4 = await db
    .prepare(`SELECT name_en FROM pokemon WHERE name_zh = ? LIMIT 1`)
    .bind(nameZh)
    .first<{ name_en: string }>();
  return row4?.name_en ?? undefined;
}

async function queryMoveNameEn(
  db: D1Database,
  nameZh: string
): Promise<string | undefined> {
  const row = await db
    .prepare(`SELECT name_en FROM moves WHERE name_zh = ? LIMIT 1`)
    .bind(nameZh)
    .first<{ name_en: string }>();
  return row?.name_en ?? undefined;
}

async function queryAbilityNameEn(
  db: D1Database,
  nameZh: string
): Promise<string | undefined> {
  const row = await db
    .prepare(`SELECT name_en FROM abilities WHERE name_zh = ? LIMIT 1`)
    .bind(nameZh)
    .first<{ name_en: string }>();
  return row?.name_en ?? undefined;
}

async function queryItemNameEn(
  db: D1Database,
  nameZh: string
): Promise<string | undefined> {
  const row = await db
    .prepare(`SELECT name_en FROM items WHERE name_zh = ? LIMIT 1`)
    .bind(nameZh)
    .first<{ name_en: string }>();
  return row?.name_en ?? undefined;
}

function natureZhToEn(natureZh: string): string {
  return NATURE_ZH_TO_EN[natureZh] ?? "Serious";
}

// ── 类型定义（与 battle-core 完全一致） ──

export type StatsTable = {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
};

export type DamageCalcInput = {
  generation: number;
  attacker: {
    name: string;
    formKey?: string;
    level?: number;
    nature?: string;
    ability?: string;
    item?: string;
    evs?: Partial<StatsTable>;
    ivs?: Partial<StatsTable>;
    boosts?: Partial<StatsTable>;
    status?: string;
    teraType?: string;
  };
  defender: {
    name: string;
    formKey?: string;
    level?: number;
    nature?: string;
    ability?: string;
    item?: string;
    evs?: Partial<StatsTable>;
    ivs?: Partial<StatsTable>;
    boosts?: Partial<StatsTable>;
    status?: string;
    teraType?: string;
  };
  move: {
    name: string;
    isCrit?: boolean;
    hits?: number;
  };
  field?: {
    gameType?: "singles" | "doubles";
    weather?: string;
    terrain?: string;
    isGravity?: boolean;
    isMagicRoom?: boolean;
    isWonderRoom?: boolean;
    attackerSide?: {
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
    defenderSide?: {
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
  };
};

export type DamageCalcResult = {
  min: number;
  max: number;
  average: number;
  minPercent: number;
  maxPercent: number;
  defenderHp: number;
  description: string;
  damageRolls: number[];
};

// ── 主计算函数（异步，接受 D1Database） ──

export async function calculateDamageD1(
  db: D1Database,
  input: DamageCalcInput
): Promise<DamageCalcResult> {
  const gen = input.generation as any;

  // 并行查询所有名称映射，减少 D1 往返次数
  const [
    atkNameEn,
    atkAbilityEn,
    atkItemEn,
    defNameEn,
    defAbilityEn,
    defItemEn,
    moveNameEn,
  ] = await Promise.all([
    queryPokemonFormNameEn(db, input.attacker.name, input.attacker.formKey),
    input.attacker.ability
      ? queryAbilityNameEn(db, input.attacker.ability)
      : Promise.resolve(undefined),
    input.attacker.item
      ? queryItemNameEn(db, input.attacker.item)
      : Promise.resolve(undefined),
    queryPokemonFormNameEn(db, input.defender.name, input.defender.formKey),
    input.defender.ability
      ? queryAbilityNameEn(db, input.defender.ability)
      : Promise.resolve(undefined),
    input.defender.item
      ? queryItemNameEn(db, input.defender.item)
      : Promise.resolve(undefined),
    queryMoveNameEn(db, input.move.name),
  ]);

  // ── 构建攻击方 ──
  const atkTeraType = input.attacker.teraType
    ? (TYPE_ZH_TO_EN[input.attacker.teraType] ?? input.attacker.teraType)
    : undefined;
  const atkStatus = input.attacker.status
    ? (STATUS_MAP[input.attacker.status] ?? "")
    : "";

  const attacker = new Pokemon(gen, atkNameEn ?? input.attacker.name, {
    level: input.attacker.level ?? 50,
    nature: natureZhToEn(input.attacker.nature ?? "认真"),
    ability: (atkAbilityEn || input.attacker.ability) || undefined,
    item: (atkItemEn || input.attacker.item) || undefined,
    evs: input.attacker.evs as any,
    ivs: input.attacker.ivs as any,
    boosts: input.attacker.boosts as any,
    status: atkStatus as any,
    teraType: atkTeraType as any,
  });

  // ── 构建防守方 ──
  const defTeraType = input.defender.teraType
    ? (TYPE_ZH_TO_EN[input.defender.teraType] ?? input.defender.teraType)
    : undefined;
  const defStatus = input.defender.status
    ? (STATUS_MAP[input.defender.status] ?? "")
    : "";

  const defender = new Pokemon(gen, defNameEn ?? input.defender.name, {
    level: input.defender.level ?? 50,
    nature: natureZhToEn(input.defender.nature ?? "认真"),
    ability: (defAbilityEn || input.defender.ability) || undefined,
    item: (defItemEn || input.defender.item) || undefined,
    evs: input.defender.evs as any,
    ivs: input.defender.ivs as any,
    boosts: input.defender.boosts as any,
    status: defStatus as any,
    teraType: defTeraType as any,
  });

  // ── 构建招式 ──
  const move = new Move(gen, moveNameEn ?? input.move.name, {
    isCrit: input.move.isCrit ?? false,
    hits: input.move.hits,
  });

  // ── 构建场地 ──
  const fieldInput = input.field ?? {};
  const field = new Field({
    gameType: fieldInput.gameType === "doubles" ? "Doubles" : "Singles",
    weather: WEATHER_MAP[fieldInput.weather ?? "none"] as any,
    terrain: TERRAIN_MAP[fieldInput.terrain ?? "none"] as any,
    isGravity: fieldInput.isGravity ?? false,
    isMagicRoom: fieldInput.isMagicRoom ?? false,
    isWonderRoom: fieldInput.isWonderRoom ?? false,
    attackerSide: fieldInput.attackerSide ?? {},
    defenderSide: fieldInput.defenderSide ?? {},
  });

  // ── 执行计算 ──
  const result = calculate(gen, attacker, defender, move, field);

  // ── 解析结果 ──
  const [min, max] = result.range();
  const defenderHp = defender.originalCurHP || defender.rawStats.hp;

  let damageRolls: number[] = [];
  if (Array.isArray(result.damage)) {
    if (Array.isArray(result.damage[0])) {
      damageRolls = (result.damage as number[][])[0];
    } else {
      damageRolls = result.damage as number[];
    }
  } else {
    damageRolls = [result.damage as number];
  }

  const average =
    damageRolls.length > 0
      ? Number(
          (
            damageRolls.reduce((a, b) => a + b, 0) / damageRolls.length
          ).toFixed(1)
        )
      : Number(((min + max) / 2).toFixed(1));

  const minPercent =
    defenderHp > 0 ? Number(((min / defenderHp) * 100).toFixed(1)) : 0;
  const maxPercent =
    defenderHp > 0 ? Number(((max / defenderHp) * 100).toFixed(1)) : 0;

  let description = "";
  try {
    description = result.fullDesc();
  } catch {
    description = `${min} - ${max} (${minPercent}% - ${maxPercent}%)`;
  }

  return {
    min,
    max,
    average,
    minPercent,
    maxPercent,
    defenderHp,
    description,
    damageRolls,
  };
}
