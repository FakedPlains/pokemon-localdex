/**
 * @pokemon-localdex/store-types
 *
 * sqlite-store 和 d1-store 共享的数据模型类型定义。
 * 两个 store 包均从此处导入并重新导出，保证类型一致。
 */

import { TYPE_ALIASES, TYPE_OPTIONS, typeIdToName, typeNameToId } from "./constants.js";

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
  formKey: string;
  nameZh: string;
  formType: string;
  isDefault: boolean;
  sortOrder: number;
  primaryType?: string;
  secondaryType?: string;
  abilities: Array<{ nameZh: string; isHidden: boolean; abilityId?: number; description?: string }>;
  baseStats?: StatBlock;
  images: Record<string, ImageAsset>;
  /** 该形态必须携带的道具（如 Mega 石、原始宝珠等），为 null/undefined 表示无绑定 */
  requiredItem?: { id: string; nameZh: string; slug: string; imageUrl?: string };
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
  fromFormKey?: string;
  toPokemonId: number;
  toNameZh: string;
  toFormKey?: string;
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
  slug: string;
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
  generations: number[];
};

export type PokemonCardSummary = {
  id: number;
  dexNumber: number;
  slug: string;
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
  slug: string;
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
  slug: string;
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

// ══════════════════════════════════════════════════════════════════════════════
// 分页
// ══════════════════════════════════════════════════════════════════════════════

export type SortOrder = "asc" | "desc";
export type PokemonListSortKey = "speed";
export type PaginationParams = { offset?: number; limit?: number };
export type PaginatedResult<T> = { items: T[]; total: number };

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
  getPokemon(idOrSlug: string, filters?: { championsSeasonId?: number }): Promise<PokemonEntry | undefined>;
  getPokemonIdentity(idOrSlug: string): Promise<PokemonIdentity | undefined>;
  getLearnsetMeta(pokemonId: number): Promise<any>;
  getPokemonLearnset(pokemonId: number, generation: number, formKey?: string, gameVersionCode?: string): Promise<{ moves: LearnsetRecord[]; formKey: string; gameVersionCode?: string }>;

  // Champions
  listChampionsSeasons(): Promise<ChampionsSeasonSummary[]>;

  // Moves
  listMoves(filters?: { query?: string; type?: string; category?: string; generation?: number } & PaginationParams): Promise<MoveEntry[] | PaginatedResult<MoveEntry>>;
  getMove(idOrSlug: string): Promise<MoveEntry | undefined>;
  getPokemonByMove(moveId: number, pagination?: PaginationParams): Promise<any[] | PaginatedResult<any>>;

  // Abilities
  listAbilities(filters?: { query?: string; generation?: number } & PaginationParams): Promise<AbilityEntry[] | PaginatedResult<AbilityEntry>>;
  getAbility(idOrName: string): Promise<AbilityEntry | undefined>;
  getPokemonByAbility(abilityId: number, pagination?: PaginationParams): Promise<any[] | PaginatedResult<any>>;

  // Items
  listItems(filters?: { query?: string; category?: string } & PaginationParams): Promise<ItemEntry[] | PaginatedResult<ItemEntry>>;
  getItem(idOrSlug: string): Promise<ItemEntry | undefined>;

  // Battle: 原子名称查询（供 battle-core 的 resolveNames 编排使用）
  pokemonNameEn(opts: {
    pokemonId?: string | number;
    formId?: string | number;
    formKey?: string;
    name?: string;
  }): Promise<string | undefined>;

  entityNameEn(
    kind: "move" | "ability" | "item",
    id?: string | number,
    nameZh?: string,
  ): Promise<string | undefined>;
}

// ══════════════════════════════════════════════════════════════════════════════
// 共享常量
// ══════════════════════════════════════════════════════════════════════════════

export const GENERATIONS = [
  [1, "第一世代", "Generation I"],
  [2, "第二世代", "Generation II"],
  [3, "第三世代", "Generation III"],
  [4, "第四世代", "Generation IV"],
  [5, "第五世代", "Generation V"],
  [6, "第六世代", "Generation VI"],
  [7, "第七世代", "Generation VII"],
  [8, "第八世代", "Generation VIII"],
  [9, "第九世代", "Generation IX"],
  [99, "Champions", "Champions"],
] as const;

export const GAME_VERSIONS: Array<[string, string, number]> = [
  ["RG", "红/绿", 1], ["B", "蓝", 1], ["Y", "黄", 1],
  ["GS", "金/银", 2], ["C", "水晶", 2],
  ["RS", "红宝石/蓝宝石", 3], ["E", "绿宝石", 3], ["FRLG", "火红/叶绿", 3],
  ["DP", "钻石/珍珠", 4], ["Pt", "白金", 4], ["HGSS", "心金/魂银", 4],
  ["BW", "黑/白", 5], ["B2W2", "黑2/白2", 5],
  ["XY", "X/Y", 6], ["ORAS", "欧米伽红宝石/阿尔法蓝宝石", 6],
  ["SM", "太阳/月亮", 7], ["USUM", "究极之日/究极之月", 7], ["LPLE", "Let's Go 皮卡丘/伊布", 7],
  ["SWSH", "剑/盾", 8], ["SWSHE", "剑/盾 铠之孤岛+冠之雪原", 8], ["BDSP", "晶灿钻石/明亮珍珠", 8], ["LA", "传说 阿尔宙斯", 8],
  ["SV", "朱/紫", 9], ["SVT", "朱/紫 零之秘宝", 9], ["ZA", "传说 Z-A", 9],
  ["CHAMP", "冠军", 99],
];

export const GAME_VERSION_NAMES = new Map<string, string>(
  GAME_VERSIONS.map(([code, nameZh]) => [code, nameZh])
);

export * from "./constants.js";

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
  const candidates = [...TYPE_OPTIONS.map((typeOption) => typeOption.nameZh), ...Object.keys(TYPE_ALIASES)].sort((a, b) => b.length - a.length);
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
