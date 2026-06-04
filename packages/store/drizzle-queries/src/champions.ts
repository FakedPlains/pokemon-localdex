import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import {
  championsRegulations,
  championsRegulationPokemon,
  championsSeasons,
  championsUsagePokemon,
  championsUsageMoves,
  championsUsageItems,
  championsUsageAbilities,
  championsUsageNatures,
  championsUsagePartners,
  championsUsageEvSpreads,
  items,
  moves,
  pokemonForms,
  pokemonFormImages,
} from "@pokemon-localdex/drizzle-schema";
import type {
  ChampionsSeasonSummary,
  PokemonUsageData,
  PokemonUsageAbility,
  PokemonUsageItem,
  PokemonUsageNature,
  PokemonUsageMove,
  PokemonUsageSpread,
  PokemonUsageTeammate,
} from "@pokemon-localdex/store-types";
import { NATURES, NATURE_NAME_BY_ID } from "@pokemon-localdex/store-types";

export type ChampionRegulationPokemonRow = {
  formId: number;
  nameZh: string;
};

export async function listChampionsSeasonRows(db: any): Promise<ChampionsSeasonSummary[]> {
  const rows = await db
    .select({
      id: championsSeasons.id,
      seasonCode: championsSeasons.seasonCode,
      regulationCode: championsSeasons.regulationCode,
      regulationName: championsRegulations.name,
      startAt: championsSeasons.startAt,
      endAt: championsSeasons.endAt,
      periodText: championsSeasons.periodText,
    })
    .from(championsSeasons)
    .leftJoin(championsRegulations, eq(championsRegulations.id, championsSeasons.regulationId))
    .orderBy(desc(championsSeasons.startAt), desc(championsSeasons.id));

  return rows.map((row: any) => ({
    id: Number(row.id),
    seasonCode: String(row.seasonCode),
    regulationCode: String(row.regulationCode),
    regulationName: row.regulationName ? String(row.regulationName) : undefined,
    startAt: row.startAt ? String(row.startAt) : undefined,
    endAt: row.endAt ? String(row.endAt) : undefined,
    periodText: row.periodText ? String(row.periodText) : undefined,
  }));
}

export async function championRegulationPokemonRows(
  db: any,
  championsSeasonId: number,
  pokemonId: number,
  dexNumber: number,
): Promise<ChampionRegulationPokemonRow[]> {
  const rows = await db
    .select({
      formId: championsRegulationPokemon.formId,
      nameZh: championsRegulationPokemon.nameZh,
    })
    .from(championsSeasons)
    .innerJoin(championsRegulationPokemon, eq(championsRegulationPokemon.regulationId, championsSeasons.regulationId))
    .where(and(
      eq(championsSeasons.id, championsSeasonId),
      or(
        eq(championsRegulationPokemon.pokemonId, pokemonId),
        and(
          isNull(championsRegulationPokemon.pokemonId),
          eq(championsRegulationPokemon.dexNumber, dexNumber),
        )!,
      )!,
    ));

  return rows.map((item: any) => ({
    formId: Number(item.formId),
    nameZh: String(item.nameZh),
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// 宝可梦对战使用率数据
// ────────────────────────────────────────────────────────────────────────────

export async function getPokemonUsageRow(
  db: any,
  pokemonId: number,
  seasonId: number,
  format: string,
  formId?: number,
): Promise<PokemonUsageData | undefined> {
  // 1. 找到 usage_pokemon 主记录（优先 formId，fallback pokemonId）
  const baseConditions = [
    eq(championsUsagePokemon.seasonId, seasonId),
    eq(championsUsagePokemon.format, format),
    eq(championsUsagePokemon.eventId, ""),
  ];
  const matchCondition = formId
    ? eq(championsUsagePokemon.formId, formId)
    : eq(championsUsagePokemon.pokemonId, pokemonId);

  const [usageRow] = await db
    .select({
      id: championsUsagePokemon.id,
      rank: championsUsagePokemon.rank,
      seasonId: championsUsagePokemon.seasonId,
      format: championsUsagePokemon.format,
      seasonCode: championsSeasons.seasonCode,
      regulationCode: championsSeasons.regulationCode,
    })
    .from(championsUsagePokemon)
    .innerJoin(championsSeasons, eq(championsSeasons.id, championsUsagePokemon.seasonId))
    .where(and(matchCondition, ...baseConditions))
    .limit(1);

  if (!usageRow) return undefined;

  const usagePokemonId = Number(usageRow.id);

  // 2. 并行查询 6 张子表
  const [abilitiesRows, itemsRows, naturesRows, movesRows, spreadsRows, partnersRows] = await Promise.all([
    db.select({
      abilityId: championsUsageAbilities.abilityId,
      nameZh: championsUsageAbilities.abilityNameZh,
      rank: championsUsageAbilities.rank,
      percentage: championsUsageAbilities.percentage,
    })
      .from(championsUsageAbilities)
      .where(eq(championsUsageAbilities.usagePokemonId, usagePokemonId))
      .orderBy(asc(championsUsageAbilities.rank)),

    db.select({
      itemId: championsUsageItems.itemId,
      nameZh: championsUsageItems.itemNameZh,
      rank: championsUsageItems.rank,
      percentage: championsUsageItems.percentage,
      imageUrl: items.imageUrl,
    })
      .from(championsUsageItems)
      .leftJoin(items, eq(items.id, championsUsageItems.itemId))
      .where(eq(championsUsageItems.usagePokemonId, usagePokemonId))
      .orderBy(asc(championsUsageItems.rank)),

    db.select({
      natureId: championsUsageNatures.natureId,
      rank: championsUsageNatures.rank,
      percentage: championsUsageNatures.percentage,
    })
      .from(championsUsageNatures)
      .where(eq(championsUsageNatures.usagePokemonId, usagePokemonId))
      .orderBy(asc(championsUsageNatures.rank)),

    db.select({
      moveId: championsUsageMoves.moveId,
      nameZh: championsUsageMoves.moveNameZh,
      rank: championsUsageMoves.rank,
      percentage: championsUsageMoves.percentage,
      type: moves.typeName,
      category: moves.category,
    })
      .from(championsUsageMoves)
      .leftJoin(moves, eq(moves.id, championsUsageMoves.moveId))
      .where(eq(championsUsageMoves.usagePokemonId, usagePokemonId))
      .orderBy(asc(championsUsageMoves.rank)),

    db.select({
      rank: championsUsageEvSpreads.rank,
      percentage: championsUsageEvSpreads.percentage,
      hp: championsUsageEvSpreads.hp,
      atk: championsUsageEvSpreads.atk,
      def: championsUsageEvSpreads.def,
      spAtk: championsUsageEvSpreads.spAtk,
      spDef: championsUsageEvSpreads.spDef,
      speed: championsUsageEvSpreads.speed,
    })
      .from(championsUsageEvSpreads)
      .where(eq(championsUsageEvSpreads.usagePokemonId, usagePokemonId))
      .orderBy(asc(championsUsageEvSpreads.rank)),

    db.select({
      partnerPokemonId: championsUsagePartners.partnerPokemonId,
      partnerFormId: championsUsagePartners.partnerFormId,
      partnerSlug: championsUsagePartners.partnerSlug,
      rank: championsUsagePartners.rank,
      nameZh: pokemonForms.nameZh,
      image: pokemonFormImages.url,
    })
      .from(championsUsagePartners)
      .leftJoin(pokemonForms, eq(pokemonForms.id, championsUsagePartners.partnerFormId))
      .leftJoin(pokemonFormImages, and(
        eq(pokemonFormImages.formId, championsUsagePartners.partnerFormId),
        eq(pokemonFormImages.imageKind, "official"),
      ))
      .where(eq(championsUsagePartners.usagePokemonId, usagePokemonId))
      .orderBy(asc(championsUsagePartners.rank)),
  ]);

  // 3. 转换为返回类型
  const abilities: PokemonUsageAbility[] = (abilitiesRows as any[]).map((r) => ({
    id: r.abilityId ?? null,
    nameZh: String(r.nameZh),
    rank: Number(r.rank),
    usage: Number(r.percentage),
  }));

  const itemsData: PokemonUsageItem[] = (itemsRows as any[]).map((r) => ({
    id: r.itemId ?? null,
    nameZh: String(r.nameZh),
    rank: Number(r.rank),
    usage: Number(r.percentage),
    imageUrl: r.imageUrl ? String(r.imageUrl) : undefined,
  }));

  const natures: PokemonUsageNature[] = (naturesRows as any[]).map((r) => {
    const nId = Number(r.natureId);
    const def = NATURES.find((n) => n.id === nId);
    const nameZh = def?.nameZh || NATURE_NAME_BY_ID[String(nId)] || `性格${nId}`;
    let plus: string | undefined;
    let minus: string | undefined;
    if (def?.upStatId && def?.downStatId) {
      const statNames = ["", "HP", "攻击", "防御", "特攻", "特防", "速度"];
      plus = statNames[def.upStatId];
      minus = statNames[def.downStatId];
    }
    return { natureId: nId, nameZh, rank: Number(r.rank), usage: Number(r.percentage), plus, minus };
  });

  const movesData: PokemonUsageMove[] = (movesRows as any[]).map((r) => ({
    id: r.moveId ?? null,
    nameZh: String(r.nameZh),
    type: r.type ? String(r.type) : undefined,
    category: r.category ? String(r.category) : undefined,
    rank: Number(r.rank),
    usage: Number(r.percentage),
  }));

  const spreads: PokemonUsageSpread[] = (spreadsRows as any[]).map((r) => ({
    rank: Number(r.rank),
    usage: Number(r.percentage),
    hp: Number(r.hp),
    atk: Number(r.atk),
    def: Number(r.def),
    spa: Number(r.spAtk),
    spd: Number(r.spDef),
    spe: Number(r.speed),
  }));

  // 去重：partner 表可能同时有日文 slug 和中文 slug 两行（同 formId/pokemonId），按 partnerFormId 去重
  const teammateMap = new Map<number, PokemonUsageTeammate>();
  for (const r of partnersRows as any[]) {
    const key = r.partnerFormId ?? r.partnerPokemonId ?? Number(r.rank);
    if (!teammateMap.has(key)) {
      teammateMap.set(key, {
        pokemonId: r.partnerPokemonId ?? null,
        nameZh: r.nameZh ? String(r.nameZh) : String(r.partnerSlug),
        rank: Number(r.rank),
        iconUrl: r.image ? String(r.image) : undefined,
      });
    } else {
      // 如果已有记录没有图片但新行有，则更新
      const existing = teammateMap.get(key)!;
      if (!existing.iconUrl && r.image) {
        existing.iconUrl = String(r.image);
      }
      // 保留较小的 rank（更靠前的排名）
      if (Number(r.rank) < existing.rank) {
        existing.rank = Number(r.rank);
      }
    }
  }
  const teammates: PokemonUsageTeammate[] = Array.from(teammateMap.values())
    .sort((a, b) => a.rank - b.rank);

  return {
    rank: Number(usageRow.rank),
    seasonId: Number(usageRow.seasonId),
    seasonCode: String(usageRow.seasonCode),
    regulationCode: String(usageRow.regulationCode),
    format: String(usageRow.format),
    abilities,
    items: itemsData,
    natures,
    moves: movesData,
    spreads,
    teammates,
  };
}
