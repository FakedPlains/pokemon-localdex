import { eq, and, sql, asc } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { moves, pokemonLearnsets } from "@pokemon-localdex/drizzle-schema";
import type { LearnsetRecord, LearnsetMeta } from "@pokemon-localdex/store-types";
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
// Pokemon: getPokemonLearnset
// ────────────────────────────────────────────────────────────────────────────

export async function getPokemonLearnsetRows(
  db: any,
  pokemonId: number,
  generation: number,
  formKey = "default",
  gameVersionCode?: string,
): Promise<{ moves: LearnsetRecord[]; formKey: string; gameVersionCode?: string }> {
  const queryLearnset = async (pid: number, gen: number, fk: string) => {
    const conditions: SQL[] = [
      eq(pokemonLearnsets.pokemonId, pid),
      eq(pokemonLearnsets.generation, gen),
      eq(pokemonLearnsets.formKey, fk),
    ];

    if (gameVersionCode !== undefined) {
      if (gameVersionCode === "") {
        conditions.push(
          sql`(${pokemonLearnsets.gameVersionCode} IS NULL OR ${pokemonLearnsets.gameVersionCode} = '')`,
        );
      } else {
        conditions.push(eq(pokemonLearnsets.gameVersionCode, gameVersionCode));
      }
    }

    return db
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
  };

  // 先尝试指定的 formKey
  let rows = await queryLearnset(pokemonId, generation, formKey);
  let usedFormKey = formKey;

  // Fallback: 如果指定形态没有数据，尝试 default
  if (rows.length === 0 && formKey !== "default") {
    rows = await queryLearnset(pokemonId, generation, "default");
    if (rows.length > 0) usedFormKey = "default";
  }

  // Fallback: 如果 default 也没有数据，取该宝可梦在该世代的第一个可用 form_key
  if (rows.length === 0) {
    const firstFormRows = await db
      .selectDistinct({ formKey: pokemonLearnsets.formKey })
      .from(pokemonLearnsets)
      .where(and(eq(pokemonLearnsets.pokemonId, pokemonId), eq(pokemonLearnsets.generation, generation)))
      .limit(1);

    if (firstFormRows.length > 0) {
      const fallbackKey = String(firstFormRows[0].formKey);
      rows = await queryLearnset(pokemonId, generation, fallbackKey);
      if (rows.length > 0) usedFormKey = fallbackKey;
    }
  }

  return {
    formKey: usedFormKey,
    gameVersionCode: gameVersionCode ?? null as any,
    moves: rows.map((r: any) => ({
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
