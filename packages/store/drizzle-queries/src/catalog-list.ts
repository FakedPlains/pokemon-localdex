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
