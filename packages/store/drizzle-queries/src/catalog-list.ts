import { eq, like, and, or, sql, asc } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { abilities, items, moves } from "@pokemon-localdex/drizzle-schema";
import type {
  AbilityEntry,
  ItemEntry,
  MoveEntry,
  PaginatedResult,
  PaginationParams,
} from "@pokemon-localdex/store-types";

export type MoveListFilters = {
  query?: string;
  type?: string;
  category?: string;
  generation?: number;
} & PaginationParams;

export type AbilityListFilters = {
  query?: string;
  generation?: number;
} & PaginationParams;

export type ItemListFilters = {
  query?: string;
  category?: string;
} & PaginationParams;

function hydrateMoveSummary(row: any): MoveEntry {
  return {
    id: String(row.id),
    number: row.number != null ? Number(row.number) : undefined,
    nameZh: String(row.nameZh),
    nameJa: row.nameJa ? String(row.nameJa) : undefined,
    nameEn: row.nameEn ? String(row.nameEn) : undefined,
    type: row.typeName ? String(row.typeName) : undefined,
    category: row.category ? String(row.category) : undefined,
    power: row.power != null ? Number(row.power) : undefined,
    accuracy: row.accuracy != null ? Number(row.accuracy) : undefined,
    pp: row.pp != null ? Number(row.pp) : undefined,
    description: row.description ? String(row.description) : undefined,
    generations: [],
  };
}

function hydrateAbilitySummary(row: any): AbilityEntry {
  return {
    id: String(row.id),
    number: row.number != null ? Number(row.number) : undefined,
    nameZh: String(row.nameZh),
    nameJa: row.nameJa ? String(row.nameJa) : undefined,
    nameEn: row.nameEn ? String(row.nameEn) : undefined,
    description: row.description ? String(row.description) : undefined,
    generations: [],
  };
}

function hydrateItemSummary(row: any): ItemEntry {
  return {
    id: String(row.id),
    nameZh: String(row.nameZh),
    nameJa: row.nameJa ? String(row.nameJa) : undefined,
    nameEn: row.nameEn ? String(row.nameEn) : undefined,
    category: row.category ? String(row.category) : undefined,
    effectSummary: row.effectSummary ? String(row.effectSummary) : undefined,
    imageUrl: row.imageUrl ? String(row.imageUrl) : undefined,
    generations: [],
  };
}

export async function listMoveRows(
  db: any,
  filters?: MoveListFilters,
): Promise<PaginatedResult<MoveEntry> | MoveEntry[]> {
  const conditions: SQL[] = [];

  if (filters?.query) {
    const v = `%${filters.query}%`;
    conditions.push(
      or(
        like(moves.nameZh, v),
        like(moves.nameJa, v),
        like(moves.nameEn, v),
        like(sql`CAST(${moves.id} AS TEXT)`, v),
      )!,
    );
  }
  if (filters?.type) {
    conditions.push(eq(moves.typeName, filters.type));
  }
  if (filters?.category) {
    conditions.push(eq(moves.category, filters.category));
  }
  if (filters?.generation) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM move_generation_records mgr WHERE mgr.move_id = ${moves.id} AND mgr.generation = ${filters.generation})`,
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const usePagination = filters?.limit !== undefined;

  let query = db
    .select()
    .from(moves)
    .where(where)
    .orderBy(
      sql`CASE WHEN ${moves.number} IS NULL OR ${moves.number} = 0 THEN 1 ELSE 0 END`,
      asc(moves.number),
      // id 作为最终 tie-breaker，保证排序唯一确定（number 为 NULL/0 的招式之间也稳定），
      // 这样 getMovePosition 计算出的偏移与列表实际位置始终一致。
      asc(moves.id),
    );

  if (usePagination) {
    // limit+1 策略：多查一行判断是否还有下一页
    query = query.limit(Number(filters!.limit) + 1).offset(Number(filters?.offset ?? 0));
  }

  const rows: any[] = await query;
  if (!usePagination) {
    return rows.map((r: any) => hydrateMoveSummary(r));
  }
  const limit = Number(filters!.limit);
  const hasMore = rows.length > limit;
  const entries = rows.slice(0, limit).map((r: any) => hydrateMoveSummary(r));
  return { items: entries, hasMore };
}

export async function listAbilityRows(
  db: any,
  filters?: AbilityListFilters,
): Promise<PaginatedResult<AbilityEntry> | AbilityEntry[]> {
  const conditions: SQL[] = [];

  if (filters?.query) {
    const v = `%${filters.query}%`;
    conditions.push(
      or(
        like(abilities.nameZh, v),
        like(abilities.nameJa, v),
        like(abilities.nameEn, v),
      )!,
    );
  }
  if (filters?.generation) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ability_generation_records agr WHERE agr.ability_id = ${abilities.id} AND agr.generation = ${filters.generation})`,
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const usePagination = filters?.limit !== undefined;

  let query = db
    .select()
    .from(abilities)
    .where(where)
    .orderBy(asc(abilities.number), asc(abilities.nameZh));

  if (usePagination) {
    query = query.limit(Number(filters!.limit) + 1).offset(Number(filters?.offset ?? 0));
  }

  const rows: any[] = await query;
  if (!usePagination) {
    return rows.map((r: any) => hydrateAbilitySummary(r));
  }
  const limit = Number(filters!.limit);
  const hasMore = rows.length > limit;
  const entries = rows.slice(0, limit).map((r: any) => hydrateAbilitySummary(r));
  return { items: entries, hasMore };
}

export async function listItemRows(
  db: any,
  filters?: ItemListFilters,
): Promise<PaginatedResult<ItemEntry> | ItemEntry[]> {
  const conditions: SQL[] = [];

  if (filters?.query) {
    const v = `%${filters.query}%`;
    conditions.push(
      or(
        like(items.nameZh, v),
        like(items.nameJa, v),
        like(items.nameEn, v),
        like(items.effectSummary, v),
      )!,
    );
  }
  if (filters?.category) {
    conditions.push(eq(items.category, filters.category));
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const usePagination = filters?.limit !== undefined;

  let query = db
    .select()
    .from(items)
    .where(where)
    .orderBy(asc(items.id));

  if (usePagination) {
    query = query.limit(Number(filters!.limit) + 1).offset(Number(filters?.offset ?? 0));
  }

  const rows: any[] = await query;
  if (!usePagination) {
    return rows.map((r: any) => hydrateItemSummary(r));
  }
  const limit = Number(filters!.limit);
  const hasMore = rows.length > limit;
  const entries = rows.slice(0, limit).map((r: any) => hydrateItemSummary(r));
  return { items: entries, hasMore };
}

// ══════════════════════════════════════════════════════════════════════════════
// Position Queries — 计算目标 ID 在过滤+排序后列表中的 0-based offset
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 获取某招式在排序列表中的 0-based 位置。
 * 排序键：(group, number, id)，其中 group = number IS NULL OR 0 ? 1 : 0
 * 返回 undefined 表示目标不存在或不在当前过滤结果中。
 */
export async function getMovePosition(
  db: any,
  id: number,
  filters?: Omit<MoveListFilters, "limit" | "offset">,
): Promise<number | undefined> {
  // 先查目标行的排序键值
  const [target] = await db
    .select({
      id: moves.id,
      number: moves.number,
    })
    .from(moves)
    .where(eq(moves.id, id))
    .limit(1);

  if (!target) return undefined;

  // 构建与 listMoveRows 完全一致的过滤条件
  const conditions: SQL[] = [];
  if (filters?.query) {
    const v = `%${filters.query}%`;
    conditions.push(
      or(
        like(moves.nameZh, v),
        like(moves.nameJa, v),
        like(moves.nameEn, v),
        like(sql`CAST(${moves.id} AS TEXT)`, v),
      )!,
    );
  }
  if (filters?.type) {
    conditions.push(eq(moves.typeName, filters.type));
  }
  if (filters?.category) {
    conditions.push(eq(moves.category, filters.category));
  }
  if (filters?.generation) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM move_generation_records mgr WHERE mgr.move_id = ${moves.id} AND mgr.generation = ${filters.generation})`,
    );
  }

  // 计算排在 target 前面的行数
  // 排序键字典序：(targetGroup, targetNumber, targetId)
  const targetGroup = target.number == null || target.number === 0 ? 1 : 0;
  const targetNumber = target.number ?? 0;

  // 条件：行 (g, n, i) < (targetGroup, targetNumber, targetId)
  const positionCondition = sql`(
    (CASE WHEN ${moves.number} IS NULL OR ${moves.number} = 0 THEN 1 ELSE 0 END) < ${targetGroup}
    OR (
      (CASE WHEN ${moves.number} IS NULL OR ${moves.number} = 0 THEN 1 ELSE 0 END) = ${targetGroup}
      AND ${moves.number} < ${targetNumber}
    )
    OR (
      (CASE WHEN ${moves.number} IS NULL OR ${moves.number} = 0 THEN 1 ELSE 0 END) = ${targetGroup}
      AND ${moves.number} = ${targetNumber}
      AND ${moves.id} < ${id}
    )
  )`;

  const allConditions = conditions.length
    ? and(...conditions, positionCondition)
    : positionCondition;

  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(moves)
    .where(allConditions);

  // 还需验证目标行本身也满足过滤条件
  if (conditions.length) {
    const targetConditions = [...conditions, eq(moves.id, id)];
    const [exists] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(moves)
      .where(and(...targetConditions));
    if (!exists || exists.count === 0) return undefined;
  }

  return result.count;
}

/**
 * 获取某特性在排序列表中的 0-based 位置。
 * 排序键：(number, nameZh)
 */
export async function getAbilityPosition(
  db: any,
  id: number,
  filters?: Omit<AbilityListFilters, "limit" | "offset">,
): Promise<number | undefined> {
  const [target] = await db
    .select({
      id: abilities.id,
      number: abilities.number,
      nameZh: abilities.nameZh,
    })
    .from(abilities)
    .where(eq(abilities.id, id))
    .limit(1);

  if (!target) return undefined;

  const conditions: SQL[] = [];
  if (filters?.query) {
    const v = `%${filters.query}%`;
    conditions.push(
      or(
        like(abilities.nameZh, v),
        like(abilities.nameJa, v),
        like(abilities.nameEn, v),
      )!,
    );
  }
  if (filters?.generation) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ability_generation_records agr WHERE agr.ability_id = ${abilities.id} AND agr.generation = ${filters.generation})`,
    );
  }

  const targetNumber = target.number ?? 0;
  const targetNameZh = target.nameZh ?? "";

  // 排序键字典序：(number, nameZh)
  const positionCondition = sql`(
    ${abilities.number} < ${targetNumber}
    OR (
      ${abilities.number} = ${targetNumber}
      AND ${abilities.nameZh} < ${targetNameZh}
    )
  )`;

  const allConditions = conditions.length
    ? and(...conditions, positionCondition)
    : positionCondition;

  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(abilities)
    .where(allConditions);

  if (conditions.length) {
    const targetConditions = [...conditions, eq(abilities.id, id)];
    const [exists] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(abilities)
      .where(and(...targetConditions));
    if (!exists || exists.count === 0) return undefined;
  }

  return result.count;
}

/**
 * 获取某道具在排序列表中的 0-based 位置。
 * 排序键：id ASC
 */
export async function getItemPosition(
  db: any,
  id: number,
  filters?: Omit<ItemListFilters, "limit" | "offset">,
): Promise<number | undefined> {
  const conditions: SQL[] = [];
  if (filters?.query) {
    const v = `%${filters.query}%`;
    conditions.push(
      or(
        like(items.nameZh, v),
        like(items.nameJa, v),
        like(items.nameEn, v),
        like(items.effectSummary, v),
      )!,
    );
  }
  if (filters?.category) {
    conditions.push(eq(items.category, filters.category));
  }

  // 排序键：id ASC，所以排在前面的就是 id < targetId
  const positionCondition = sql`${items.id} < ${id}`;

  const allConditions = conditions.length
    ? and(...conditions, positionCondition)
    : positionCondition;

  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(items)
    .where(allConditions);

  // 验证目标行存在且满足过滤条件
  const existConditions = conditions.length
    ? [...conditions, eq(items.id, id)]
    : [eq(items.id, id)];
  const [exists] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(items)
    .where(and(...existConditions));
  if (!exists || exists.count === 0) return undefined;

  return result.count;
}
