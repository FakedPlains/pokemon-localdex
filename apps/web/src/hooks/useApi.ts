import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../utils/api";
import type { DataResponse } from "../utils/apiTypes";

/** useApi 返回的状态类型 */
export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/** useApi 的 options 类型 */
export interface UseApiOptions extends Omit<RequestInit, "signal"> {
  /** 是否启用请求，默认 true；设为 false 或 path 为 null 时不发请求 */
  enabled?: boolean;
}

/**
 * 声明式 API 请求 hook —— 路径变化时自动请求。
 *
 * 假设后端返回 `{ data: T }` 结构，自动解包 data 字段。
 *
 * @param path   API 路径（如 "/pokemon/25"），传 null 表示暂不请求
 * @param options  可选的 fetch options + enabled 控制
 */
export function useApi<T = unknown>(
  path: string | null,
  options?: UseApiOptions
): UseApiResult<T> {
  const { enabled = true, ...fetchOptions } = options ?? {};
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled && path !== null);
  const [error, setError] = useState<Error | null>(null);

  // 使用 ref 保存最新的 fetchOptions，避免 effect 依赖不稳定对象引用
  const fetchOptionsRef = useRef(fetchOptions);
  fetchOptionsRef.current = fetchOptions;

  // 通过序列化 key 控制 effect 是否重新执行
  const fetchOptionsKey = Object.keys(fetchOptions).length > 0 ? JSON.stringify(fetchOptions) : "";

  useEffect(() => {
    if (!enabled || path === null) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setData(null);
    setLoading(true);
    setError(null);

    api<DataResponse<T>>(path, fetchOptionsRef.current)
      .then((result) => {
        if (!cancelled) {
          setData(result.data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [path, fetchOptionsKey, enabled]);

  return { data, loading, error };
}

/** useApiCallback 返回的类型 */
export interface UseApiCallbackResult<T> {
  call: (path: string, options?: Omit<UseApiOptions, "enabled">) => Promise<T | null>;
  loading: boolean;
}

/**
 * 命令式 API 调用 hook —— 手动触发请求。
 *
 * 假设后端返回 `{ data: T }` 结构，自动解包 data 字段。
 *
 * @example
 * const { call, loading } = useApiCallback<PokemonDetail>();
 * const detail = await call("/pokemon/25");
 */
export function useApiCallback<T = unknown>(): UseApiCallbackResult<T> {
  const [loading, setLoading] = useState(false);

  const call = useCallback(async (
    path: string,
    options?: Omit<UseApiOptions, "enabled">
  ): Promise<T | null> => {
    setLoading(true);
    try {
      const result = await api<DataResponse<T>>(path, options);
      return result.data;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { call, loading };
}
