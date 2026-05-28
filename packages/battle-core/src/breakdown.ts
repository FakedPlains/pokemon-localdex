/**
 * battle-core — 伤害因素分解 (breakdown) 模块。
 */

import {
  TYPE_EN_TO_ZH,
  WEATHER_EN_TO_ZH,
  TERRAIN_EN_TO_ZH,
} from "@pokemon-localdex/store-types/constants";

import type {
  DamageCalcInput,
  DamageBreakdown,
  DamageFactor,
  NameLookup,
} from "./types.ts";

import {
  getWeatherEffect,
  getTerrainEffect,
  getAbilityEffect,
  pushModifierFactor,
  STAB_MULTIPLIER,
  WEATHER_BOOST,
  WEATHER_REDUCE,
  TERRAIN_BOOST,
  TERRAIN_REDUCE,
  CRITICAL_MULTIPLIER,
  SCREEN_SINGLES,
  SCREEN_DOUBLES,
  BURN_MULTIPLIER,
  PROTECT_MULTIPLIER,
  HELPING_HAND_MULTIPLIER,
} from "./helpers.ts";

// ══════════════════════════════════════════════════════════════════════════════
// buildBreakdown
// ══════════════════════════════════════════════════════════════════════════════

export async function buildBreakdown(
  result: any,
  attacker: any,
  move: any,
  input: DamageCalcInput,
  lookup: NameLookup,
): Promise<DamageBreakdown> {
  const rawDesc = result.rawDesc;
  const factors: DamageFactor[] = [];

  // 1. 属性克制
  const moveType = move.type;
  const defenderTypes = result.defender.teraType && result.defender.teraType !== "Stellar"
    ? [result.defender.teraType]
    : result.defender.types.filter(Boolean);

  let typeEffectiveness = 1;
  try {
    const typeChart = result.gen.types;
    const moveTypeEntry = typeChart.get(moveType.toLowerCase().replace(/\s/g, "") as any);
    if (moveTypeEntry && moveTypeEntry.effectiveness) {
      for (const defType of defenderTypes) {
        if (!defType || defType === "???") continue;
        const eff = moveTypeEntry.effectiveness[defType];
        if (eff !== undefined) {
          typeEffectiveness *= eff;
        }
      }
    }
  } catch {
    typeEffectiveness = 1;
  }

  if (typeEffectiveness !== 1) {
    factors.push({
      name: typeEffectiveness > 1 ? "效果拔群" : "效果不佳",
      effect: typeEffectiveness > 1 ? "boost" : "reduce",
      value: `×${typeEffectiveness}`,
      category: "type",
    });
  }

  // 2. STAB（本属性加成）
  const hasStab = attacker.hasOriginalType(moveType) ||
    (attacker.teraType === moveType && attacker.teraType !== "Stellar");
  if (hasStab) {
    factors.push({
      name: "本属性加成",
      effect: "boost",
      value: STAB_MULTIPLIER,
      category: "stab",
    });
  }

  // 3. 天气（只展示对伤害有实际影响的天气）
  if (rawDesc.weather) {
    const weatherZh = WEATHER_EN_TO_ZH[rawDesc.weather] || rawDesc.weather;
    const weatherEffect = getWeatherEffect(rawDesc.weather, moveType);
    if (weatherEffect !== "neutral") {
      factors.push({
        name: weatherZh,
        effect: weatherEffect,
        value: weatherEffect === "boost" ? WEATHER_BOOST : WEATHER_REDUCE,
        category: "weather",
      });
    }
  }

  // 4. 场地（只展示对伤害有实际影响的场地）
  if (rawDesc.terrain) {
    const terrainZh = TERRAIN_EN_TO_ZH[rawDesc.terrain] || rawDesc.terrain;
    const terrainEffect = getTerrainEffect(rawDesc.terrain, moveType, result.defender.types);
    if (terrainEffect !== "neutral") {
      factors.push({
        name: terrainZh,
        effect: terrainEffect,
        value: terrainEffect === "boost" ? TERRAIN_BOOST : TERRAIN_REDUCE,
        category: "terrain",
      });
    }
  }

  // 5-8. 特性/道具倍率 — 并行查询，减少 D1 round-trip
  const [atkAbilityMod, defAbilityMod, atkItemMod, defItemMod] = await Promise.all([
    rawDesc.attackerAbility && lookup.getDamageModifier
      ? lookup.getDamageModifier("ability", input.attacker.abilityId, input.attacker.ability, input.generation)
      : Promise.resolve(undefined),
    rawDesc.defenderAbility && lookup.getDamageModifier
      ? lookup.getDamageModifier("ability", input.defender.abilityId, input.defender.ability, input.generation)
      : Promise.resolve(undefined),
    rawDesc.attackerItem && lookup.getDamageModifier
      ? lookup.getDamageModifier("item", input.attacker.itemId, input.attacker.item, input.generation)
      : Promise.resolve(undefined),
    rawDesc.defenderItem && lookup.getDamageModifier
      ? lookup.getDamageModifier("item", input.defender.itemId, input.defender.item, input.generation)
      : Promise.resolve(undefined),
  ]);

  // 5. 攻击方特性
  if (rawDesc.attackerAbility) {
    pushModifierFactor(factors, atkAbilityMod, {
      name: input.attacker.ability || rawDesc.attackerAbility,
      defaultEffect: getAbilityEffect(rawDesc.attackerAbility, "attacker"),
      category: "ability",
      side: "attacker",
    });
  }

  // 6. 防守方特性
  if (rawDesc.defenderAbility) {
    pushModifierFactor(factors, defAbilityMod, {
      name: input.defender.ability || rawDesc.defenderAbility,
      defaultEffect: getAbilityEffect(rawDesc.defenderAbility, "defender"),
      category: "ability",
      side: "defender",
    });
  }

  // 7. 攻击方道具
  if (rawDesc.attackerItem) {
    pushModifierFactor(factors, atkItemMod, {
      name: input.attacker.item || rawDesc.attackerItem,
      defaultEffect: "boost",
      category: "item",
      side: "attacker",
    });
  }

  // 8. 防守方道具
  if (rawDesc.defenderItem) {
    pushModifierFactor(factors, defItemMod, {
      name: input.defender.item || rawDesc.defenderItem,
      defaultEffect: "reduce",
      category: "item",
      side: "defender",
    });
  }

  // 9. 烧伤
  if (rawDesc.isBurned) {
    factors.push({
      name: "烧伤",
      effect: "reduce",
      value: BURN_MULTIPLIER,
      category: "status",
    });
  }

  // 10. 暴击
  if (rawDesc.isCritical) {
    factors.push({
      name: "暴击",
      effect: "boost",
      value: CRITICAL_MULTIPLIER,
      category: "critical",
    });
  }

  // 11. 壁类（反射壁/光墙/极光幕）
  // 单打减半（×0.5），双打减为 2/3（≈×0.67）
  const isDoubles = input.field?.gameType === "doubles";
  const screenValue = isDoubles ? SCREEN_DOUBLES : SCREEN_SINGLES;
  if (rawDesc.isReflect) {
    factors.push({
      name: "反射壁",
      effect: "reduce",
      value: screenValue,
      category: "field",
    });
  }
  if (rawDesc.isLightScreen) {
    factors.push({
      name: "光墙",
      effect: "reduce",
      value: screenValue,
      category: "field",
    });
  }
  if (rawDesc.isAuroraVeil) {
    factors.push({
      name: "极光幕",
      effect: "reduce",
      value: screenValue,
      category: "field",
    });
  }

  // 12. 帮助
  if (rawDesc.isHelpingHand) {
    factors.push({
      name: "帮助",
      effect: "boost",
      value: HELPING_HAND_MULTIPLIER,
      category: "field",
    });
  }

  // 13. 灾祸特性（场地效果）
  if (rawDesc.isBeadsOfRuin) {
    factors.push({ name: "灾祸之珠", effect: "boost", category: "field" });
  }
  if (rawDesc.isSwordOfRuin) {
    factors.push({ name: "灾祸之剑", effect: "boost", category: "field" });
  }
  if (rawDesc.isTabletsOfRuin) {
    factors.push({ name: "灾祸之碑", effect: "reduce", category: "field" });
  }
  if (rawDesc.isVesselOfRuin) {
    factors.push({ name: "灾祸之鼎", effect: "reduce", category: "field" });
  }

  // 14. 保护类
  if (rawDesc.isProtected) {
    factors.push({
      name: "守住",
      effect: "reduce",
      value: PROTECT_MULTIPLIER,
      category: "field",
    });
  }

  // 15. 太晶属性
  if (rawDesc.attackerTera) {
    factors.push({
      name: `太晶(${TYPE_EN_TO_ZH[rawDesc.attackerTera] || rawDesc.attackerTera})`,
      effect: "boost",
      category: "type",
    });
  }

  return {
    typeEffectiveness,
    stab: hasStab,
    factors,
  };
}
