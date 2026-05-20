import {
  TYPE_OPTIONS,
  TYPE_ALIASES,
  NATURE_EFFECTS,
  STAT_KEYS,
  LEARN_METHOD_LABELS,
  typeNameToId,
  typeIdToName,
} from "@pokemon-localdex/store-types/constants";
import type {
  StatKey,
  StatBlock,
  PokemonFormEntry,
  PokemonEntry,
  PokemonSummary,
  PokemonTableSummary,
  MoveEntry,
  MoveGenerationRecord,
  LearnsetRecord,
  EvolutionStep,
  FormStatVariant,
  FormTypeVariant,
  FormAbilityVariant,
  ImageAsset,
} from "@pokemon-localdex/store-types";
import { createStatBlock } from "@pokemon-localdex/store-types";
import type { PokemonConfig, PokemonConfigDraft } from "./teamStorage";

// ══════════════════════════════════════════════
//  路由 / 查询参数
// ══════════════════════════════════════════════

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

// ══════════════════════════════════════════════
//  属性名称处理
// ══════════════════════════════════════════════

export function normalizeTypeName(type: string | undefined): string {
  const id = typeNameToId(type);
  return id ? typeIdToName(id) : String(type || "").trim();
}

export function splitTypeNames(type: string | undefined): string[] {
  const normalized = normalizeTypeName(type);
  if (!normalized) return [];
  if (typeNameToId(normalized)) return [normalized];

  const result: string[] = [];
  let remaining = normalized;
  const candidates = [...TYPE_OPTIONS.map((typeOption: { nameZh: string }) => typeOption.nameZh), ...Object.keys(TYPE_ALIASES)]
    .sort((a, b) => b.length - a.length);

  while (remaining) {
    const matched = candidates.find((c) => remaining.startsWith(c));
    if (!matched) return [normalized];
    result.push(normalizeTypeName(matched));
    remaining = remaining.slice(matched.length);
  }
  return result;
}

export function hasType(typeValue: string | undefined, expectedType: string): boolean {
  return splitTypeNames(typeValue).includes(expectedType);
}

export function getTypeChips(type: string | undefined): string[] {
  if (!type) return [];
  return [...new Set(splitTypeNames(type))];
}

// ══════════════════════════════════════════════
//  性格 / 种族值计算
// ══════════════════════════════════════════════

export type { StatKey } from "@pokemon-localdex/store-types";

export function getNatureMultiplier(nature: string, statKey: string): number {
  const effect = NATURE_EFFECTS[nature] as { up: string; down: string } | undefined;
  if (!effect) return 1;
  if (effect.up === statKey) return 1.1;
  if (effect.down === statKey) return 0.9;
  return 1;
}

/**
 * 经典 EV → Champions SP 转换
 * Lv.50 时 EV 的实际能力值增量 = ceil(floor(EV/4) / 2)
 * Champions 的 SP 直接就是能力值加成，所以 SP = 该增量
 */
export function evToSp(ev: number): number {
  if (ev <= 0) return 0;
  const evEffect = Math.floor(ev / 4);
  return Math.min(Math.max(Math.ceil(evEffect / 2), 0), 32);
}

/** calculateFinalStat 的详情参数类型 */
type DetailWithStats = {
  baseStats?: StatBlock;
};

export function calculateFinalStat(
  member: PokemonConfigDraft,
  detail: DetailWithStats | undefined,
  statKey: StatKey,
): number | undefined {
  const base = detail?.baseStats?.[statKey];
  if (base === undefined) return undefined;

  // Champions 模式：SP 直接加算公式
  if (member.statMode === "champions") {
    const sp = Number(member.sps?.[statKey] ?? 0);
    const nature = member.champNature || member.nature || "认真";
    if (statKey === "hp") {
      return base + sp + 75;
    }
    return Math.floor((base + sp + 20) * getNatureMultiplier(nature, statKey));
  }

  // 经典模式：IV + EV 公式
  const level = Number(member.level || 50);
  const iv = Number(member.ivs?.[statKey] ?? 31);
  const ev = Number(member.evs?.[statKey] ?? 0);

  if (statKey === "hp") {
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }

  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(raw * getNatureMultiplier(member.nature || "认真", statKey));
}

export interface ClassicStatOptions {
  iv?: number;
  ev?: number;
  level?: number;
  nature?: string;
}

export function calculateClassicStatValue(
  base: number | undefined | null,
  statKey: StatKey,
  {
    iv = 31,
    ev = 0,
    level = 50,
    nature = "认真",
  }: ClassicStatOptions = {},
): number | undefined {
  if (base === undefined || base === null) return undefined;
  if (statKey === "hp") {
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }

  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(raw * getNatureMultiplier(nature, statKey));
}

export interface SpeedLine {
  noInvestment: number | undefined;
  full: number | undefined;
  max: number | undefined;
}

export function calculateSpeedLine(baseSpe: number | undefined, level = 50): SpeedLine {
  return {
    noInvestment: calculateClassicStatValue(baseSpe, "spe", { iv: 31, ev: 0, level, nature: "认真" }),
    full: calculateClassicStatValue(baseSpe, "spe", { iv: 31, ev: 252, level, nature: "认真" }),
    max: calculateClassicStatValue(baseSpe, "spe", { iv: 31, ev: 252, level, nature: "爽朗" }),
  };
}

export function buildDerivedStats(
  member: PokemonConfig,
  detail: DetailWithStats | undefined,
): Record<string, number | undefined> | undefined {
  if (!detail?.baseStats) return undefined;
  return Object.fromEntries(
    STAT_KEYS.map((key) => [key, calculateFinalStat(member, detail, key)]),
  );
}

export function createDefaultStats(kind: "iv" | "ev"): StatBlock {
  return createStatBlock(kind === "iv" ? 31 : 0);
}

// ══════════════════════════════════════════════
//  草稿 / 预览
// ══════════════════════════════════════════════

type DraftablePokemon = {
  id?: number;
  nameZh?: string;
};

export function createDraftMember(pokemon: DraftablePokemon | undefined): PokemonConfigDraft {
  return {
    pokemonId: pokemon?.id ? String(pokemon.id) : "",
    nameZh: pokemon?.nameZh || "",
    configName: "",
    level: 50,
    itemId: "",
    itemName: "",
    abilityId: "",
    abilityName: "",
    nature: "认真",
    moves: ["", "", "", ""] as [string, string, string, string],
    ivs: createDefaultStats("iv"),
    evs: createDefaultStats("ev"),
  };
}

/** 可以传入 PokemonSummary、PokemonEntry、PokemonTableSummary 等包含 image 字段的对象 */
export type PokemonWithImage = {
  image?: ImageAsset | string;
  images?: Record<string, ImageAsset | string>;
};

/** 从宝可梦数据中提取预览图 URL 字符串 */
export function getPokemonPreviewImage(pokemon: PokemonWithImage | PokemonSummary | PokemonTableSummary | undefined): string | undefined {
  if (!pokemon) return undefined;
  const resolveUrl = (val: ImageAsset | string | undefined): string | undefined => {
    if (!val) return undefined;
    if (typeof val === "string") return val;
    if (typeof val === "object" && "url" in val) return val.url;
    return undefined;
  };
  const images = "images" in pokemon ? (pokemon as PokemonWithImage).images : undefined;
  return resolveUrl(pokemon.image)
    || resolveUrl(images?.["official"])
    || resolveUrl(images?.["sprite"])
    || resolveUrl(images?.["shinyOfficial"])
    || resolveUrl(images?.["shinySprite"]);
}

// ══════════════════════════════════════════════
//  招式学习表
// ══════════════════════════════════════════════

export function describeLearnsetEntry(entry: LearnsetRecord): string {
  const parts: string[] = [];
  const method = LEARN_METHOD_LABELS[entry.learnMethod] || entry.learnMethod;
  if (method) parts.push(method);
  if (entry.level !== undefined) parts.push(`Lv.${entry.level}`);
  if ("notes" in entry && entry.notes) parts.push(String(entry.notes));
  return parts.join(" · ");
}

export function resolveMoveGenerationRecord(
  move: MoveEntry | undefined,
  generation: number | undefined,
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
 * @deprecated Legacy: generationRecords no longer exist in form-centric API.
 * Return undefined — callers should use forms[] instead.
 */
export function resolvePokemonGenerationRecord(
  _pokemon: unknown,
  _generation: number | undefined,
): undefined {
  return undefined;
}

type LegacyGenerationRecord = {
  learnset?: LearnsetRecord[];
  moveIds?: number[];
};

type LegacyPokemon = {
  moveIds?: number[];
} & Partial<LegacyGenerationRecord>;

export function getPokemonLearnsetEntries(
  pokemon: LegacyPokemon | undefined,
  generation: number | undefined,
): Array<{ moveId?: number; moveNameZh?: string }> {
  const record = resolvePokemonGenerationRecord(pokemon, generation) as LegacyGenerationRecord | undefined;
  if (record?.learnset?.length) return record.learnset;
  if (record?.moveIds?.length) return record.moveIds.map((moveId) => ({ moveId }));
  if (pokemon?.moveIds?.length) return pokemon.moveIds.map((moveId) => ({ moveId }));
  return [];
}

const METHOD_ORDER: Record<string, number> = {
  "level-up": 1,
  evolution: 2,
  tm: 3,
  hm: 4,
  tutor: 5,
  egg: 6,
  event: 7,
  other: 8,
};

export function sortLearnsetEntries(entries: LearnsetRecord[]): LearnsetRecord[] {
  return [...entries].sort((a, b) => {
    const am = METHOD_ORDER[a.learnMethod] ?? 99;
    const bm = METHOD_ORDER[b.learnMethod] ?? 99;
    if (am !== bm) return am - bm;
    const al = a.level ?? 999;
    const bl = b.level ?? 999;
    if (al !== bl) return al - bl;
    return String(a.moveNameZh || a.moveId || "").localeCompare(
      String(b.moveNameZh || b.moveId || ""),
      "zh-Hans-CN",
    );
  });
}

type MoveLookupItem = {
  id: string;
  slug?: string;
  nameZh: string;
  nameEn?: string;
  nameJa?: string;
};

export function buildMoveLookup(allMoves: MoveLookupItem[] = []): Map<string, MoveLookupItem> {
  const lookup = new Map<string, MoveLookupItem>();
  for (const move of allMoves) {
    for (const key of [move.id, move.slug, move.nameZh, move.nameEn, move.nameJa].filter(Boolean)) {
      lookup.set(String(key), move);
    }
  }
  return lookup;
}

export function resolveLearnsetMove(
  entry: { moveId?: number; moveNameZh?: string },
  moveLookup: Map<string, MoveLookupItem>,
): MoveLookupItem | undefined {
  return moveLookup.get(String(entry.moveId || "")) ||
    moveLookup.get(String(entry.moveNameZh || "")) ||
    undefined;
}

// ══════════════════════════════════════════════
//  进化家族
// ══════════════════════════════════════════════

type EvolutionFamily = {
  key: string;
  chain: Array<EvolutionStep & { stageLabel?: string; image?: ImageAsset | string }>;
  matches: PokemonEntry[];
};

export function buildEvolutionFamilies(pokemonList: PokemonEntry[]): EvolutionFamily[] {
  const families = new Map<string, EvolutionFamily>();

  function toEvolutionMember(pokemon: PokemonSummary): EvolutionStep & { stageLabel: string; image: ImageAsset | string | undefined } {
    const previewUrl = getPokemonPreviewImage(pokemon);
    return {
      toPokemonId: pokemon.id,
      toNameZh: pokemon.nameZh,
      stage: 0,
      stageLabel: "未进化",
      image: previewUrl ? { url: previewUrl } : undefined,
    };
  }

  for (const pokemon of pokemonList) {
    const chain = Array.isArray(pokemon.evolutionChain) && pokemon.evolutionChain.length > 0
      ? pokemon.evolutionChain
      : [toEvolutionMember(pokemon)];
    const key = chain.map((m) => m.toPokemonId || m.toNameZh).join("|");

    if (!families.has(key)) {
      families.set(key, { key, chain, matches: [] });
    }
    families.get(key)!.matches.push(pokemon);
  }

  return [...families.values()].sort((a, b) => {
    const ad = Math.min(...a.chain.map((m) => Number(m.toPokemonId || 9999)));
    const bd = Math.min(...b.chain.map((m) => Number(m.toPokemonId || 9999)));
    return ad - bd;
  });
}

// ══════════════════════════════════════════════
//  世代 / 形态解析
// ══════════════════════════════════════════════

/**
 * 从形态的 statVariants / typeVariants / abilityVariants 推导可用世代列表。
 * 不再依赖 detail.generations（pokemon_generation_regions 表），
 * 避免详情首开需要额外请求 /generations。
 *
 * 推导逻辑：收集所有 variant 的 generationStart / generationEnd，
 * 展开为连续的世代范围。如果没有任何 variant 则返回空数组（单世代无需切换）。
 */
export function buildPokemonGenerationOptions(detail: PokemonEntry): number[] {
  const forms = detail.forms || [];
  const values = new Set<number>();

  for (const form of forms) {
    const allVariants: Array<FormStatVariant | FormTypeVariant | FormAbilityVariant> = [
      ...(form.statVariants || []),
      ...(form.typeVariants || []),
      ...(form.abilityVariants || []),
    ];
    for (const v of allVariants) {
      const gs = v.generationStart;
      const ge = v.generationEnd;
      if (gs) values.add(Number(gs));
      if (ge) values.add(Number(ge));
    }
  }

  // 如果没有任何 variant，世代切换没有意义——返回空数组
  if (values.size === 0) return [];

  // 补齐连续世代：从最小到最大（上界默认到 9）
  const sorted = [...values].filter(Boolean).sort((a, b) => a - b);
  const min = sorted[0]!;
  const hasOpenEnd = forms.some((f) =>
    [...(f.statVariants || []), ...(f.typeVariants || []), ...(f.abilityVariants || [])]
      .some((v) => v.generationStart && !v.generationEnd),
  );
  const max = hasOpenEnd ? 9 : sorted[sorted.length - 1]!;

  const result: number[] = [];
  for (let g = min; g <= max; g++) result.push(g);
  return result;
}

/**
 * 根据世代从 variants 数组中选择匹配的变体。
 * variants 中每个元素有 generationStart/generationEnd 字段。
 * 返回匹配的变体，如果没有匹配则返回 undefined。
 */
function _resolveVariantForGeneration<T extends { generationStart?: number; generationEnd?: number }>(
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

/** buildPokemonFormOptions 返回的解析后形态 */
export type ResolvedForm = {
  id: string | number;
  formKey: string;
  nameZh: string;
  formType: string;
  isDefault: boolean;
  primaryType?: string;
  secondaryType?: string;
  abilities: Array<{ nameZh: string; isHidden: boolean; abilityId?: number; description?: string }>;
  baseStats?: StatBlock;
  images?: Record<string, ImageAsset | string>;
  requiredItem?: PokemonFormEntry["requiredItem"];
};

export function buildPokemonFormOptions(
  detail: PokemonEntry,
  generation?: number | string,
): ResolvedForm[] {
  const forms = detail.forms || [];
  if (forms.length === 0) {
    // Fallback: synthesize a single "default" form from top-level fields
    return [{
      id: "default",
      formKey: "default",
      nameZh: detail.nameZh || "普通形态",
      formType: "default",
      isDefault: true,
      primaryType: detail.primaryType,
      secondaryType: detail.secondaryType,
      abilities: (detail.abilities || []).map((a) => ({ nameZh: a, isHidden: false })),
      baseStats: detail.baseStats,
      images: detail.image ? { official: detail.image } : undefined,
    }];
  }

  const gen = Number(generation || 0);

  // 每个形态只有一条记录，直接映射
  return forms.map((form) => {
    const resolved: ResolvedForm = { ...form, id: form.formKey || form.nameZh };

    // 如果有世代种族值变体，根据当前世代选择
    if (form.statVariants && form.statVariants.length > 0) {
      const sv = _resolveVariantForGeneration(form.statVariants, gen);
      if (sv) resolved.baseStats = sv.baseStats;
    }

    // 如果有世代属性变体，根据当前世代选择
    if (form.typeVariants && form.typeVariants.length > 0) {
      const tv = _resolveVariantForGeneration(form.typeVariants, gen);
      if (tv) {
        resolved.primaryType = tv.primaryType;
        resolved.secondaryType = tv.secondaryType;
      }
    }

    // 如果有世代特性变体，根据当前世代选择
    if (form.abilityVariants && form.abilityVariants.length > 0) {
      const av = _resolveVariantForGeneration(form.abilityVariants, gen);
      if (av) resolved.abilities = av.abilities;
    }

    return resolved;
  });
}

/** resolvePokemonDisplayVariant 返回值 */
export type PokemonDisplayVariant = {
  generation: number | undefined;
  form: ResolvedForm;
  formOptions: ResolvedForm[];
  generationOptions: number[];
  stats: StatBlock | Partial<StatBlock>;
  images: Record<string, ImageAsset | string> | undefined;
  primaryType: string | undefined;
  secondaryType: string | undefined;
  abilityText: string;
  hiddenAbilityText: string;
  abilitiesDetailed: Array<{ nameZh: string; isHidden: boolean; abilityId?: number; description?: string }>;
};

export function resolvePokemonDisplayVariant(
  detail: PokemonEntry,
  detailGeneration?: number | string,
  detailForm?: string | number,
  globalGeneration?: number | string,
): PokemonDisplayVariant {
  const genOptions = buildPokemonGenerationOptions(detail);
  let generation: number | undefined;
  if (genOptions.length === 0) {
    generation = undefined;
  } else {
    const requested = Number(detailGeneration || globalGeneration || 0);
    generation = (requested && genOptions.includes(requested)) ? requested : genOptions[genOptions.length - 1];
  }

  const formOptions = buildPokemonFormOptions(detail, generation);
  const selectedForm: ResolvedForm = formOptions.find((f) => f.id === detailForm) ?? formOptions[0]!;

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
  const abilitiesDetailed = hasOwnAbilities
    ? formAbilities
    : (detail.abilities || []).map((name) => ({ nameZh: name, isHidden: false }));

  // Resolve images: form images → top-level image fallback
  const images: Record<string, ImageAsset | string> | undefined =
    selectedForm.images || (detail.image ? { official: detail.image } : undefined);

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

// ══════════════════════════════════════════════
//  可学招式筛选
// ══════════════════════════════════════════════

type LearnableMoveEntry = {
  moveId?: number;
  moveNameZh?: string;
};

export function getLearnableDamageMoves(
  pokemon: LegacyPokemon | undefined,
  allMoves: MoveLookupItem[],
  generation: number | undefined,
): { moves: MoveLookupItem[]; learnsetEntries: LearnableMoveEntry[] } {
  const learnsetEntries = getPokemonLearnsetEntries(pokemon, generation);
  if (!pokemon || learnsetEntries.length === 0) {
    return { moves: allMoves, learnsetEntries: [] };
  }

  const moveIds = new Set<string | number>(
    learnsetEntries
      .flatMap((entry) => [entry.moveId, entry.moveNameZh])
      .filter((v): v is string | number => v !== undefined && v !== null && v !== ""),
  );
  const moves = allMoves.filter((move) =>
    moveIds.has(move.id) || moveIds.has(move.slug || "") || moveIds.has(move.nameZh),
  );
  return { moves, learnsetEntries };
}
