/**
 * API 层响应类型定义。
 *
 * 与 store 层类型（@pokemon-localdex/store-types）区分：
 * - store 层类型描述数据库查询返回的结构（如 LearnsetResult）
 * - 本文件类型描述 HTTP API 响应的完整 JSON 结构
 *
 * api<T>() 直接返回 T，T 就是后端返回的完整 JSON。
 */

import type { LearnsetRecord } from "@pokemon-localdex/store-types";

// ══════════════════════════════════════════════════════════════════════════════
// 通用响应类型
// ══════════════════════════════════════════════════════════════════════════════

/** 大部分接口的标准响应：{ data: T } */
export type DataResponse<T> = { data: T };

/** 带分页的列表响应 */
export type PaginatedResponse<T> = {
  data: T[];
  total?: number;
  offset?: number;
  limit?: number;
  hasMore?: boolean;
};

// ══════════════════════════════════════════════════════════════════════════════
// 专用响应类型
// ══════════════════════════════════════════════════════════════════════════════

/** GET /pokemon/:id/learnset 完整响应 */
export type LearnsetResponse = {
  data: {
    moves: LearnsetRecord[];
    pokemonId: number;
    generation: number;
    formKey: string;
    gameVersionCode?: string;
    methodCounts?: Record<string, number>;
  };
  hasMore?: boolean;
  offset?: number;
  limit?: number;
};

/** GET /moves?q=... 搜索结果中的单条招式摘要 */
export type MoveSearchItem = {
  id?: string;
  nameZh: string;
  type?: string;
  category?: string;
  power?: number | null;
  accuracy?: number | null;
  pp?: number | null;
};
