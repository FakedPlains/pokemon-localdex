/**
 * 场地效果查询模块
 *
 * 提供 field_effects（天气/场地/异常状态/场侧/全场）的列表和详情查询。
 * 列表按 kind 分组返回摘要；详情包含修正、世代记录和来源关联。
 */

import { eq, and, asc, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  fieldEffects,
  fieldEffectModifiers,
  fieldEffectGenerationRecords,
  fieldEffectSources,
  moves,
  abilities,
  items,
} from "@pokemon-localdex/drizzle-schema";
import type {
  FieldEffectEntry,
  FieldEffectModifier,
  FieldEffectGenerationRecord,
  FieldEffectDetail,
  FieldEffectSourceType,
  FieldEffectTriggerMethod,
} from "@pokemon-localdex/store-types";

// ══════════════════════════════════════════════════════════════════════════════
// 类型定义
// ══════════════════════════════════════════════════════════════════════════════

/** 来源记录（包含解析后的来源实体名称） */
export type FieldEffectSourceRow = {
  id: number;
  fieldEffectId: number;
  sourceType: FieldEffectSourceType;
  sourceId: number;
  sourceName: string | null;
  triggerMethod: FieldEffectTriggerMethod;
  layers: number | null;
  turnsOverride: number | null;
  conditionKey: string | null;
  probability: number | null;
  generationStart: number;
  generationEnd: number | null;
  note: string | null;
};

/** 场地效果完整详情（含来源） */
export type FieldEffectFullDetail = FieldEffectDetail & {
  sources: FieldEffectSourceRow[];
};

// ══════════════════════════════════════════════════════════════════════════════
// Hydration helpers
// ══════════════════════════════════════════════════════════════════════════════

function hydrateEntry(row: any): FieldEffectEntry {
  return {
    id: Number(row.id),
    kind: Number(row.kind),
    key: String(row.key),
    nameZh: String(row.nameZh),
    nameEn: row.nameEn ? String(row.nameEn) : undefined,
    nameJa: row.nameJa ? String(row.nameJa) : undefined,
    description: row.description ? String(row.description) : undefined,
    introducedGeneration: row.introducedGeneration != null ? Number(row.introducedGeneration) : undefined,
    maxTurns: row.maxTurns != null ? Number(row.maxTurns) : undefined,
    maxLayers: row.maxLayers != null ? Number(row.maxLayers) : undefined,
    source: row.sourceUrl || row.sourceTitle || row.sourceFetchedAt
      ? { url: String(row.sourceUrl ?? ""), title: String(row.sourceTitle ?? ""), fetchedAt: String(row.sourceFetchedAt ?? "") }
      : undefined,
  };
}

function hydrateModifier(row: any): FieldEffectModifier {
  return {
    id: Number(row.id),
    fieldEffectId: Number(row.fieldEffectId),
    effectType: Number(row.effectType),
    trigger: Number(row.trigger),
    target: Number(row.target),
    modifierType: Number(row.modifierType),
    modifierValue: row.modifierValue != null ? Number(row.modifierValue) : null,
    affectedStat: row.affectedStat != null ? Number(row.affectedStat) : null,
    affectedType: row.affectedType != null ? Number(row.affectedType) : null,
    affectedMoveFlag: row.affectedMoveFlag != null ? Number(row.affectedMoveFlag) : null,
    affectedMoveCategory: row.affectedMoveCategory != null ? Number(row.affectedMoveCategory) : null,
    conditionKey: row.conditionKey ? String(row.conditionKey) : null,
    params: row.params ? String(row.params) : null,
    generationStart: Number(row.generationStart),
    generationEnd: row.generationEnd != null ? Number(row.generationEnd) : null,
    priority: Number(row.priority),
    note: row.note ? String(row.note) : null,
  };
}

function hydrateGenerationRecord(row: any): FieldEffectGenerationRecord {
  return {
    generation: Number(row.generation),
    gameVersionCode: row.gameVersionCode ? String(row.gameVersionCode) : undefined,
    versionExclusive: row.versionExclusive ? Boolean(row.versionExclusive) : undefined,
    description: row.description ? String(row.description) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
  };
}

function hydrateSource(row: any): FieldEffectSourceRow {
  return {
    id: Number(row.id),
    fieldEffectId: Number(row.fieldEffectId),
    sourceType: Number(row.sourceType),
    sourceId: Number(row.sourceId),
    sourceName: row.sourceName ? String(row.sourceName) : null,
    triggerMethod: Number(row.triggerMethod),
    layers: row.layers != null ? Number(row.layers) : null,
    turnsOverride: row.turnsOverride != null ? Number(row.turnsOverride) : null,
    conditionKey: row.conditionKey ? String(row.conditionKey) : null,
    probability: row.probability != null ? Number(row.probability) : null,
    generationStart: Number(row.generationStart),
    generationEnd: row.generationEnd != null ? Number(row.generationEnd) : null,
    note: row.note ? String(row.note) : null,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 查询函数
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 列出所有场地效果（可按 kind 筛选）。
 * 返回摘要数组，按 kind -> id 排序。
 */
export async function listFieldEffectRows(
  db: any,
  filters?: { kind?: number },
): Promise<FieldEffectEntry[]> {
  const conditions: SQL[] = [];
  if (filters?.kind != null) {
    conditions.push(eq(fieldEffects.kind, filters.kind));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const rows: any[] = await db
    .select()
    .from(fieldEffects)
    .where(where)
    .orderBy(asc(fieldEffects.kind), asc(fieldEffects.id));

  return rows.map(hydrateEntry);
}

/**
 * 获取单个场地效果详情（含修正、世代记录、来源）。
 */
export async function getFieldEffectRow(
  db: any,
  id: number,
): Promise<FieldEffectFullDetail | undefined> {
  // 主实体
  const [mainRow]: any[] = await db
    .select()
    .from(fieldEffects)
    .where(eq(fieldEffects.id, id))
    .limit(1);

  if (!mainRow) return undefined;

  // 并行查询子表
  const [modifierRows, genRows, rawSourceRows] = await Promise.all([
    db
      .select()
      .from(fieldEffectModifiers)
      .where(eq(fieldEffectModifiers.fieldEffectId, id))
      .orderBy(asc(fieldEffectModifiers.priority), asc(fieldEffectModifiers.id)),
    db
      .select()
      .from(fieldEffectGenerationRecords)
      .where(eq(fieldEffectGenerationRecords.fieldEffectId, id))
      .orderBy(asc(fieldEffectGenerationRecords.generation)),
    db
      .select()
      .from(fieldEffectSources)
      .where(eq(fieldEffectSources.fieldEffectId, id))
      .orderBy(asc(fieldEffectSources.sourceType), asc(fieldEffectSources.sourceId)),
  ]);

  // 批量查询来源实体名称
  const sourceRowsTyped = rawSourceRows as any[];
  const abilityIds = sourceRowsTyped.filter((r: any) => r.sourceType === 1).map((r: any) => r.sourceId);
  const moveIds = sourceRowsTyped.filter((r: any) => r.sourceType === 2).map((r: any) => r.sourceId);
  const itemIds = sourceRowsTyped.filter((r: any) => r.sourceType === 3).map((r: any) => r.sourceId);

  const [abilityNames, moveNames, itemNames] = await Promise.all([
    abilityIds.length > 0
      ? db.select({ id: abilities.id, nameZh: abilities.nameZh }).from(abilities).where(inArray(abilities.id, abilityIds))
      : Promise.resolve([]),
    moveIds.length > 0
      ? db.select({ id: moves.id, nameZh: moves.nameZh }).from(moves).where(inArray(moves.id, moveIds))
      : Promise.resolve([]),
    itemIds.length > 0
      ? db.select({ id: items.id, nameZh: items.nameZh }).from(items).where(inArray(items.id, itemIds))
      : Promise.resolve([]),
  ]);

  // 构建 id -> name 映射
  const nameMap = new Map<string, string>();
  for (const r of abilityNames as any[]) nameMap.set(`1-${r.id}`, r.nameZh);
  for (const r of moveNames as any[]) nameMap.set(`2-${r.id}`, r.nameZh);
  for (const r of itemNames as any[]) nameMap.set(`3-${r.id}`, r.nameZh);

  const entry = hydrateEntry(mainRow);
  return {
    ...entry,
    modifiers: (modifierRows as any[]).map(hydrateModifier),
    generations: (genRows as any[]).map(hydrateGenerationRecord),
    sources: sourceRowsTyped.map((row: any) => ({
      ...hydrateSource(row),
      sourceName: nameMap.get(`${row.sourceType}-${row.sourceId}`) || null,
    })),
  };
}
