import { and, eq, or } from "drizzle-orm";
import { abilities, items, moves, pokemon, pokemonForms } from "@pokemon-localdex/drizzle-schema";

export async function pokemonNameEnRow(
  db: any,
  opts: {
    pokemonId?: string | number;
    formId?: string | number;
    name?: string;
  },
): Promise<string | undefined> {
  // 优先级 1：formId 精确查询
  if (opts.formId) {
    const rows = await db
      .select({ nameEn: pokemonForms.nameEn })
      .from(pokemonForms)
      .where(eq(pokemonForms.id, Number(opts.formId)))
      .limit(1);
    if (rows[0]?.nameEn) return String(rows[0].nameEn);
  }

  // 优先级 2：pokemonId 默认形态
  if (opts.pokemonId) {
    const formRows = await db
      .select({ nameEn: pokemonForms.nameEn })
      .from(pokemonForms)
      .where(and(eq(pokemonForms.pokemonId, Number(opts.pokemonId)), eq(pokemonForms.isDefault, 1)))
      .limit(1);
    if (formRows[0]?.nameEn) return String(formRows[0].nameEn);

    const pkRows = await db
      .select({ nameEn: pokemon.nameEn })
      .from(pokemon)
      .where(eq(pokemon.id, Number(opts.pokemonId)))
      .limit(1);
    if (pkRows[0]?.nameEn) return String(pkRows[0].nameEn);
  }

  // 优先级 3：中文名 fallback
  if (opts.name) {
    const formRows = await db
      .select({ nameEn: pokemonForms.nameEn })
      .from(pokemonForms)
      .where(or(eq(pokemonForms.nameZh, opts.name), eq(pokemonForms.displayNameZh, opts.name)))
      .limit(1);
    if (formRows[0]?.nameEn) return String(formRows[0].nameEn);

    const pkRows = await db
      .select({ nameEn: pokemon.nameEn })
      .from(pokemon)
      .where(eq(pokemon.nameZh, opts.name))
      .limit(1);
    if (pkRows[0]?.nameEn) return String(pkRows[0].nameEn);
  }

  return undefined;
}

export async function entityNameEnRow(
  db: any,
  kind: "move" | "ability" | "item",
  id?: string | number,
  nameZh?: string,
): Promise<string | undefined> {
  const table = kind === "move" ? moves : kind === "ability" ? abilities : items;
  if (!id && !nameZh) return undefined;

  if (id) {
    const rows = await db
      .select({ nameEn: table.nameEn })
      .from(table)
      .where(eq(table.id, Number(id)))
      .limit(1);
    if (rows[0]?.nameEn) return String(rows[0].nameEn);
  }
  if (nameZh) {
    const rows = await db
      .select({ nameEn: table.nameEn })
      .from(table)
      .where(eq(table.nameZh, nameZh))
      .limit(1);
    if (rows[0]?.nameEn) return String(rows[0].nameEn);
  }
  return undefined;
}
