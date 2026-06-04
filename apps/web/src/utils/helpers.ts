import {
  TYPE_ID_BY_NAME,
  STAT_KEYS,
  LEARN_METHOD_LABELS,
  typeNameToId,
  typeIdToName,
} from "@pokemon-localdex/store-types/constants";
import type {
  PokemonDetail,
  FormOption,
  StatVariant,
  TypeVariant,
  AbilityVariant,
  AbilityDetail,
  DisplayVariant,
} from "../components/pokedex/types";
import type { ImageAsset } from "@pokemon-localdex/store-types";

/* ─── 局部输入类型 ─── */

/** statVariants / typeVariants / abilityVariants 的公共形状 */
interface GenerationVariant {
  generationStart?: number;
  generationEnd?: number;
}

interface DraftPokemon {
  id?: number | string;
  nameZh?: string;
}

interface DraftMember {
  pokemonId: string;
  nameZh: string;
  configName: string;
  level: number;
  itemId: string;
  abilityId: string;
  nature: string;
  moves: string[];
  ivs: Record<string, number>;
  evs: Record<string, number>;
}

/** 任意带 images / image 字段的对象（预览图取值） */
interface ImageBearer {
  image?: ImageAsset;
  images?: {
    official?: ImageAsset;
    sprite?: ImageAsset;
    shinyOfficial?: ImageAsset;
    shinySprite?: ImageAsset;
    [key: string]: ImageAsset | undefined;
  };
}

interface LearnsetEntryLike {
  learnMethod: string;
  level?: number;
  notes?: string;
}

interface MoveGenerationRecord {
  generation: number;
  [key: string]: unknown;
}

interface MoveLike {
  generations?: MoveGenerationRecord[];
}

/**
 * 从 hash 路由的 query string 中解析 expand 参数
 * 用于 #/moves?expand=123、#/abilities?expand=456 等场景
 */
export function parseExpandParam(): string | null {
  const hash = window.location.hash || "";
  const qIdx = hash.indexOf("?");
  if (qIdx < 0) return null;
  const params = new URLSearchParams(hash.slice(qIdx));
  return params.get("expand") || null;
}

export function normalizeTypeName(type: string | null | undefined): string {
  const id = typeNameToId(type);
  return id ? typeIdToName(id) : String(type || "").trim();
}

export function splitTypeNames(type: string | null | undefined): string[] {
  const normalized = normalizeTypeName(type);
  if (!normalized) return [];
  if (typeNameToId(normalized)) return [normalized];

  const result: string[] = [];
  let remaining = normalized;
  // 候选名取自 TYPE_ID_BY_NAME 的所有键中的中文属性名，
  // 按长度降序优先匹配长名，避免「飞」误吞「飞行」。
  const candidates = Object.keys(TYPE_ID_BY_NAME)
    .filter((name) => /[\u4e00-\u9fff]/.test(name))
    .sort((a, b) => b.length - a.length);

  while (remaining) {
    const matched = candidates.find((c) => remaining.startsWith(c));
    if (!matched) return [normalized];
    result.push(normalizeTypeName(matched));
    remaining = remaining.slice(matched.length);
  }
  return result;
}

export function getTypeChips(type: string | string[] | null | undefined): string[] {
  if (!type) return [];
  const single = Array.isArray(type) ? type.join("") : type;
  return [...new Set(splitTypeNames(single))];
}

export function createDefaultStats(kind: "iv" | "ev"): Record<string, number> {
  return Object.fromEntries(
    STAT_KEYS.map((key) => [key, kind === "iv" ? 31 : 0])
  );
}

export function createDraftMember(pokemon?: DraftPokemon | null): DraftMember {
  return {
    pokemonId: pokemon?.id ? String(pokemon.id) : "",
    nameZh: pokemon?.nameZh || "",
    configName: "",
    level: 50,
    itemId: "",
    abilityId: "",
    nature: "认真",
    moves: ["", "", "", ""],
    ivs: createDefaultStats("iv"),
    evs: createDefaultStats("ev"),
  };
}

export function getPokemonPreviewImage(pokemon?: ImageBearer | null): ImageAsset | undefined {
  return (
    pokemon?.image ||
    pokemon?.images?.official ||
    pokemon?.images?.sprite ||
    pokemon?.images?.shinyOfficial ||
    pokemon?.images?.shinySprite
  );
}

export function describeLearnsetEntry(entry: LearnsetEntryLike): string {
  const parts: string[] = [];
  const method = LEARN_METHOD_LABELS[entry.learnMethod] || entry.learnMethod;
  if (method) parts.push(method);
  if (entry.level !== undefined) parts.push(`Lv.${entry.level}`);
  if (entry.notes) parts.push(entry.notes);
  return parts.join(" · ");
}

export function resolveMoveGenerationRecord(
  move: MoveLike | null | undefined,
  generation: number | string | null | undefined,
): MoveGenerationRecord | undefined {
  const target = Number(generation || 9);
  const records = [...(move?.generations || [])].sort((a, b) => a.generation - b.generation);
  if (records.length === 0) return undefined;
  const exact = records.find((r) => r.generation === target);
  if (exact) return exact;
  const previous = [...records].reverse().find((r) => r.generation <= target);
  return previous || records[records.length - 1];
}

/**
 * 从形态的 statVariants / typeVariants / abilityVariants 推导可用世代列表。
 * 不再依赖 detail.generations（pokemon_generation_regions 表），
 * 避免详情首开需要额外请求 /generations。
 *
 * 推导逻辑：收集所有 variant 的 generationStart / generationEnd，
 * 展开为连续的世代范围。如果没有任何 variant 则返回空数组（单世代无需切换）。
 */
export function buildPokemonGenerationOptions(detail: PokemonDetail): number[] {
  const forms = detail.forms || [];
  const values = new Set<number>();

  const collectVariants = (form: FormOption): GenerationVariant[] => [
    ...(form.statVariants || []),
    ...(form.typeVariants || []),
    ...(form.abilityVariants || []),
  ];

  for (const form of forms) {
    for (const v of collectVariants(form)) {
      if (v.generationStart) values.add(Number(v.generationStart));
      if (v.generationEnd) values.add(Number(v.generationEnd));
    }
  }

  // 如果没有任何 variant，世代切换没有意义——返回空数组
  if (values.size === 0) return [];

  // 补齐连续世代：从最小到最大（上界默认到 9）
  const sorted = [...values].filter(Boolean).sort((a, b) => a - b);
  const min = sorted[0];
  const hasOpenEnd = forms.some((f) =>
    collectVariants(f).some((v) => v.generationStart && !v.generationEnd),
  );
  const max = hasOpenEnd ? 9 : sorted[sorted.length - 1];

  const result: number[] = [];
  for (let g = min; g <= max; g++) result.push(g);
  return result;
}

/**
 * 根据世代从 variants 数组中选择匹配的变体。
 * variants 中每个元素有 generationStart/generationEnd 字段。
 * 返回匹配的变体，如果没有匹配则返回 undefined。
 */
function _resolveVariantForGeneration<T extends GenerationVariant>(
  variants: T[] | undefined,
  gen: number,
): T | undefined {
  if (!variants || variants.length === 0) return undefined;
  if (!gen) return variants.find((v) => !v.generationEnd) || variants[variants.length - 1];
  const matched = variants.find((v) => {
    const gs = v.generationStart;
    const ge = v.generationEnd;
    if (gs && ge) return gen >= gs && gen <= ge;
    if (gs) return gen >= gs;
    if (ge) return gen <= ge;
    return true;
  });
  return matched || variants.find((v) => !v.generationEnd) || variants[variants.length - 1];
}

export function buildPokemonFormOptions(
  detail: PokemonDetail,
  generation: number | string | null | undefined,
): FormOption[] {
  const forms = detail.forms || [];
  if (forms.length === 0) {
    // Fallback: synthesize a single "default" form from top-level fields
    const fallback: FormOption = {
      id: 0,
      formKey: "default",
      nameZh: detail.nameZh || "普通形态",
      formType: "default",
      isDefault: true,
      primaryType: detail.primaryType,
      secondaryType: detail.secondaryType,
      abilities: (detail.abilities || []).map((a) => ({ nameZh: a, isHidden: false })),
      baseStats: detail.baseStats,
      images: detail.images || (detail.image ? { official: detail.image } : undefined),
    };
    return [fallback];
  }

  const gen = Number(generation || 0);

  // 每个形态只有一条记录，直接映射
  return forms.map((form) => {
    const resolved: FormOption = { ...form, id: form.id };

    // 如果有世代种族值变体，根据当前世代选择
    if (form.statVariants && form.statVariants.length > 0) {
      const sv = _resolveVariantForGeneration<StatVariant>(form.statVariants, gen);
      if (sv) resolved.baseStats = sv.baseStats;
    }

    // 如果有世代属性变体，根据当前世代选择
    if (form.typeVariants && form.typeVariants.length > 0) {
      const tv = _resolveVariantForGeneration<TypeVariant>(form.typeVariants, gen);
      if (tv) {
        resolved.primaryType = tv.primaryType;
        resolved.secondaryType = tv.secondaryType;
      }
    }

    // 如果有世代特性变体，根据当前世代选择
    if (form.abilityVariants && form.abilityVariants.length > 0) {
      const av = _resolveVariantForGeneration<AbilityVariant>(form.abilityVariants, gen);
      if (av) resolved.abilities = av.abilities;
    }

    return resolved;
  });
}

export function resolvePokemonDisplayVariant(
  detail: PokemonDetail,
  detailGeneration: number | string | null | undefined,
  detailForm: number | string | null | undefined,
  globalGeneration: number | string | null | undefined,
): DisplayVariant {
  const genOptions = buildPokemonGenerationOptions(detail);
  let generation: number | undefined;
  if (genOptions.length === 0) {
    generation = undefined;
  } else {
    const requested = Number(detailGeneration || globalGeneration || 0);
    generation = (requested && genOptions.includes(requested)) ? requested : genOptions[genOptions.length - 1];
  }

  const formOptions = buildPokemonFormOptions(detail, generation);
  // detailForm 为数字 formId 或 null；通过 formId 匹配
  const selectedForm = (detailForm != null
    ? formOptions.find((f) => String(f.id) === String(detailForm))
    : null) || formOptions.find((f) => f.isDefault) || formOptions[0];

  const stats = selectedForm.baseStats || detail.baseStats || {};
  const primaryType = selectedForm.primaryType || detail.primaryType;
  const secondaryType = selectedForm.secondaryType || detail.secondaryType;

  // Build ability info from form's abilities array [{nameZh, isHidden, abilityId?, description?}]
  const formAbilities = selectedForm.abilities || [];
  const hasOwnAbilities = formAbilities.length > 0;
  const normalAbilities = formAbilities.filter((a) => !a.isHidden);
  const hiddenAbilitiesList = formAbilities.filter((a) => a.isHidden);
  const abilityText = normalAbilities.length > 0
    ? normalAbilities.map((a) => a.nameZh).join(" / ")
    : (detail.abilities || []).join(" / ");
  // Only fallback to top-level hiddenAbility when the form has no own abilities data.
  // Mega / Gmax forms define their own abilities array; if it contains no hidden entry
  // that means the form genuinely has no hidden ability — don't inherit the base form's.
  const hiddenAbilityText = hasOwnAbilities
    ? (hiddenAbilitiesList.length > 0 ? hiddenAbilitiesList.map((a) => a.nameZh).join(" / ") : "无")
    : (detail.hiddenAbility || "无");
  // Full abilities array with id & description for tooltip / linking
  const abilitiesDetailed: AbilityDetail[] = hasOwnAbilities
    ? formAbilities
    : (detail.abilities || []).map((name) => ({ nameZh: name, isHidden: false }));

  // Resolve images: form images → top-level image fallback
  const images = selectedForm.images ||
    (detail.image ? { official: detail.image } : null);

  return {
    generation,
    form: selectedForm,
    formOptions,
    generationOptions: genOptions,
    stats,
    images,
    primaryType,
    secondaryType,
    abilityText,
    hiddenAbilityText,
    abilitiesDetailed,
  };
}
