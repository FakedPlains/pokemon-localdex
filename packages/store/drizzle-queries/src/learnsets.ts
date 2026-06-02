import { eq, and, sql, asc, desc } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { moves, pokemonForms, pokemonMoves } from "@pokemon-localdex/drizzle-schema";
import type {
  LearnsetFormMeta,
  LearnsetMeta,
  LearnsetQueryOptions,
  LearnsetRecord,
  LearnsetResult,
} from "@pokemon-localdex/store-types";
import { GAME_VERSION_NAMES } from "@pokemon-localdex/store-types";

type FormRow = {
  id: number;
  formType: string;
  formCategory: string;
  nameZh: string;
  displayNameZh?: string | null;
  canonicalNameZh?: string | null;
  nameEn?: string | null;
  isDefault: number;
};

function toFormMeta(row: FormRow, hasOwnMovesByGeneration?: Record<number, boolean>): LearnsetFormMeta {
  const formType = String(row.formType);
  return {
    formId: Number(row.id),
    formType,
    formCategory: String(row.formCategory || "alternate"),
    canonicalNameZh: String(row.nameZh),
    displayNameZh: row.displayNameZh ? String(row.displayNameZh) : String(row.nameZh),
    nameZh: row.displayNameZh ? String(row.displayNameZh) : String(row.nameZh),
    nameEn: row.nameEn ? String(row.nameEn) : undefined,
    isDefault: Boolean(Number(row.isDefault)),
    hasOwnMovesByGeneration,
  };
}

async function loadFormRows(db: any, pokemonId: number): Promise<FormRow[]> {
  return db
    .select({
      id: pokemonForms.id,
      formType: pokemonForms.formType,
      formCategory: pokemonForms.formCategory,
      nameZh: pokemonForms.nameZh,
      displayNameZh: pokemonForms.displayNameZh,
      canonicalNameZh: pokemonForms.nameZh,
      nameEn: pokemonForms.nameEn,
      isDefault: pokemonForms.isDefault,
    })
    .from(pokemonForms)
    .where(eq(pokemonForms.pokemonId, pokemonId))
    .orderBy(desc(pokemonForms.isDefault), asc(pokemonForms.sortOrder), asc(pokemonForms.id));
}


function resolveRequestedForm(
  forms: FormRow[],
  options?: LearnsetQueryOptions,
): FormRow | undefined {
  if (forms.length === 0) return undefined;
  const defaultForm = forms.find((form) => Boolean(Number(form.isDefault))) || forms[0];

  if (options?.formId != null) {
    const matched = forms.find((form) => Number(form.id) === Number(options.formId));
    if (matched) return matched;
  }

  return defaultForm;
}

export async function getLearnsetMetaRows(db: any, pokemonId: number): Promise<LearnsetMeta> {
  const [genRows, formRows, ownRows, versionRows] = await Promise.all([
    db.selectDistinct({ generation: pokemonMoves.generation })
      .from(pokemonMoves)
      .where(eq(pokemonMoves.pokemonId, pokemonId))
      .orderBy(asc(pokemonMoves.generation)),

    loadFormRows(db, pokemonId),

    db.selectDistinct({
      formId: pokemonMoves.formId,
      generation: pokemonMoves.generation,
    })
      .from(pokemonMoves)
      .where(eq(pokemonMoves.pokemonId, pokemonId))
      .orderBy(asc(pokemonMoves.formId), asc(pokemonMoves.generation)),

    db.selectDistinct({
      generation: pokemonMoves.generation,
      gameVersionCode: pokemonMoves.gameVersionCode,
    })
      .from(pokemonMoves)
      .where(and(
        eq(pokemonMoves.pokemonId, pokemonId),
        sql`${pokemonMoves.gameVersionCode} IS NOT NULL AND ${pokemonMoves.gameVersionCode} != ''`,
      ))
      .orderBy(asc(pokemonMoves.generation), asc(pokemonMoves.gameVersionCode)),
  ]);

  const ownByForm = new Map<number, Record<number, boolean>>();
  for (const row of ownRows) {
    const formId = Number(row.formId);
    if (!ownByForm.has(formId)) ownByForm.set(formId, {});
    ownByForm.get(formId)![Number(row.generation)] = true;
  }

  const forms = formRows.map((row) => toFormMeta(row, ownByForm.get(Number(row.id))));

  const versionsByGen: Record<number, Array<{ code: string; name: string }>> = {};
  for (const r of versionRows) {
    const gen = Number(r.generation);
    const code = String(r.gameVersionCode);
    if (!versionsByGen[gen]) versionsByGen[gen] = [];
    versionsByGen[gen].push({ code, name: GAME_VERSION_NAMES.get(code) || code });
  }

  return {
    generations: genRows.map((r: any) => Number(r.generation)),
    forms,
    versionsByGen,
  };
}

export async function getPokemonLearnsetRows(
  db: any,
  pokemonId: number,
  generation: number,
  options?: LearnsetQueryOptions,
  pagination?: { limit?: number; offset?: number },
  learnMethod?: string,
  search?: string,
): Promise<LearnsetResult> {
  const forms = await loadFormRows(db, pokemonId);
  const requestedForm = resolveRequestedForm(forms, options);
  if (!requestedForm) {
    return {
      moves: [],
      formId: 0,
      effectiveFormId: 0,
      usesDefaultLearnset: false,
      gameVersionCode: options?.gameVersionCode,
      hasMore: pagination?.limit !== undefined ? false : undefined,
    };
  }

  const gameVersionCode = options?.gameVersionCode;
  const buildVersionCondition = (): SQL | undefined => {
    if (gameVersionCode === undefined) return undefined;
    if (gameVersionCode === "") {
      return sql`(${pokemonMoves.gameVersionCode} IS NULL OR ${pokemonMoves.gameVersionCode} = '')`;
    }
    return eq(pokemonMoves.gameVersionCode, gameVersionCode);
  };

  const versionCondition = buildVersionCondition();

  const existsForForm = async (formId: number): Promise<boolean> => {
    const conditions: SQL[] = [
      eq(pokemonMoves.pokemonId, pokemonId),
      eq(pokemonMoves.generation, generation),
      eq(pokemonMoves.formId, formId),
    ];
    if (versionCondition) conditions.push(versionCondition);

    const rows = await db
      .select({ one: sql`1` })
      .from(pokemonMoves)
      .where(and(...conditions))
      .limit(1);
    return rows.length > 0;
  };

  const queryLearnset = async (
    formId: number,
    lim?: number,
    off?: number,
    extraMethod?: string,
  ) => {
    const conditions: SQL[] = [
      eq(pokemonMoves.pokemonId, pokemonId),
      eq(pokemonMoves.generation, generation),
      eq(pokemonMoves.formId, formId),
    ];
    if (versionCondition) conditions.push(versionCondition);
    if (extraMethod) conditions.push(eq(pokemonMoves.learnMethod, extraMethod));
    if (search) conditions.push(sql`${pokemonMoves.moveNameZh} LIKE ${'%' + search + '%'}`);

    let query = db
      .select({
        moveNameZh: pokemonMoves.moveNameZh,
        learnMethod: pokemonMoves.learnMethod,
        level: pokemonMoves.level,
        tmNumber: pokemonMoves.tmNumber,
        gameVersionCode: pokemonMoves.gameVersionCode,
        moveId: moves.id,
        typeName: moves.typeName,
        moveCategory: moves.category,
        movePower: moves.power,
        moveAccuracy: moves.accuracy,
        movePP: moves.pp,
        moveDescription: moves.description,
      })
      .from(pokemonMoves)
      .leftJoin(moves, eq(moves.id, pokemonMoves.moveId))
      .where(and(...conditions))
      .orderBy(asc(pokemonMoves.learnMethod), asc(pokemonMoves.sortOrder));

    if (off !== undefined) query = query.offset(off);
    if (lim !== undefined) query = query.limit(lim + 1);

    return query;
  };

  const queryMethodCounts = async (formId: number) => {
    const conditions: SQL[] = [
      eq(pokemonMoves.pokemonId, pokemonId),
      eq(pokemonMoves.generation, generation),
      eq(pokemonMoves.formId, formId),
    ];
    if (versionCondition) conditions.push(versionCondition);

    const rows = await db
      .select({
        learnMethod: pokemonMoves.learnMethod,
        count: sql<number>`count(*)`,
      })
      .from(pokemonMoves)
      .where(and(...conditions))
      .groupBy(pokemonMoves.learnMethod);

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[String(row.learnMethod)] = Number(row.count);
    }
    return counts;
  };

  const pLimit = pagination?.limit;
  const pOffset = pagination?.offset ?? 0;
  const isPaginated = pLimit !== undefined;
  const isAppend = isPaginated && pOffset > 0;

  let effectiveForm = requestedForm;
  if (!isAppend && !(await existsForForm(Number(requestedForm.id)))) {
    const defaultForm = forms.find((form) => Boolean(Number(form.isDefault))) || forms[0];
    if (defaultForm && Number(defaultForm.id) !== Number(requestedForm.id) && await existsForForm(Number(defaultForm.id))) {
      effectiveForm = defaultForm;
    } else {
      const fallbackConditions: SQL[] = [
        eq(pokemonMoves.pokemonId, pokemonId),
        eq(pokemonMoves.generation, generation),
      ];
      if (versionCondition) fallbackConditions.push(versionCondition);
      const firstFormRows = await db
        .selectDistinct({ formId: pokemonMoves.formId })
        .from(pokemonMoves)
        .where(and(...fallbackConditions))
        .limit(1);
      const firstFormId = firstFormRows[0]?.formId != null ? Number(firstFormRows[0].formId) : undefined;
      const firstForm = firstFormId ? forms.find((form) => Number(form.id) === firstFormId) : undefined;
      if (firstForm) effectiveForm = firstForm;
    }
  }

  let rows: any[];
  let methodCounts: Record<string, number> | undefined;

  if (isAppend) {
    rows = await queryLearnset(Number(effectiveForm.id), pLimit, pOffset, learnMethod);
  } else {
    const [dataRows, counts] = await Promise.all([
      queryLearnset(Number(effectiveForm.id), pLimit, isPaginated ? pOffset : undefined, learnMethod),
      queryMethodCounts(Number(effectiveForm.id)),
    ]);
    rows = dataRows;
    methodCounts = counts;
  }

  let hasMore: boolean | undefined;
  let finalRows = rows;
  if (pLimit !== undefined) {
    hasMore = rows.length > pLimit;
    if (hasMore) finalRows = rows.slice(0, pLimit);
  }

  return {
    formId: Number(requestedForm.id),
    effectiveFormId: Number(effectiveForm.id),
    usesDefaultLearnset: Number(effectiveForm.id) !== Number(requestedForm.id) && Boolean(Number(effectiveForm.isDefault)),
    gameVersionCode,
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
