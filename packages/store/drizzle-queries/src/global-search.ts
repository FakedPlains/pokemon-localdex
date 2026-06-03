import { like, or, sql, asc } from "drizzle-orm";
import { pokemon, pokemonForms, pokemonFormImages, moves, abilities, items, fieldEffects } from "@pokemon-localdex/drizzle-schema";
import type { GlobalSearchResultItem, GlobalSearchResults } from "@pokemon-localdex/store-types";
import { FIELD_EFFECT_KIND_LABELS } from "@pokemon-localdex/store-types/battle-effects";

/**
 * 全局聚合搜索：并行查询宝可梦、招式、特性、道具、场地效果五个维度。
 * 每个维度返回最多 limit 条匹配结果（默认 5）。
 */
export async function globalSearchRows(
  db: any,
  query: string,
  limit = 5,
): Promise<GlobalSearchResults> {
  const v = `%${query}%`;

  // 并行发起五个查询
  const [pokemonRows, moveRows, abilityRows, itemRows, fieldEffectRows] = await Promise.all([
    // 宝可梦：查主表 + 默认形态的图片和属性
    db
      .select({
        id: pokemon.id,
        dexNumber: pokemon.dexNumber,
        nameZh: pokemon.nameZh,
        nameEn: pokemon.nameEn,
        formId: pokemonForms.id,
        primaryType: sql<string>`(SELECT pft.type_name FROM pokemon_form_types pft WHERE pft.form_id = ${pokemonForms.id} AND pft.slot = 1 AND pft.generation_end IS NULL LIMIT 1)`,
        secondaryType: sql<string>`(SELECT pft.type_name FROM pokemon_form_types pft WHERE pft.form_id = ${pokemonForms.id} AND pft.slot = 2 AND pft.generation_end IS NULL LIMIT 1)`,
        imageUrl: sql<string>`(SELECT pfi.url FROM pokemon_form_images pfi WHERE pfi.form_id = ${pokemonForms.id} AND pfi.image_kind = 'official' LIMIT 1)`,
      })
      .from(pokemon)
      .innerJoin(pokemonForms, sql`${pokemonForms.pokemonId} = ${pokemon.id} AND ${pokemonForms.formType} = 'default'`)
      .where(
        or(
          like(pokemon.nameZh, v),
          like(pokemon.nameEn, v),
          like(pokemon.nameJa, v),
          like(sql`CAST(${pokemon.dexNumber} AS TEXT)`, v),
        ),
      )
      .orderBy(asc(pokemon.dexNumber))
      .limit(limit),

    // 招式
    db
      .select({
        id: moves.id,
        nameZh: moves.nameZh,
        nameEn: moves.nameEn,
        type: moves.typeName,
        category: moves.category,
        power: moves.power,
      })
      .from(moves)
      .where(
        or(
          like(moves.nameZh, v),
          like(moves.nameEn, v),
          like(moves.nameJa, v),
        ),
      )
      .orderBy(asc(moves.number), asc(moves.nameZh))
      .limit(limit),

    // 特性
    db
      .select({
        id: abilities.id,
        nameZh: abilities.nameZh,
        nameEn: abilities.nameEn,
        description: abilities.description,
      })
      .from(abilities)
      .where(
        or(
          like(abilities.nameZh, v),
          like(abilities.nameEn, v),
          like(abilities.nameJa, v),
        ),
      )
      .orderBy(asc(abilities.number), asc(abilities.nameZh))
      .limit(limit),

    // 道具
    db
      .select({
        id: items.id,
        nameZh: items.nameZh,
        nameEn: items.nameEn,
        effectSummary: items.effectSummary,
        imageUrl: items.imageUrl,
      })
      .from(items)
      .where(
        or(
          like(items.nameZh, v),
          like(items.nameEn, v),
          like(items.nameJa, v),
          like(items.effectSummary, v),
        ),
      )
      .orderBy(asc(items.id))
      .limit(limit),

    // 场地效果
    db
      .select({
        id: fieldEffects.id,
        kind: fieldEffects.kind,
        nameZh: fieldEffects.nameZh,
        nameEn: fieldEffects.nameEn,
        description: fieldEffects.description,
      })
      .from(fieldEffects)
      .where(
        or(
          like(fieldEffects.nameZh, v),
          like(fieldEffects.nameEn, v),
          like(fieldEffects.nameJa, v),
          like(fieldEffects.description, v),
        ),
      )
      .orderBy(asc(fieldEffects.kind), asc(fieldEffects.id))
      .limit(limit),
  ]);

  // Hydrate 结果
  const pokemonResults: GlobalSearchResultItem[] = pokemonRows.map((r: any) => ({
    id: r.id,
    nameZh: r.nameZh,
    nameEn: r.nameEn || undefined,
    subtitle: `#${String(r.dexNumber).padStart(4, "0")}`,
    image: r.imageUrl || undefined,
    types: [r.primaryType, r.secondaryType].filter(Boolean),
  }));

  const moveResults: GlobalSearchResultItem[] = moveRows.map((r: any) => ({
    id: r.id,
    nameZh: r.nameZh,
    nameEn: r.nameEn || undefined,
    subtitle: [r.type, r.category, r.power ? `威力${r.power}` : null].filter(Boolean).join(" · "),
  }));

  const abilityResults: GlobalSearchResultItem[] = abilityRows.map((r: any) => ({
    id: r.id,
    nameZh: r.nameZh,
    nameEn: r.nameEn || undefined,
    subtitle: r.description ? (r.description.length > 30 ? r.description.slice(0, 30) + "…" : r.description) : undefined,
  }));

  const itemResults: GlobalSearchResultItem[] = itemRows.map((r: any) => ({
    id: r.id,
    nameZh: r.nameZh,
    nameEn: r.nameEn || undefined,
    subtitle: r.effectSummary ? (r.effectSummary.length > 30 ? r.effectSummary.slice(0, 30) + "…" : r.effectSummary) : undefined,
    image: r.imageUrl || undefined,
  }));

  const fieldEffectResults: GlobalSearchResultItem[] = fieldEffectRows.map((r: any) => ({
    id: r.id,
    nameZh: r.nameZh,
    nameEn: r.nameEn || undefined,
    subtitle: [
      FIELD_EFFECT_KIND_LABELS[r.kind] || undefined,
      r.description ? (r.description.length > 25 ? r.description.slice(0, 25) + "…" : r.description) : undefined,
    ].filter(Boolean).join(" · "),
  }));

  return {
    pokemon: pokemonResults,
    moves: moveResults,
    abilities: abilityResults,
    items: itemResults,
    fieldEffects: fieldEffectResults,
  };
}
