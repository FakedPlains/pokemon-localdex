import { eq, and, sql, asc } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { moves, pokemonLearnsets } from "@pokemon-localdex/drizzle-schema";
import type { LearnsetRecord, LearnsetMeta, LearnsetResult } from "@pokemon-localdex/store-types";
import { GAME_VERSION_NAMES } from "@pokemon-localdex/store-types";

export async function getLearnsetMetaRows(db: any, pokemonId: number): Promise<LearnsetMeta> {
  const [genRows, formRows, versionRows] = await Promise.all([
    db.selectDistinct({ generation: pokemonLearnsets.generation })
      .from(pokemonLearnsets)
      .where(eq(pokemonLearnsets.pokemonId, pokemonId))
      .orderBy(asc(pokemonLearnsets.generation)),

    db.selectDistinct({ formKey: pokemonLearnsets.formKey })
      .from(pokemonLearnsets)
      .where(eq(pokemonLearnsets.pokemonId, pokemonId))
      .orderBy(asc(pokemonLearnsets.formKey)),

    db.selectDistinct({
      generation: pokemonLearnsets.generation,
      gameVersionCode: pokemonLearnsets.gameVersionCode,
    })
      .from(pokemonLearnsets)
      .where(and(
        eq(pokemonLearnsets.pokemonId, pokemonId),
        sql`${pokemonLearnsets.gameVersionCode} IS NOT NULL AND ${pokemonLearnsets.gameVersionCode} != ''`,
      ))
      .orderBy(asc(pokemonLearnsets.generation), asc(pokemonLearnsets.gameVersionCode)),
  ]);

  const versionsByGen: Record<number, Array<{ code: string; name: string }>> = {};
  for (const r of versionRows) {
    const gen = Number(r.generation);
    const code = String(r.gameVersionCode);
    if (!versionsByGen[gen]) versionsByGen[gen] = [];
    versionsByGen[gen].push({ code, name: GAME_VERSION_NAMES.get(code) || code });
  }

  return {
    generations: genRows.map((r: any) => Number(r.generation)),
    formKeys: formRows.map((r: any) => String(r.formKey)),
    versionsByGen,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Pokemon: getPokemonLearnset（支持分页 + 服务端 learnMethod 筛选）
// ────────────────────────────────────────────────────────────────────────────

// LearnsetResult 从 @pokemon-localdex/store-types 导入（单一定义源）

export async function getPokemonLearnsetRows(
  db: any,
  pokemonId: number,
  generation: number,
  formKey = "default",
  gameVersionCode?: string,
  pagination?: { limit?: number; offset?: number },
  learnMethod?: string,
  query?: string,
): Promise<LearnsetResult> {

  // ── 公共 gameVersionCode 条件片段 ──
  const buildVersionCondition = (): SQL | undefined => {
    if (gameVersionCode === undefined) return undefined;
    if (gameVersionCode === "") {
      return sql`(${pokemonLearnsets.gameVersionCode} IS NULL OR ${pokemonLearnsets.gameVersionCode} = '')`;
    }
    return eq(pokemonLearnsets.gameVersionCode, gameVersionCode);
  };

  const versionCondition = buildVersionCondition();

  /**
   * P3 优化：轻量 existence 查询。
   * 只查 pokemon_learnsets 表，不 join moves，不排序，不取业务字段。
   * 仅用于 form fallback 判断。
   */
  const existsForForm = async (fk: string): Promise<boolean> => {
    const conditions: SQL[] = [
      eq(pokemonLearnsets.pokemonId, pokemonId),
      eq(pokemonLearnsets.generation, generation),
      eq(pokemonLearnsets.formKey, fk),
    ];
    if (versionCondition) conditions.push(versionCondition);

    const rows = await db
      .select({ one: sql`1` })
      .from(pokemonLearnsets)
      .where(and(...conditions))
      .limit(1);
    return rows.length > 0;
  };

  /**
   * 构建 learnset 数据查询（带 join moves、排序、完整列投影）。
   */
  const queryLearnset = async (
    fk: string, lim?: number, off?: number, extraMethod?: string,
  ) => {
    const conditions: SQL[] = [
      eq(pokemonLearnsets.pokemonId, pokemonId),
      eq(pokemonLearnsets.generation, generation),
      eq(pokemonLearnsets.formKey, fk),
    ];
    if (versionCondition) conditions.push(versionCondition);
    if (extraMethod) conditions.push(eq(pokemonLearnsets.learnMethod, extraMethod));
    if (query) {
      // 转义 LIKE 通配符，避免用户输入 % 或 _ 导致意外匹配
      const escaped = query.replace(/[%_\\]/g, (ch) => `\\${ch}`);
      conditions.push(sql`${pokemonLearnsets.moveNameZh} LIKE ${"%" + escaped + "%"} ESCAPE '\\'`);
    }

    let q = db
      .select({
        moveNameZh: pokemonLearnsets.moveNameZh,
        learnMethod: pokemonLearnsets.learnMethod,
        level: pokemonLearnsets.level,
        tmNumber: pokemonLearnsets.tmNumber,
        gameVersionCode: pokemonLearnsets.gameVersionCode,
        moveId: moves.id,
        typeName: moves.typeName,
        moveCategory: moves.category,
        movePower: moves.power,
        moveAccuracy: moves.accuracy,
        movePP: moves.pp,
        moveDescription: moves.description,
      })
      .from(pokemonLearnsets)
      .leftJoin(moves, eq(moves.id, pokemonLearnsets.moveId))
      .where(and(...conditions))
      .orderBy(asc(pokemonLearnsets.learnMethod), asc(pokemonLearnsets.sortOrder));

    if (off !== undefined) q = q.offset(off);
    // limit+1 策略：多请求一条判断 hasMore
    if (lim !== undefined) q = q.limit(lim + 1);

    return q;
  };

  /**
   * 查询当前 form+gen+version 下各 learnMethod 的全量计数。
   * 不受 pagination 和 learnMethod 筛选影响，用于前端完整显示方法 pill。
   */
  const queryMethodCounts = async (fk: string) => {
    const conditions: SQL[] = [
      eq(pokemonLearnsets.pokemonId, pokemonId),
      eq(pokemonLearnsets.generation, generation),
      eq(pokemonLearnsets.formKey, fk),
    ];
    if (versionCondition) conditions.push(versionCondition);

    const rows = await db
      .select({
        learnMethod: pokemonLearnsets.learnMethod,
        count: sql<number>`count(*)`,
      })
      .from(pokemonLearnsets)
      .where(and(...conditions))
      .groupBy(pokemonLearnsets.learnMethod);

    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[String(r.learnMethod)] = Number(r.count);
    }
    return counts;
  };

  const pLimit = pagination?.limit;
  const pOffset = pagination?.offset ?? 0;
  const isPaginated = pLimit !== undefined;

  // ── P2 优化：加载更多（offset > 0）时跳过 form fallback 和 methodCounts ──
  // 前端只在初始页（offset=0）使用 methodCounts 和 formKey；
  // 后续追加请求复用首次返回的 formKey，服务端直接查数据即可。
  const isAppend = isPaginated && pOffset > 0;

  // ── 确定最终使用的 formKey ──
  let usedFormKey = formKey;

  if (!isAppend) {
    // 首次请求：做 form fallback 判断（使用轻量 existence 查询）
    if (!(await existsForForm(formKey))) {
      if (formKey !== "default" && await existsForForm("default")) {
        usedFormKey = "default";
      } else if (formKey !== "default" || !(await existsForForm("default"))) {
        const fallbackConditions: SQL[] = [
          eq(pokemonLearnsets.pokemonId, pokemonId),
          eq(pokemonLearnsets.generation, generation),
        ];
        if (versionCondition) fallbackConditions.push(versionCondition);
        const firstFormRows = await db
          .selectDistinct({ formKey: pokemonLearnsets.formKey })
          .from(pokemonLearnsets)
          .where(and(...fallbackConditions))
          .limit(1);
        if (firstFormRows.length > 0) {
          usedFormKey = String(firstFormRows[0].formKey);
        }
      }
    }
  }

  // ── 执行查询 ──
  let rows: any[];
  let methodCounts: Record<string, number> | undefined;

  if (isAppend) {
    // 追加请求：只查数据，跳过 methodCounts
    rows = await queryLearnset(usedFormKey, pLimit, pOffset, learnMethod);
  } else {
    // 首次请求：并行执行数据查询 + 方法计数查询
    const [dataRows, counts] = await Promise.all([
      queryLearnset(usedFormKey, pLimit, isPaginated ? pOffset : undefined, learnMethod),
      queryMethodCounts(usedFormKey),
    ]);
    rows = dataRows;
    methodCounts = counts;
  }

  // 处理 limit+1 分页
  let hasMore: boolean | undefined;
  let finalRows = rows;
  if (pLimit !== undefined) {
    hasMore = rows.length > pLimit;
    if (hasMore) finalRows = rows.slice(0, pLimit);
  }

  return {
    formKey: usedFormKey,
    gameVersionCode: gameVersionCode || undefined,
    hasMore,
    methodCounts,
    moves: finalRows.map((r: any) => ({
      moveId: r.moveId != null ? Number(r.moveId) : undefined,
      moveNameZh: String(r.moveNameZh),
      learnMethod: String(r.learnMethod),
      level: r.level != null ? Number(r.level) : undefined,
      tmNumber: r.tmNumber ? String(r.tmNumber) : undefined,
      moveType: r.typeName ? String(r.typeName) : undefined,
      moveCategory: r.moveCategory ? String(r.moveCategory) : undefined,
      movePower: r.movePower != null ? Number(r.movePower) : undefined,
      moveAccuracy: r.moveAccuracy != null ? Number(r.moveAccuracy) : undefined,
      movePP: r.movePP != null ? Number(r.movePP) : undefined,
      moveDescription: r.moveDescription ? String(r.moveDescription) : undefined,
    } as LearnsetRecord)),
  };
}
