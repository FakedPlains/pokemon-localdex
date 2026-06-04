/**
 * 图鉴抽屉（Drawer）视图层共享类型
 *
 * 这些类型描述 `resolvePokemonDisplayVariant()`（位于 utils/helpers.ts）
 * 的输入/输出结构，供 DrawerContent / StatsTab / MovesTab 等子组件统一引用，
 * 避免各处重复定义同名类型导致 "Two different types with this name" 冲突。
 *
 * ── 设计原则 ──
 * 本文件不再手写复刻 `@pokemon-localdex/store-types` 的字段子集，而是直接
 * 从权威类型（PokemonFormEntry / PokemonEntry / FormStatVariant 等）派生，
 * 保证字段命名、语义和新增字段（formCategory / canonicalNameZh /
 * displayNameZh / requiredItem 等）自动与数据源保持一致。
 *
 * 仅在「展示层与存储层存在真实差异」处做最小化的局部放宽：
 *   1. primaryType / secondaryType 在展示层允许 `null`（helper 会把世代
 *      变体的属性回填进来，且 TypeChip / 属性克制面板按 `string | null` 取值），
 *      而 store 侧统一用 `string | undefined`。
 *   2. 合成的「默认形态」(buildPokemonFormOptions 的 fallback) 以及
 *      helper 重建的形态对象，并不保证 store 侧的全部必填字段（formType /
 *      formKey / images / sortOrder 等），因此 view 层把这些字段放宽为可选。
 */
import type {
  ImageAsset,
  PokemonEntry,
  PokemonFormEntry,
  FormStatVariant,
  FormTypeVariant,
  FormAbilityVariant,
} from "@pokemon-localdex/store-types";

/**
 * 单条特性信息。
 *
 * 等价于 store 侧 PokemonFormEntry.abilities[] / FormAbilityVariant.abilities[]
 * 的元素结构，但展示层把 isHidden 放宽为可选（合成默认形态时只填 nameZh）。
 */
export type AbilityDetail =
  Partial<Pick<PokemonFormEntry["abilities"][number], "isHidden">> &
  Omit<PokemonFormEntry["abilities"][number], "isHidden">;

/**
 * 形态的种族值世代变体。
 *
 * 复用 store 侧 FormStatVariant 的世代区间字段，但 baseStats 在展示层放宽为
 * `Record<string, number>` 且可选——展示层统一按字符串 key 遍历 STAT_KEYS 取值，
 * 且 StatsTab 在比较相邻变体时会显式判空（`if (!current || !other) return null`）。
 */
export type StatVariant = Omit<FormStatVariant, "baseStats"> & {
  baseStats?: Record<string, number>;
};

/**
 * 形态的属性世代变体。
 *
 * 复用 store 侧 FormTypeVariant，但属性字段在展示层允许 `null`
 * （helper 直接把这里的值回填到 DisplayVariant.primaryType）。
 */
export type TypeVariant = Omit<FormTypeVariant, "primaryType" | "secondaryType"> & {
  primaryType?: string | null;
  secondaryType?: string | null;
};

/**
 * 形态的特性世代变体。
 *
 * 复用 store 侧 FormAbilityVariant，但 abilities 元素采用展示层放宽后的
 * AbilityDetail（isHidden 可选）。
 */
export type AbilityVariant = Omit<FormAbilityVariant, "abilities"> & {
  abilities?: AbilityDetail[];
};

/**
 * 单个形态选项（展示层）。
 *
 * 以 store 侧权威 PokemonFormEntry 为基底，复用 formCategory / canonicalNameZh /
 * displayNameZh / requiredItem 等全部字段；仅对展示层确有差异的字段做放宽：
 *   - formType / formKey / nameZh / images / sortOrder 等放宽为可选
 *     （fallback 合成形态与 helper 重建的形态不保证齐全）；
 *   - primaryType / secondaryType 允许 `null`；
 *   - abilities / statVariants / typeVariants / abilityVariants 改用
 *     展示层放宽后的元素类型。
 */
export type FormOption =
  Omit<
    PokemonFormEntry,
    | "formType"
    | "formKey"
    | "formCategory"
    | "nameZh"
    | "isDefault"
    | "sortOrder"
    | "images"
    | "baseStats"
    | "primaryType"
    | "secondaryType"
    | "abilities"
    | "statVariants"
    | "typeVariants"
    | "abilityVariants"
  > & {
    formType?: string;
    formKey?: string;
    formCategory?: string;
    nameZh?: string;
    isDefault?: boolean;
    sortOrder?: number;
    images?: Record<string, ImageAsset>;
    baseStats?: Record<string, number>;
    primaryType?: string | null;
    secondaryType?: string | null;
    abilities?: AbilityDetail[];
    statVariants?: StatVariant[];
    typeVariants?: TypeVariant[];
    abilityVariants?: AbilityVariant[];
  };

/**
 * 宝可梦详情（API /pokemon/:id 返回的主体，展示层）。
 *
 * 以 store 侧权威 PokemonEntry 为基底，复用 category / heightM / weightKg /
 * source 等字段；仅对展示层确有差异处做放宽：
 *   - 顶层身份/属性字段放宽为可选（详情首开时可能尚未水合）；
 *   - primaryType / secondaryType 允许 `null`；
 *   - forms 使用展示层放宽后的 FormOption；
 *   - 额外暴露 image / images（顶层预览图，供 getPokemonPreviewImage 兜底）。
 */
export type PokemonDetail =
  Omit<
    PokemonEntry,
    | "id"
    | "dexNumber"
    | "nameZh"
    | "nameEn"
    | "abilities"
    | "baseStats"
    | "primaryType"
    | "secondaryType"
    | "forms"
    | "evolutionChain"
  > & {
    id: number;
    dexNumber?: number;
    nameZh?: string;
    nameEn?: string;
    primaryType?: string | null;
    secondaryType?: string | null;
    abilities?: string[];
    baseStats?: Record<string, number>;
    image?: ImageAsset;
    images?: Record<string, ImageAsset>;
    forms?: FormOption[];
  };

/** resolvePokemonDisplayVariant 的返回结构 */
export interface DisplayVariant {
  generation?: number;
  form: FormOption;
  formOptions: FormOption[];
  generationOptions: number[];
  stats: Record<string, number>;
  images: Record<string, ImageAsset> | null;
  primaryType?: string | null;
  secondaryType?: string | null;
  abilityText: string;
  hiddenAbilityText: string;
  abilitiesDetailed: AbilityDetail[];
}
