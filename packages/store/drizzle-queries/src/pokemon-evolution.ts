import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import {
  evolutionChains,
  pokemon,
  pokemonForms,
  pokemonFormImages,
  pokemonFormTypes,
} from "@pokemon-localdex/drizzle-schema";
import type { EvolutionStep, ImageAsset } from "@pokemon-localdex/store-types";

export async function getPokemonEvolutionChainRows(db: any, pokemonId: number): Promise<EvolutionStep[]> {
  // 同时匹配 to_pokemon_id 和 from_pokemon_id，确保基础形态（只出现在 from 中）也能找到进化链。
  // 同一宝可梦可能关联多个 chain_id（爬虫产生的重复链），选择记录数最多的那条，
  // 因为包含 mega/gigantamax 等形态进化的链一定是记录最多的。
  const chainRows = await db.select({
      chainId: evolutionChains.chainId,
      cnt: sql<number>`count(*)`,
    })
    .from(evolutionChains)
    .where(
      or(
        eq(evolutionChains.toPokemonId, pokemonId),
        eq(evolutionChains.fromPokemonId, pokemonId),
      ),
    )
    .groupBy(evolutionChains.chainId)
    .orderBy(sql`count(*) desc`)
    .limit(1);

  if (chainRows.length === 0) return [];

  const chainId = Number(chainRows[0].chainId);

  // 查询进化链所有行
  const evoRows: any[] = await db
    .select({
      fromPokemonId: evolutionChains.fromPokemonId,
      toPokemonId: evolutionChains.toPokemonId,
      fromFormId: evolutionChains.fromFormId,
      toFormId: evolutionChains.toFormId,
      stage: evolutionChains.stage,
      evolutionMethod: evolutionChains.evolutionMethod,
      evolutionCondition: evolutionChains.evolutionCondition,
      evolutionItem: evolutionChains.evolutionItem,
      evolutionLevel: evolutionChains.evolutionLevel,
      fromName: sql<string>`pf_from.name_zh`,
      toName: sql<string>`pt_to.name_zh`,
    })
    .from(evolutionChains)
    .leftJoin(sql`pokemon pf_from`, sql`pf_from.id = ${evolutionChains.fromPokemonId}`)
    .leftJoin(sql`pokemon pt_to`, sql`pt_to.id = ${evolutionChains.toPokemonId}`)
    .where(eq(evolutionChains.chainId, chainId))
    .orderBy(asc(evolutionChains.sortOrder));

  // 收集所有涉及的宝可梦 ID（from 和 to 两端都收集，确保 formRows 查询完整）
  const allPokemonIdSet = new Set<number>();
  for (const e of evoRows) {
    allPokemonIdSet.add(Number(e.toPokemonId));
    if (e.fromPokemonId) allPokemonIdSet.add(Number(e.fromPokemonId));
  }

  // ── 批量查询所有涉及宝可梦的所有形态信息（图片 + 属性） ──
  const allPokemonIds = [...allPokemonIdSet];

  // 查询所有形态基本信息
  let formRows: any[] = [];
  if (allPokemonIds.length > 0) {
    formRows = await db
      .select({
        formId: pokemonForms.id,
        pokemonId: pokemonForms.pokemonId,
        formKey: pokemonForms.formKey,
        nameZh: pokemonForms.nameZh,
        isDefault: pokemonForms.isDefault,
      })
      .from(pokemonForms)
      .where(inArray(pokemonForms.pokemonId, allPokemonIds));
  }

  // 按 pokemonId 分组
  const formsByPokemon = new Map<number, Array<{ formId: number; formKey: string; nameZh: string; isDefault: number }>>();
  const allFormIds: number[] = [];
  for (const r of formRows) {
    const pid = Number(r.pokemonId);
    if (!formsByPokemon.has(pid)) formsByPokemon.set(pid, []);
    formsByPokemon.get(pid)!.push({
      formId: Number(r.formId),
      formKey: String(r.formKey),
      nameZh: String(r.nameZh),
      isDefault: Number(r.isDefault),
    });
    allFormIds.push(Number(r.formId));
  }

  // 批量并行查询所有形态的图片和属性（两者无依赖，可并行减少一次 D1 往返）
  const imageMap = new Map<number, ImageAsset>(); // formId -> image
  const typeMap = new Map<number, string[]>(); // formId -> types
  if (allFormIds.length > 0) {
    const [imageRows, typeRows] = await Promise.all([
      db
        .select({
          formId: pokemonFormImages.formId,
          url: pokemonFormImages.url,
          alt: pokemonFormImages.alt,
        })
        .from(pokemonFormImages)
        .where(and(
          inArray(pokemonFormImages.formId, allFormIds),
          eq(pokemonFormImages.imageKind, "official"),
        )),
      db
        .select({
          formId: pokemonFormTypes.formId,
          typeName: pokemonFormTypes.typeName,
        })
        .from(pokemonFormTypes)
        .where(inArray(pokemonFormTypes.formId, allFormIds))
        .orderBy(asc(pokemonFormTypes.slot)),
    ]);
    for (const r of imageRows) {
      imageMap.set(Number(r.formId), {
        url: String(r.url),
        alt: r.alt ? String(r.alt) : undefined,
      });
    }
    for (const r of typeRows) {
      const fid = Number(r.formId);
      if (!typeMap.has(fid)) typeMap.set(fid, []);
      typeMap.get(fid)!.push(String(r.typeName));
    }
  }

  // ── 辅助函数 ──

  /** 判断 formId 是否是该 pokemon 的默认形态 */
  function isDefaultForm(pid: number, formId: number): boolean {
    const forms = formsByPokemon.get(pid) || [];
    const f = forms.find((f) => f.formId === formId);
    return f ? f.isDefault === 1 : false;
  }

  /** 标准化 formId：如果指向默认形态则返回 undefined，与 to_form_id=null 保持一致 */
  function normalizeFormId(pid: number, formId: number | undefined): number | undefined {
    if (!formId) return undefined;
    return isDefaultForm(pid, formId) ? undefined : formId;
  }

  /** 根据 formId 直接解析图片、属性、形态名；无 formId 时 fallback 到默认形态 */
  function resolveFormData(pid: number, formId: number | undefined) {
    const forms = formsByPokemon.get(pid) || [];
    let matched: { formId: number; formKey: string; nameZh: string; isDefault: number } | undefined;

    if (formId) {
      matched = forms.find((f) => f.formId === formId);
    }
    if (!matched) {
      // fallback 到默认形态
      matched = forms.find((f) => f.isDefault === 1) || forms[0];
    }

    if (!matched) return { image: undefined, types: [] as string[], formName: undefined };
    return {
      image: imageMap.get(matched.formId),
      types: typeMap.get(matched.formId) || [],
      formName: matched.isDefault ? undefined : matched.nameZh,
    };
  }

  // ── 检查缺少的基础形态 ──
  // 在 formsByPokemon 构建完成后计算，这样可以用 normalizeFormId 统一处理
  // 默认形态 ID 和 null 的等价关系，避免重复补充。
  const toKeys = new Set(
    evoRows.map((e: any) => {
      const pid = Number(e.toPokemonId);
      const fid = e.toFormId ? Number(e.toFormId) : undefined;
      // 标准化：默认形态 ID → undefined
      const normalized = normalizeFormId(pid, fid);
      return `${pid}:${normalized ?? "default"}`;
    }),
  );

  const missingBases: Array<{ pokemonId: number; formId: number | undefined; nameZh: string }> = [];
  const seenBaseKeys = new Set<string>();

  for (const e of evoRows) {
    if (!e.fromPokemonId) continue;
    const pid = Number(e.fromPokemonId);
    const rawFid = e.fromFormId ? Number(e.fromFormId) : undefined;
    // 标准化：默认形态 ID → undefined
    const fid = normalizeFormId(pid, rawFid);
    const key = `${pid}:${fid ?? "default"}`;

    if (toKeys.has(key)) continue;
    if (seenBaseKeys.has(key)) continue;
    seenBaseKeys.add(key);

    missingBases.push({
      pokemonId: pid,
      formId: fid,
      nameZh: String(e.fromName || ""),
    });
  }

  // ── 构建基础形态 steps ──
  const basePokemonSteps: EvolutionStep[] = [];
  for (const base of missingBases) {
    const resolved = resolveFormData(base.pokemonId, base.formId);
    basePokemonSteps.push({
      toPokemonId: base.pokemonId,
      toNameZh: base.nameZh,
      toFormId: base.formId,
      toFormName: resolved.formName,
      stage: 0,
      toTypes: resolved.types,
      toImage: resolved.image,
    });
  }

  // 当补充了基础形态时，需要将原始数据中的 stage 值全部 +1
  const stageOffset = basePokemonSteps.length > 0 ? 1 : 0;

  // mega/gigantamax 等形态进化记录在数据库中 stage=0，需要重新分配为
  // 基础链最大 stage + 1，使其在进化链中正确定位于来源形态之后。
  const maxBaseStage = evoRows.reduce((max: number, e: any) => {
    const s = Number(e.stage);
    // 只统计非形态进化（有正常 stage）的最大值
    return s > 0 ? Math.max(max, s) : max;
  }, 0);

  const evoSteps: EvolutionStep[] = evoRows.map((e: any) => {
    const toPid = Number(e.toPokemonId);
    const toFId = e.toFormId ? Number(e.toFormId) : undefined;
    const resolved = resolveFormData(toPid, toFId);

    // 标准化 fromFormId：默认形态 ID → undefined，与 to_form_id=null 语义一致，
    // 确保前端追踪逻辑能正确匹配 from/to 端
    const fromPid = e.fromPokemonId ? Number(e.fromPokemonId) : undefined;
    const rawFromFId = e.fromFormId ? Number(e.fromFormId) : undefined;
    const normalizedFromFId = fromPid != null ? normalizeFormId(fromPid, rawFromFId) : rawFromFId;

    // 形态进化（mega/gigantamax 等）：stage=0 且有 toFormId，
    // 重新分配 stage 为基础链最大 stage + 1
    let stage = Number(e.stage);
    if (stage === 0 && e.toFormId) {
      stage = maxBaseStage + 1;
    }

    return {
      fromPokemonId: fromPid,
      fromNameZh: e.fromName ? String(e.fromName) : undefined,
      fromFormId: normalizedFromFId,
      toPokemonId: toPid,
      toNameZh: String(e.toName),
      toFormId: toFId,
      toFormName: resolved.formName,
      stage: stage + stageOffset,
      method: e.evolutionMethod ? String(e.evolutionMethod) : undefined,
      condition: e.evolutionCondition ? String(e.evolutionCondition) : undefined,
      item: e.evolutionItem ? String(e.evolutionItem) : undefined,
      level: e.evolutionLevel != null ? Number(e.evolutionLevel) : undefined,
      toTypes: resolved.types,
      toImage: resolved.image,
    };
  });

  // 合并：基础形态在前，进化步骤在后
  return [...basePokemonSteps, ...evoSteps];
}
