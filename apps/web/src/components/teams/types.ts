/**
 * teams 组件专用的扩展类型
 *
 * PokemonConfig（来自 teamStorage）是 localStorage 持久化结构，
 * 运行时组件会额外附加 imageUrl / formKey / baseStats 等展示字段。
 * PokemonConfigDraft 是编辑态草稿，允许字段缺失。
 * PokemonConfigDisplay 基于完整 PokemonConfig 扩展，用于展示已保存配置的组件。
 */

import type { StatBlock } from "@pokemon-localdex/store-types";
import type { PokemonConfig, PokemonConfigDraft } from "../../utils/teamStorage.js";

/**
 * 运行时扩展的宝可梦配置（包含 UI 展示字段）
 *
 * 基于完整 PokemonConfig，用于 BoxCard/BoxListRow/TeamSlot 等展示组件。
 */
export type PokemonConfigDisplay = PokemonConfig & {
  /** 闪光图片 URL（字符串或含 url 字段的对象） */
  shinyImageUrl?: string | { url?: string };
  /** 种族值（从 API 获取或缓存，允许 null） */
  baseStats?: StatBlock | null;
  /** 招式类型信息缓存（部分字段可选） */
  _movesInfo?: Record<string, { moveId?: number | null; type?: string; power?: string | number | null; category?: string }>;
};

/**
 * 编辑态的配置展示类型，字段可以缺失。
 * 用于 PokemonEditor 等编辑组件的 props 和 state。
 */
export type PokemonConfigEditState = PokemonConfigDraft & {
  /** 闪光图片 URL（字符串或含 url 字段的对象） */
  shinyImageUrl?: string | { url?: string };
  /** 种族值（从 API 获取或缓存，允许 null） */
  baseStats?: StatBlock | null;
  /** 招式类型信息缓存（部分字段可选） */
  _movesInfo?: Record<string, { moveId?: number | null; type?: string; power?: string | number | null; category?: string }>;
};

/** 菜单操作 */
export interface MenuAction {
  label: string;
  onClick: () => void;
  className?: string;
}
