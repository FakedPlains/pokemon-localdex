import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  evolutionChains,
  pokemonForms,
  pokemonFormTypes,
} from "@pokemon-localdex/drizzle-schema";
import type { EvolutionStep } from "@pokemon-localdex/store-types";

export async function getPokemonEvolutionChainRows(db: any, pokemonId: number): Promise<EvolutionStep[]> {
  const chainRows = await db.select({ chainId: evolutionChains.chainId })
    .from(evolutionChains)
    .where(eq(evolutionChains.toPokemonId, pokemonId))
    .limit(1);

  if (chainRows.length === 0) return [];

  const chainId = Number(chainRows[0].chainId);

  // pokemon 表出现两次（from/to），通过 sql 模板别名区分。
  const evoRows: any[] = await db
    .select({
      fromPokemonId: evolutionChains.fromPokemonId,
      toPokemonId: evolutionChains.toPokemonId,
      fromFormKey: evolutionChains.fromFormKey,
      toFormKey: evolutionChains.toFormKey,
      stage: evolutionChains.stage,
      evolutionMethod: evolutionChains.evolutionMethod,
      evolutionCondition: evolutionChains.evolutionCondition,
      evolutionItem: evolutionChains.evolutionItem,
      evolutionLevel: evolutionChains.evolutionLevel,
      fromName: sql<string>`pf_from.name_zh`,
      toName: sql<string>`pt_to.name_zh`,
      toImageUrl: sql<string>`fi_to.url`,
      toImageAlt: sql<string>`fi_to.alt`,
    })
    .from(evolutionChains)
    .leftJoin(sql`pokemon pf_from`, sql`pf_from.id = ${evolutionChains.fromPokemonId}`)
    .leftJoin(sql`pokemon pt_to`, sql`pt_to.id = ${evolutionChains.toPokemonId}`)
    .leftJoin(
      sql`pokemon_forms pf_to_form`,
      sql`pf_to_form.pokemon_id = ${evolutionChains.toPokemonId} AND pf_to_form.is_default = 1`,
    )
    .leftJoin(
      sql`pokemon_form_images fi_to`,
      sql`fi_to.form_id = pf_to_form.id AND fi_to.image_kind = 'official'`,
    )
    .where(eq(evolutionChains.chainId, chainId))
    .orderBy(asc(evolutionChains.sortOrder));

  const toPokemonIds = [...new Set(evoRows.map((e: any) => Number(e.toPokemonId)))];

  let evoTypeRows: any[] = [];
  if (toPokemonIds.length > 0) {
    evoTypeRows = await db
      .select({
        pokemonId: pokemonForms.pokemonId,
        typeName: pokemonFormTypes.typeName,
      })
      .from(pokemonForms)
      .innerJoin(pokemonFormTypes, eq(pokemonFormTypes.formId, pokemonForms.id))
      .where(and(inArray(pokemonForms.pokemonId, toPokemonIds), eq(pokemonForms.isDefault, 1)))
      .orderBy(asc(pokemonForms.pokemonId), asc(pokemonFormTypes.slot));
  }

  const evoTypeMap = new Map<number, string[]>();
  for (const r of evoTypeRows) {
    const pid = Number(r.pokemonId);
    if (!evoTypeMap.has(pid)) evoTypeMap.set(pid, []);
    evoTypeMap.get(pid)!.push(String(r.typeName));
  }

  return evoRows.map((e: any) => ({
    fromPokemonId: e.fromPokemonId ? Number(e.fromPokemonId) : undefined,
    fromNameZh: e.fromName ? String(e.fromName) : undefined,
    fromFormKey: e.fromFormKey ? String(e.fromFormKey) : undefined,
    toPokemonId: Number(e.toPokemonId),
    toNameZh: String(e.toName),
    toFormKey: e.toFormKey ? String(e.toFormKey) : undefined,
    stage: Number(e.stage),
    method: e.evolutionMethod ? String(e.evolutionMethod) : undefined,
    condition: e.evolutionCondition ? String(e.evolutionCondition) : undefined,
    item: e.evolutionItem ? String(e.evolutionItem) : undefined,
    level: e.evolutionLevel != null ? Number(e.evolutionLevel) : undefined,
    toTypes: evoTypeMap.get(Number(e.toPokemonId)) || [],
    toImage: e.toImageUrl
      ? { url: String(e.toImageUrl), alt: e.toImageAlt ? String(e.toImageAlt) : undefined }
      : undefined,
  }));
}
