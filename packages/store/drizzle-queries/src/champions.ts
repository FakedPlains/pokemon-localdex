import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  championsRegulations,
  championsRegulationPokemon,
  championsSeasons,
} from "@pokemon-localdex/drizzle-schema";
import type { ChampionsSeasonSummary } from "@pokemon-localdex/store-types";

export type ChampionRegulationPokemonRow = {
  formId?: number;
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
    formId: item.formId != null ? Number(item.formId) : undefined,
    nameZh: String(item.nameZh),
  }));
}
