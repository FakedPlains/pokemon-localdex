import type { MoveEntry, PokemonEntry } from "@pokemon-localdex/store-types";
import type { PokemonConfig } from "../../utils/teamStorage";
import { evToSp, resolveMoveGenerationRecord } from "../../utils/helpers";

// ══════════════════════════════════════════════
//  内部类型
// ══════════════════════════════════════════════

/** 一侧的战斗状态值（由 useDamageSideState 产出） */
type DamageSideValues = {
  curHP: number;
  status: string;
  toxicCounter: number;
  stealthRock: boolean;
  spikes: number;
  steelsurge: boolean;
  reflect: boolean;
  lightScreen: boolean;
  auroraVeil: boolean;
  protect: boolean;
  helpingHand: boolean;
  tailwind: boolean;
  friendGuard: boolean;
  boost: Record<string, number>;
  switchingOut: boolean;
  seeded: boolean;
  saltCured: boolean;
  foresight: boolean;
  flowerGift: boolean;
  powerTrick: boolean;
  steelySpirit: boolean;
  battery: boolean;
  powerSpot: boolean;
  isDynamaxed: boolean;
  alliesFainted: number;
};

/** 宝可梦配置成员（DamagePage 中 attacker/defender 的形状） */
type DamageMember = Partial<PokemonConfig> & { statMode?: string };

/** buildPokemonPayload 的参数 */
type PokemonPayloadInput = {
  member: DamageMember;
  detail: PokemonEntry | null;
  level: number;
  boosts: Record<string, number>;
  curHP: number;
  status: string;
  toxicCounter: number;
  teraType: string;
  isDynamaxed: boolean;
  alliesFainted: number;
  isChampions: boolean;
};

// ══════════════════════════════════════════════
//  导出类型：buildDamageRequest 的输入
// ══════════════════════════════════════════════

/** buildDamageRequest 接收的完整计算状态 */
export type DamageCalcState = {
  selectedMove: MoveEntry;
  calcDirection: "atk" | "def";
  attacker: DamageMember;
  attackerDetail: PokemonEntry | null;
  defender: DamageMember;
  defenderDetail: PokemonEntry | null;
  generation: string;
  isChampions: boolean;
  level: number;
  // 攻击方招式附加
  critical: boolean;
  moveHits: number;
  useZ: boolean;
  useMax: boolean;
  timesUsed: number;
  timesUsedWithMetronome: number;
  isStellarFirstUse: boolean;
  // 防守方招式附加
  defCritical: boolean;
  defMoveHits: number;
  defUseZ: boolean;
  defUseMax: boolean;
  defTimesUsed: number;
  defTimesUsedWithMetronome: number;
  defIsStellarFirstUse: boolean;
  // 对战模式与场地
  battleMode: "singles" | "doubles";
  weather: string;
  terrain: string;
  gravity: boolean;
  magicRoom: boolean;
  wonderRoom: boolean;
  beadsOfRuin: boolean;
  tabletsOfRuin: boolean;
  swordOfRuin: boolean;
  vesselOfRuin: boolean;
  // 太晶
  atkTeraType: string;
  defTeraType: string;
  // 双方战场状态
  atkSide: DamageSideValues;
  defSide: DamageSideValues;
};

/** buildDamageRequest 返回的 meta 部分 */
export type DamageCalcMeta = {
  selectedMove: MoveEntry;
  generation: string;
  calcDirection: "atk" | "def";
  isReverse: boolean;
  realAttacker: DamageMember;
  realDefender: DamageMember;
};

/** API 返回的伤害计算响应 */
export type DamageApiResponse = {
  min: number;
  max: number;
  average: number;
  description?: string;
  damageRolls?: number[];
  defenderHp?: number;
  minPercent?: number;
  maxPercent?: number;
};

// ══════════════════════════════════════════════
//  内部辅助函数
// ══════════════════════════════════════════════

function resolveEvs(member: DamageMember, isChampions: boolean): Record<string, number> {
  if (!isChampions) return (member.evs as Record<string, number>) || {};
  if (member.sps && Object.keys(member.sps).length > 0) return member.sps as Record<string, number>;
  const evs: Record<string, number> = (member.evs as Record<string, number>) || {};
  const converted: Record<string, number> = {};
  for (const key of Object.keys(evs)) converted[key] = evToSp(evs[key]!);
  return converted;
}

function buildSideState(values: DamageSideValues, switchingDirection: "in" | "out") {
  return {
    isSR: values.stealthRock,
    spikes: values.spikes,
    steelsurge: values.steelsurge,
    isReflect: values.reflect,
    isLightScreen: values.lightScreen,
    isAuroraVeil: values.auroraVeil,
    isProtected: values.protect,
    isHelpingHand: values.helpingHand,
    isTailwind: values.tailwind,
    isFriendGuard: values.friendGuard,
    isSwitching: values.switchingOut ? switchingDirection : undefined,
    isSeeded: values.seeded,
    isSaltCured: values.saltCured,
    isForesight: values.foresight,
    isFlowerGift: values.flowerGift,
    isPowerTrick: values.powerTrick,
    isSteelySpirit: values.steelySpirit,
    isBattery: values.battery,
    isPowerSpot: values.powerSpot,
  };
}

function buildPokemonPayload({
  member,
  detail,
  level,
  boosts,
  curHP,
  status,
  toxicCounter,
  teraType,
  isDynamaxed,
  alliesFainted,
  isChampions,
}: PokemonPayloadInput) {
  return {
    pokemonId: member.pokemonId || "",
    formId: member.formId || "",
    formKey: member.formKey || "",
    name: member.nameZh || detail?.nameZh || "",
    level: Number(level || 50),
    nature: member.nature || "认真",
    abilityId: member.abilityId || "",
    ability: member.abilityName || "",
    itemId: member.itemId || "",
    item: member.itemName || "",
    evs: resolveEvs(member, isChampions),
    ivs: (member.ivs as Record<string, number>) || {},
    boosts: Object.values(boosts).some((v) => v !== 0) ? boosts : undefined,
    curHP: curHP > 0 ? curHP : undefined,
    status: status !== "none" ? status : "",
    toxicCounter: status === "tox" ? toxicCounter : undefined,
    teraType: teraType !== "none" ? teraType : undefined,
    isDynamaxed: isDynamaxed || undefined,
    alliesFainted: alliesFainted > 0 ? alliesFainted : undefined,
  };
}

// ══════════════════════════════════════════════
//  导出函数
// ══════════════════════════════════════════════

export function buildDamageRequest(state: DamageCalcState) {
  const isReverse = state.calcDirection === "def";
  const realAttacker = isReverse ? state.defender : state.attacker;
  const realDefender = isReverse ? state.attacker : state.defender;
  const realAtkDetail = isReverse ? state.defenderDetail : state.attackerDetail;
  const realDefDetail = isReverse ? state.attackerDetail : state.defenderDetail;
  const realAtkSideValues = isReverse ? state.defSide : state.atkSide;
  const realDefSideValues = isReverse ? state.atkSide : state.defSide;
  const realCritical = isReverse ? state.defCritical : state.critical;
  const realMoveHits = isReverse ? state.defMoveHits : state.moveHits;
  const realUseZ = isReverse ? state.defUseZ : state.useZ;
  const realUseMax = isReverse ? state.defUseMax : state.useMax;
  const realTimesUsed = isReverse ? state.defTimesUsed : state.timesUsed;
  const realTimesUsedWithMetronome = isReverse ? state.defTimesUsedWithMetronome : state.timesUsedWithMetronome;
  const realIsStellarFirstUse = isReverse ? state.defIsStellarFirstUse : state.isStellarFirstUse;
  const realAtkTeraType = isReverse ? state.defTeraType : state.atkTeraType;
  const realDefTeraType = isReverse ? state.atkTeraType : state.defTeraType;

  return {
    payload: {
      generation: Number(state.generation),
      attacker: buildPokemonPayload({
        member: realAttacker,
        detail: realAtkDetail,
        level: state.level,
        boosts: realAtkSideValues.boost,
        curHP: realAtkSideValues.curHP,
        status: realAtkSideValues.status,
        toxicCounter: realAtkSideValues.toxicCounter,
        teraType: realAtkTeraType,
        isDynamaxed: realAtkSideValues.isDynamaxed,
        alliesFainted: realAtkSideValues.alliesFainted,
        isChampions: state.isChampions,
      }),
      defender: buildPokemonPayload({
        member: realDefender,
        detail: realDefDetail,
        level: state.level,
        boosts: realDefSideValues.boost,
        curHP: realDefSideValues.curHP,
        status: realDefSideValues.status,
        toxicCounter: realDefSideValues.toxicCounter,
        teraType: realDefTeraType,
        isDynamaxed: realDefSideValues.isDynamaxed,
        alliesFainted: realDefSideValues.alliesFainted,
        isChampions: state.isChampions,
      }),
      move: {
        id: state.selectedMove.id || "",
        name: state.selectedMove.nameZh || "",
        isCrit: realCritical,
        hits: realMoveHits > 0 ? realMoveHits : undefined,
        useZ: realUseZ || undefined,
        useMax: realUseMax || undefined,
        timesUsed: realTimesUsed > 0 ? realTimesUsed : undefined,
        timesUsedWithMetronome: realTimesUsedWithMetronome > 0 ? realTimesUsedWithMetronome : undefined,
        isStellarFirstUse: realIsStellarFirstUse || undefined,
      },
      field: {
        gameType: state.battleMode,
        weather: state.weather,
        terrain: state.terrain,
        isGravity: state.gravity,
        isMagicRoom: state.magicRoom,
        isWonderRoom: state.wonderRoom,
        isBeadsOfRuin: state.beadsOfRuin,
        isTabletsOfRuin: state.tabletsOfRuin,
        isSwordOfRuin: state.swordOfRuin,
        isVesselOfRuin: state.vesselOfRuin,
        attackerSide: buildSideState(realAtkSideValues, "out"),
        defenderSide: buildSideState(realDefSideValues, "in"),
      },
    },
    meta: {
      selectedMove: state.selectedMove,
      generation: state.generation,
      calcDirection: state.calcDirection,
      isReverse,
      realAttacker,
      realDefender,
    } satisfies DamageCalcMeta,
  };
}

export function buildDamageResult(data: DamageApiResponse, meta: DamageCalcMeta) {
  const record = resolveMoveGenerationRecord(meta.selectedMove, Number(meta.generation));
  const moveType = record?.type || meta.selectedMove.type || "";
  const category = record?.category || meta.selectedMove.category || "physical";

  return {
    min: data.min,
    max: data.max,
    average: data.average,
    description: data.description || "",
    damageRolls: data.damageRolls || [],
    moveName: meta.selectedMove.nameZh || "",
    moveType,
    category,
    attackerName: meta.realAttacker.nameZh || (meta.isReverse ? "防守方" : "攻击方"),
    defenderName: meta.realDefender.nameZh || (meta.isReverse ? "攻击方" : "防守方"),
    defHp: data.defenderHp || 0,
    minPercent: data.minPercent || 0,
    maxPercent: data.maxPercent || 0,
    direction: meta.calcDirection,
  };
}
