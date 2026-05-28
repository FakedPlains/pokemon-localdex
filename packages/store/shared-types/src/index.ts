/**
 * @pokemon-localdex/store-types
 *
 * sqlite-store 和 d1-store 共享的数据模型类型定义。
 * 两个 store 包均从此处导入并重新导出，保证类型一致。
 */

import { TYPE_OPTIONS, typeIdToName, typeNameToId } from "./constants.ts";

// ══════════════════════════════════════════════════════════════════════════════
// 基础类型
// ══════════════════════════════════════════════════════════════════════════════

export type StatBlock = {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
};

export type SourceMeta = {
  url: string;
  title: string;
  fetchedAt: string;
};

export type ImageAsset = {
  url: string;
  alt?: string;
};

// ══════════════════════════════════════════════════════════════════════════════
// 宝可梦形态相关
// ══════════════════════════════════════════════════════════════════════════════

export type FormStatVariant = {
  generationStart?: number;
  generationEnd?: number;
  baseStats: StatBlock;
};

export type FormTypeVariant = {
  generationStart?: number;
  generationEnd?: number;
  primaryType?: string;
  secondaryType?: string;
};

export type FormAbilityVariant = {
  generationStart?: number;
  generationEnd?: number;
  abilities: Array<{ nameZh: string; isHidden: boolean; abilityId?: number; description?: string }>;
};

export type PokemonFormEntry = {
  id: number;
  /** Legacy API alias for formType; kept so older UI/localStorage can still render. */
  formKey: string;
  formType: string;
  formCategory: string;
  /** Canonical full Chinese form name, aligned with Champions availability names. */
  canonicalNameZh?: string;
  /** Human-facing form label used by Pokemon detail UI. */
  displayNameZh?: string;
  nameZh: string;
  nameEn?: string;
  isDefault: boolean;
  sortOrder: number;
  primaryType?: string;
  secondaryType?: string;
  abilities: Array<{ nameZh: string; isHidden: boolean; abilityId?: number; description?: string }>;
  baseStats?: StatBlock;
  images: Record<string, ImageAsset>;
  /** 该形态必须携带的道具（如 Mega 石、原始宝珠等），为 null/undefined 表示无绑定 */
  requiredItem?: { id: string; nameZh: string; imageUrl?: string };
  /** Generation-specific stat variants (when stats changed across generations) */
  statVariants?: FormStatVariant[];
  /** Generation-specific type variants (when types changed across generations) */
  typeVariants?: FormTypeVariant[];
  /** Generation-specific ability variants (when abilities changed across generations) */
  abilityVariants?: FormAbilityVariant[];
};

// ══════════════════════════════════════════════════════════════════════════════
// 进化链
// ══════════════════════════════════════════════════════════════════════════════

export type EvolutionStep = {
  fromPokemonId?: number;
  fromNameZh?: string;
  fromFormId?: number;
  toPokemonId: number;
  toNameZh: string;
  toFormId?: number;
  /** 形态的中文展示名（如"阿罗拉拉达"），仅非默认形态时有值 */
  toFormName?: string;
  stage: number;
  method?: string;
  condition?: string;
  item?: string;
  level?: number;
  toTypes?: string[];
  toImage?: ImageAsset;
};

// ══════════════════════════════════════════════════════════════════════════════
// 宝可梦列表/详情
// ══════════════════════════════════════════════════════════════════════════════

export type PokemonSummary = {
  id: number;
  dexNumber: number;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  primaryType?: string;
  secondaryType?: string;
  abilities: string[];
  hiddenAbility?: string;
  baseStats?: StatBlock;
  image?: ImageAsset;
  shinyImage?: ImageAsset;
};

export type PokemonCardSummary = {
  id: number;
  dexNumber: number;
  nameZh: string;
  nameEn?: string;
  primaryType?: string;
  secondaryType?: string;
  image?: ImageAsset;
};

export type PokemonTableSummary = PokemonCardSummary & {
  abilities: string[];
  hiddenAbility?: string;
  baseStats?: StatBlock;
};

export type PokemonEntry = PokemonSummary & {
  category?: string;
  heightM?: number;
  weightKg?: number;
  forms: PokemonFormEntry[];
  evolutionChain: EvolutionStep[];
  source?: SourceMeta;
};

export type PokemonIdentity = {
  id: number;
  dexNumber: number;
  nameZh: string;
};

// ══════════════════════════════════════════════════════════════════════════════
// Champions 赛季 / 赛制
// ══════════════════════════════════════════════════════════════════════════════

export type ChampionsSeasonSummary = {
  id: number;
  seasonCode: string;
  regulationCode: string;
  regulationName?: string;
  startAt?: string;
  endAt?: string;
  periodText?: string;
};

// ══════════════════════════════════════════════════════════════════════════════
// 招式
// ══════════════════════════════════════════════════════════════════════════════

export type MoveGenerationRecord = {
  generation: number;
  gameVersionCode?: string;
  gameVersionName?: string;
  versionExclusive?: boolean;
  type?: string;
  category?: string;
  power?: number;
  accuracy?: number;
  pp?: number;
  description: string;
  notes?: string;
};

export type MoveEntry = {
  id: string;
  number?: number;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  type?: string;
  category?: string;
  power?: number;
  accuracy?: number;
  pp?: number;
  description?: string;
  effectDetail?: string;
  introducedGeneration?: number;
  generations: MoveGenerationRecord[];
  source?: SourceMeta;
};

// ══════════════════════════════════════════════════════════════════════════════
// 特性
// ══════════════════════════════════════════════════════════════════════════════

export type AbilityGenerationRecord = {
  generation: number;
  gameVersionCode?: string;
  gameVersionName?: string;
  versionExclusive?: boolean;
  description: string;
  notes?: string;
};

export type AbilityEntry = {
  id: string;
  number?: number;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  description?: string;
  effectDetail?: string;
  introducedGeneration?: number;
  generations: AbilityGenerationRecord[];
  source?: SourceMeta;
};

// ══════════════════════════════════════════════════════════════════════════════
// 道具
// ══════════════════════════════════════════════════════════════════════════════

export type ItemGenerationRecord = {
  generation: number;
  gameVersionCode?: string;
  gameVersionName?: string;
  versionExclusive?: boolean;
  description: string;
  notes?: string;
};

export type ItemEntry = {
  id: string;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  category?: string;
  effectSummary?: string;
  effectDetail?: string;
  introducedGeneration?: number;
  imageUrl?: string;
  generations: ItemGenerationRecord[];
  source?: SourceMeta;
};

// ══════════════════════════════════════════════════════════════════════════════
// 技能学习记录
// ══════════════════════════════════════════════════════════════════════════════

export type LearnsetRecord = {
  moveId?: number;
  moveNameZh: string;
  learnMethod: string;
  level?: number;
  tmNumber?: string;
  moveType?: string;
  moveCategory?: string;
  movePower?: number;
  moveAccuracy?: number;
  movePP?: number;
  moveDescription?: string;
};

export type LearnsetFormMeta = {
  formId: number;
  formType: string;
  formCategory: string;
  canonicalNameZh?: string;
  displayNameZh?: string;
  nameZh: string;
  nameEn?: string;
  isDefault: boolean;
  hasOwnMovesByGeneration?: Record<number, boolean>;
};

export type LearnsetQueryOptions = {
  formId?: number;
  gameVersionCode?: string;
};

export type LearnsetResult = {
  moves: LearnsetRecord[];
  formId: number;
  effectiveFormId: number;
  usesDefaultLearnset: boolean;
  gameVersionCode?: string;
  hasMore?: boolean;
  methodCounts?: Record<string, number>;
};

// ══════════════════════════════════════════════════════════════════════════════
// 招式表 Meta / 宝可梦反查摘要
// ══════════════════════════════════════════════════════════════════════════════

export type LearnsetMeta = {
  generations: number[];
  forms: LearnsetFormMeta[];
  versionsByGen: Record<number, Array<{ code: string; name: string }>>;
};

/** getPokemonByMove 返回的宝可梦摘要 */
export type PokemonByMoveSummary = {
  id: number;
  dexNumber: number;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  primaryType?: string;
  secondaryType?: string;
  image?: string;
  learnMethods: string[];
};

/** getPokemonByAbility 返回的宝可梦摘要 */
export type PokemonByAbilitySummary = {
  id: number;
  dexNumber: number;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  primaryType?: string;
  secondaryType?: string;
  image?: string;
  isHidden: boolean;
};

// ══════════════════════════════════════════════════════════════════════════════
// 分页
// ══════════════════════════════════════════════════════════════════════════════

export type SortOrder = "asc" | "desc";
export type PokemonListSortKey = "speed";
export type PaginationParams = { offset?: number; limit?: number };
export type PaginatedResult<T> = { items: T[]; total?: number; hasMore: boolean };

// ══════════════════════════════════════════════════════════════════════════════
// Store 统一接口（sqlite-store 和 d1-store 共同实现）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 两个 store 实现的公共接口。
 * 所有方法统一返回 Promise，sqlite-store 通过适配器包装同步调用。
 * app.ts 和 worker.ts 的共享路由层只依赖此接口。
 */
export interface IStore {
  // Pokemon
  listPokemon(filters?: {
    query?: string;
    type?: string | string[];
    generation?: number;
    championsSeasonId?: number;
    sort?: PokemonListSortKey;
    order?: SortOrder;
  } & PaginationParams): Promise<PokemonSummary[] | PaginatedResult<PokemonSummary>>;
  listPokemonCards(filters?: {
    query?: string;
    type?: string | string[];
    generation?: number;
    championsSeasonId?: number;
    sort?: PokemonListSortKey;
    order?: SortOrder;
  } & PaginationParams): Promise<PokemonCardSummary[] | PaginatedResult<PokemonCardSummary>>;
  listPokemonTable(filters?: {
    query?: string;
    type?: string | string[];
    generation?: number;
    championsSeasonId?: number;
    sort?: PokemonListSortKey;
    order?: SortOrder;
  } & PaginationParams): Promise<PokemonTableSummary[] | PaginatedResult<PokemonTableSummary>>;
  getPokemon(idOrName: string, filters?: { championsSeasonId?: number }): Promise<PokemonEntry | undefined>;
  getPokemonSummary(idOrName: string, filters?: { championsSeasonId?: number }): Promise<Omit<PokemonEntry, "evolutionChain"> | undefined>;
  getPokemonEvolution(pokemonId: number): Promise<EvolutionStep[]>;
  getPokemonIdentity(idOrName: string): Promise<PokemonIdentity | undefined>;
  getLearnsetMeta(pokemonId: number): Promise<LearnsetMeta>;
  getPokemonLearnset(
    pokemonId: number,
    generation: number,
    options?: LearnsetQueryOptions,
    pagination?: PaginationParams,
    learnMethod?: string,
  ): Promise<LearnsetResult>;

  // Champions
  listChampionsSeasons(): Promise<ChampionsSeasonSummary[]>;

  // Moves
  listMoves(filters?: { query?: string; type?: string; category?: string; generation?: number } & PaginationParams): Promise<MoveEntry[] | PaginatedResult<MoveEntry>>;
  getMove(idOrName: string): Promise<MoveEntry | undefined>;
  getPokemonByMove(moveId: number, pagination?: PaginationParams): Promise<PokemonByMoveSummary[] | PaginatedResult<PokemonByMoveSummary>>;

  // Abilities
  listAbilities(filters?: { query?: string; generation?: number } & PaginationParams): Promise<AbilityEntry[] | PaginatedResult<AbilityEntry>>;
  getAbility(idOrName: string): Promise<AbilityEntry | undefined>;
  getPokemonByAbility(abilityId: number, pagination?: PaginationParams): Promise<PokemonByAbilitySummary[] | PaginatedResult<PokemonByAbilitySummary>>;

  // Items
  listItems(filters?: { query?: string; category?: string } & PaginationParams): Promise<ItemEntry[] | PaginatedResult<ItemEntry>>;
  getItem(idOrName: string): Promise<ItemEntry | undefined>;

  // Battle: 结构化效果查询
  getAbilityBattleEffects(abilityId: number, generation?: number): Promise<import("./battle-effects.ts").AbilityBattleEffect[]>;
  getItemBattleEffects(itemId: number, generation?: number): Promise<import("./battle-effects.ts").ItemBattleEffect[]>;
  getMoveBattleEffects(moveId: number, generation?: number): Promise<import("./battle-effects.ts").MoveBattleEffect[]>;
  getMoveFlags(moveId: number): Promise<import("./battle-effects.ts").MoveFlag[]>;
  getMoveFlagsBatch(moveIds: number[]): Promise<Map<number, import("./battle-effects.ts").MoveFlag[]>>;

  // Battle: 原子名称查询（供 battle-core 的 resolveNames 编排使用）
  pokemonNameEn(opts: {
    pokemonId?: string | number;
    formId?: string | number;
    name?: string;
  }): Promise<string | undefined>;

  entityNameEn(
    kind: "move" | "ability" | "item",
    id?: string | number,
    nameZh?: string,
  ): Promise<string | undefined>;

  // Battle: 伤害倍率查询（供 battle-core breakdown 展示使用）
  getDamageModifier?(
    kind: "ability" | "item",
    id?: string | number,
    nameZh?: string,
    generation?: number,
  ): Promise<{ value: number; effectType: number; affectedStat?: number } | undefined>;
}

export * from "./constants.ts";
export * from "./battle-effects.ts";

// ══════════════════════════════════════════════════════════════════════════════
// 共享辅助函数
// ══════════════════════════════════════════════════════════════════════════════

export function normalizeTypeName(type: string | undefined): string {
  const id = typeNameToId(type);
  return id ? typeIdToName(id) : type ? type.trim() : "";
}

export function typeLegacyId(type: string | undefined): string | undefined {
  const normalized = normalizeTypeName(type);
  return normalized ? `type-${normalized}` : undefined;
}

export function splitTypeNames(type: string | undefined): string[] {
  const normalized = normalizeTypeName(type);
  if (!normalized) return [];
  if (typeNameToId(normalized)) return [normalized];
  const compact = normalized.replace(/\s+/g, "");
  const result: string[] = [];
  let rest = compact;
  const candidates = TYPE_OPTIONS.map((typeOption) => typeOption.nameZh).sort((a, b) => b.length - a.length);
  while (rest) {
    const match = candidates.find((c) => rest.startsWith(c));
    if (!match) break;
    result.push(normalizeTypeName(match));
    rest = rest.slice(match.length);
  }
  return rest ? [normalized] : [...new Set(result)];
}

export function statBlockFromRow(row: Record<string, unknown>): StatBlock | undefined {
  if (row.hp === null || row.hp === undefined) return undefined;
  return {
    hp: Number(row.hp), atk: Number(row.atk), def: Number(row.def),
    spa: Number(row.spa), spd: Number(row.spd), spe: Number(row.spe),
  };
}

export function sourceFromRow(row: Record<string, unknown>): SourceMeta | undefined {
  return row.source_url || row.source_title || row.source_fetched_at
    ? { url: String(row.source_url ?? ""), title: String(row.source_title ?? ""), fetchedAt: String(row.source_fetched_at ?? "") }
    : undefined;
}
