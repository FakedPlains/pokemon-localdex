/**
 * 战斗效果查询 — 特性/道具/招式的结构化效果 + 招式标签
 */

import { eq, and, or, isNull, lte, gte, inArray } from "drizzle-orm";
import {
  abilityBattleEffects,
  itemBattleEffects,
  moveBattleEffects,
  moveFlags,
} from "@pokemon-localdex/drizzle-schema";
import type {
  AbilityBattleEffect,
  ItemBattleEffect,
  MoveBattleEffect,
  MoveFlag,
} from "@pokemon-localdex/store-types/battle-effects";

// ══════════════════════════════════════════════════════════════════════════════
// 行映射工具
// ══════════════════════════════════════════════════════════════════════════════

function mapAbilityRow(row: any): AbilityBattleEffect {
  return {
    id: row.id,
    entityId: row.abilityId,
    abilityId: row.abilityId,
    effectType: row.effectType,
    trigger: row.trigger,
    target: row.target,
    modifierType: row.modifierType,
    modifierValue: row.modifierValue ?? null,
    affectedStat: row.affectedStat ?? null,
    affectedType: row.affectedType ?? null,
    affectedMoveFlag: row.affectedMoveFlag ?? null,
    affectedMoveCategory: row.affectedMoveCategory ?? null,
    params: row.params ?? null,
    generationStart: row.generationStart,
    generationEnd: row.generationEnd ?? null,
    priority: row.priority,
    note: row.note ?? null,
  };
}

function mapItemRow(row: any): ItemBattleEffect {
  return {
    id: row.id,
    entityId: row.itemId,
    itemId: row.itemId,
    effectType: row.effectType,
    trigger: row.trigger,
    target: row.target,
    modifierType: row.modifierType,
    modifierValue: row.modifierValue ?? null,
    affectedStat: row.affectedStat ?? null,
    affectedType: row.affectedType ?? null,
    affectedMoveFlag: row.affectedMoveFlag ?? null,
    affectedMoveCategory: row.affectedMoveCategory ?? null,
    params: row.params ?? null,
    consumable: row.consumable === 1,
    speciesRestriction: row.speciesRestriction ?? null,
    generationStart: row.generationStart,
    generationEnd: row.generationEnd ?? null,
    priority: row.priority,
    note: row.note ?? null,
  };
}

function mapMoveRow(row: any): MoveBattleEffect {
  return {
    id: row.id,
    entityId: row.moveId,
    moveId: row.moveId,
    effectType: row.effectType,
    trigger: row.trigger,
    target: row.target,
    modifierType: row.modifierType,
    modifierValue: row.modifierValue ?? null,
    affectedStat: row.affectedStat ?? null,
    affectedType: row.affectedType ?? null,
    affectedMoveFlag: row.affectedMoveFlag ?? null,
    affectedMoveCategory: row.affectedMoveCategory ?? null,
    params: row.params ?? null,
    generationStart: row.generationStart,
    generationEnd: row.generationEnd ?? null,
    priority: row.priority,
    note: row.note ?? null,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 世代条件构建
// ══════════════════════════════════════════════════════════════════════════════

export function genCondition(table: any, generation?: number) {
  if (!generation) return undefined;
  return and(
    lte(table.generationStart, generation),
    or(isNull(table.generationEnd), gte(table.generationEnd, generation)),
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 查询函数
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 获取特性的战斗效果列表。
 * @param generation 可选，传入时只返回该世代有效的效果
 */
export async function getAbilityBattleEffectRows(
  db: any,
  abilityId: number,
  generation?: number,
): Promise<AbilityBattleEffect[]> {
  const conditions = [eq(abilityBattleEffects.abilityId, abilityId)];
  const genCond = genCondition(abilityBattleEffects, generation);
  if (genCond) conditions.push(genCond);

  const rows = await db
    .select()
    .from(abilityBattleEffects)
    .where(and(...conditions))
    .orderBy(abilityBattleEffects.priority);

  return rows.map(mapAbilityRow);
}

/**
 * 获取道具的战斗效果列表。
 * @param generation 可选，传入时只返回该世代有效的效果
 */
export async function getItemBattleEffectRows(
  db: any,
  itemId: number,
  generation?: number,
): Promise<ItemBattleEffect[]> {
  const conditions = [eq(itemBattleEffects.itemId, itemId)];
  const genCond = genCondition(itemBattleEffects, generation);
  if (genCond) conditions.push(genCond);

  const rows = await db
    .select()
    .from(itemBattleEffects)
    .where(and(...conditions))
    .orderBy(itemBattleEffects.priority);

  return rows.map(mapItemRow);
}

/**
 * 获取招式的战斗效果列表。
 * @param generation 可选，传入时只返回该世代有效的效果
 */
export async function getMoveBattleEffectRows(
  db: any,
  moveId: number,
  generation?: number,
): Promise<MoveBattleEffect[]> {
  const conditions = [eq(moveBattleEffects.moveId, moveId)];
  const genCond = genCondition(moveBattleEffects, generation);
  if (genCond) conditions.push(genCond);

  const rows = await db
    .select()
    .from(moveBattleEffects)
    .where(and(...conditions))
    .orderBy(moveBattleEffects.priority);

  return rows.map(mapMoveRow);
}

/**
 * 获取招式的标签列表。
 */
export async function getMoveFlagRows(
  db: any,
  moveId: number,
): Promise<MoveFlag[]> {
  const rows = await db
    .select({ flag: moveFlags.flag })
    .from(moveFlags)
    .where(eq(moveFlags.moveId, moveId));

  return rows.map((r: any) => r.flag as MoveFlag);
}

/**
 * 批量获取多个招式的标签（避免 N+1）。
 * 返回 Map<moveId, MoveFlag[]>
 */
export async function getMoveFlagsBatch(
  db: any,
  moveIds: number[],
): Promise<Map<number, MoveFlag[]>> {
  if (moveIds.length === 0) return new Map();

  const rows = await db
    .select({ moveId: moveFlags.moveId, flag: moveFlags.flag })
    .from(moveFlags)
    .where(inArray(moveFlags.moveId, moveIds));

  const result = new Map<number, MoveFlag[]>();
  for (const row of rows) {
    const list = result.get(row.moveId) ?? [];
    list.push(row.flag as MoveFlag);
    result.set(row.moveId, list);
  }
  return result;
}
