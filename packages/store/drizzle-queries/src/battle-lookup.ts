import { and, eq, or, inArray } from "drizzle-orm";
import { abilities, items, moves, pokemon, pokemonForms, abilityBattleEffects, itemBattleEffects } from "@pokemon-localdex/drizzle-schema";
import { EFFECT_TYPE, MODIFIER_TYPE } from "@pokemon-localdex/store-types/battle-effects";
import { genCondition } from "./battle-effects.ts";

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

/**
 * 查询特性/道具的伤害相关倍率（modifier_value）。
 * 只返回 effect_type 为与伤害计算相关的类型（能力值倍率、威力倍率、最终伤害倍率、
 * 超效/抵抗修正、STAB 修正）且 modifier_type = MULTIPLY 的第一个有效记录。
 * 如果有多条记录，取优先级最高的那条。
 */
const DAMAGE_EFFECT_TYPES = [
  EFFECT_TYPE.STAT_MULTIPLY,
  EFFECT_TYPE.BASE_POWER_MULTIPLY,
  EFFECT_TYPE.FINAL_DAMAGE_MULTIPLY,
  EFFECT_TYPE.SUPER_EFFECTIVE_MODIFY,
  EFFECT_TYPE.NOT_EFFECTIVE_MODIFY,
  EFFECT_TYPE.STAB_MODIFY,
];

export interface DamageModifierResult {
  value: number;
  effectType: number;
  affectedStat?: number;
}

export async function getDamageModifierRow(
  db: any,
  kind: "ability" | "item",
  id?: string | number,
  nameZh?: string,
  generation?: number,
): Promise<DamageModifierResult | undefined> {
  // 1. 解析实体 ID
  let entityId: number | undefined;
  const table = kind === "ability" ? abilities : items;

  if (id) {
    entityId = Number(id);
  } else if (nameZh) {
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.nameZh, nameZh))
      .limit(1);
    if (rows[0]) entityId = rows[0].id;
  }

  if (!entityId) return undefined;

  // 2. 查询 battle_effects 中的伤害倍率
  const effectTable = kind === "ability" ? abilityBattleEffects : itemBattleEffects;
  const idCol = kind === "ability" ? abilityBattleEffects.abilityId : itemBattleEffects.itemId;

  const conditions: any[] = [
    eq(idCol, entityId),
    eq(effectTable.modifierType, MODIFIER_TYPE.MULTIPLY),
    inArray(effectTable.effectType, DAMAGE_EFFECT_TYPES),
  ];

  // 世代过滤（复用 battle-effects 的统一逻辑）
  const genCond = genCondition(effectTable, generation);
  if (genCond) conditions.push(genCond);

  const rows = await db
    .select({
      modifierValue: effectTable.modifierValue,
      effectType: effectTable.effectType,
      affectedStat: effectTable.affectedStat,
    })
    .from(effectTable)
    .where(and(...conditions))
    .orderBy(effectTable.priority)
    .limit(1);

  if (rows[0]?.modifierValue != null) {
    return {
      value: Number(rows[0].modifierValue),
      effectType: Number(rows[0].effectType),
      affectedStat: rows[0].affectedStat != null ? Number(rows[0].affectedStat) : undefined,
    };
  }
  return undefined;
}
