/**
 * battle-core — 中文描述生成模块。
 */

import {
  TYPE_EN_TO_ZH,
  WEATHER_EN_TO_ZH,
  TERRAIN_EN_TO_ZH,
} from "@pokemon-localdex/store-types/constants";

import type { DamageCalcInput } from "./types.ts";
import { evDescToZh, translateKoChance } from "./helpers.ts";

// ══════════════════════════════════════════════════════════════════════════════
// buildChineseDescription
// ══════════════════════════════════════════════════════════════════════════════

export function buildChineseDescription(
  result: any,
  input: DamageCalcInput,
  min: number,
  max: number,
  minPercent: number,
  maxPercent: number,
): string {
  const rawDesc = result.rawDesc;
  const parts: string[] = [];

  // ── 攻击方部分 ──
  if (rawDesc.attackBoost) {
    parts.push(`${rawDesc.attackBoost > 0 ? "+" : ""}${rawDesc.attackBoost}`);
  }
  const atkEvZh = evDescToZh(rawDesc.attackEVs);
  if (atkEvZh) parts.push(atkEvZh);
  if (rawDesc.attackerItem) {
    const itemZh = input.attacker.item || rawDesc.attackerItem;
    parts.push(itemZh);
  }
  if (rawDesc.attackerAbility) {
    const abilityZh = input.attacker.ability || rawDesc.attackerAbility;
    parts.push(abilityZh);
  }
  if (rawDesc.isBurned) parts.push("烧伤");
  if (rawDesc.attackerTera) {
    const teraZh = TYPE_EN_TO_ZH[rawDesc.attackerTera] || rawDesc.attackerTera;
    parts.push(`太晶${teraZh}`);
  }
  const atkNameZh = input.attacker.name || rawDesc.attackerName;
  parts.push(atkNameZh);

  if (rawDesc.isHelpingHand) parts.push("(帮助)");

  // "的" + 招式名
  const moveNameZh = input.move.name || rawDesc.moveName;
  parts.push("的");
  parts.push(moveNameZh);

  // 招式 BP/类型
  const moveDetails: string[] = [];
  if (rawDesc.moveBP) moveDetails.push(`${rawDesc.moveBP}威力`);
  if (rawDesc.moveType) {
    const typeZh = TYPE_EN_TO_ZH[rawDesc.moveType] || rawDesc.moveType;
    moveDetails.push(typeZh);
  }
  if (moveDetails.length > 0) parts.push(`(${moveDetails.join(" ")})`);

  if (rawDesc.hits) parts.push(`(${rawDesc.hits}次)`);

  parts.push("对");

  // ── 防守方部分 ──
  if (rawDesc.defenseBoost) {
    parts.push(`${rawDesc.defenseBoost > 0 ? "+" : ""}${rawDesc.defenseBoost}`);
  }
  const hpEvZh = evDescToZh(rawDesc.HPEVs);
  if (hpEvZh) parts.push(hpEvZh);
  const defEvZh = evDescToZh(rawDesc.defenseEVs);
  if (defEvZh) parts.push(`/ ${defEvZh}`);
  if (rawDesc.defenderItem) {
    const itemZh = input.defender.item || rawDesc.defenderItem;
    parts.push(itemZh);
  }
  if (rawDesc.defenderAbility) {
    const abilityZh = input.defender.ability || rawDesc.defenderAbility;
    parts.push(abilityZh);
  }
  if (rawDesc.defenderTera) {
    const teraZh = TYPE_EN_TO_ZH[rawDesc.defenderTera] || rawDesc.defenderTera;
    parts.push(`太晶${teraZh}`);
  }
  if (rawDesc.isDefenderDynamaxed) parts.push("极巨化");
  if (rawDesc.isProtected) parts.push("守住中");
  const defNameZh = input.defender.name || rawDesc.defenderName;
  parts.push(defNameZh);

  // ── 场地条件 ──
  const conditions: string[] = [];
  if (rawDesc.weather) {
    conditions.push(WEATHER_EN_TO_ZH[rawDesc.weather] || rawDesc.weather);
  }
  if (rawDesc.terrain) {
    conditions.push(TERRAIN_EN_TO_ZH[rawDesc.terrain] || rawDesc.terrain);
  }
  if (rawDesc.isReflect) conditions.push("反射壁");
  if (rawDesc.isLightScreen) conditions.push("光墙");
  if (rawDesc.isAuroraVeil) conditions.push("极光幕");
  if (rawDesc.isCritical) conditions.push("暴击");
  if (rawDesc.isWonderRoom) conditions.push("奇妙空间");
  if (conditions.length > 0) parts.push(`(${conditions.join("/")})`);

  // ── 伤害数值 ──
  parts.push(":");
  parts.push(`${min}-${max}`);
  parts.push(`(${minPercent}% - ${maxPercent}%)`);

  // ── KO 概率 ──
  const koText = translateKoChance(result);
  if (koText) {
    parts.push("--");
    parts.push(koText);
  }

  return parts.join(" ")
    .replace(/ +/g, " ")
    .replace(/ : /g, ": ")
    .replace(/ 的 /g, "的")
    .replace(/ 对 /g, " 对 ")
    .replace(/([\d%+])(?=[\u4e00-\u9fff])/g, "$1 ")
    .replace(/([\u4e00-\u9fff])(?=\d)/g, "$1 ");
}
