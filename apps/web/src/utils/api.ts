/**
 * 统一 API 层 —— 通过 Hono API 中间层请求数据。
 *
 * 约定：业务代码（页面、组件、hooks）一律使用 unifiedApi 作为统一入口，
 * 不要直接调用底层 rawApi。所有跨请求的统一逻辑（默认请求头、鉴权、
 * 错误处理、上报、重试等）都集中收敛到 unifiedApi，便于后续扩展。
 */

/**
 * 标准 API 响应结构。
 * 成功响应始终包含 data；列表接口在传入 limit 时会附带分页字段。
 * @template T data 的载荷类型，默认 unknown，由调用方通过泛型显式指定。
 */
export interface ApiResponse<T = unknown> {
  data: T;
  /** 列表接口（带 limit 时）返回的总条数 */
  total?: number;
  /** 列表接口（带 limit 时）返回的当前偏移量 */
  offset?: number;
  /** 列表接口（带 limit 时）返回的每页条数 */
  limit?: number;
  /** 列表接口（带 limit 时）是否还有下一页 */
  hasMore?: boolean;
}

/**
 * 底层 fetch 实现：拼接 /api 前缀、设置默认请求头、对非 2xx 抛错并解析 JSON。
 * 仅供 unifiedApi 内部使用，业务代码请勿直接调用。
 */
async function rawApi<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * 统一入口：所有业务请求都应经过这里。
 * 当前是对底层请求的薄封装，后续可在此集中追加鉴权头、
 * 错误上报、重试、缓存等跨请求逻辑，而无需改动各调用点。
 *
 * @template T 期望的 data 载荷类型。调用方应显式传入泛型以获得类型安全，
 *             例如 unifiedApi<Pokemon[]>("/pokemon")，避免使用 as 断言。
 */
export async function unifiedApi<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  return rawApi<T>(path, options);
}

/**
 * 兼容导出：历史代码中仍以 api 命名引用统一入口。
 * 等价于 unifiedApi，新代码请直接使用 unifiedApi。
 */
export const api = unifiedApi;
