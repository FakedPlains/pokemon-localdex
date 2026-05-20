import { useState, useEffect, useCallback } from "react";
import { unifiedApi } from "../utils/api.js";

/** useApi 返回的状态类型 */
export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/** useApi 的 options 类型（透传给 fetch） */
export interface UseApiOptions extends Omit<RequestInit, "signal"> {
  // 预留：调用方可扩展
}

/**
 * 声明式 API 请求 hook —— 路径变化时自动请求。
 *
 * @param path   API 路径（如 "/pokemon/25"）或可 JSON.stringify 的路径描述
 * @param options  可选的 fetch options；调用方应保持引用稳定或传入可序列化对象
 */
export function useApi<T = unknown>(
  path: string,
  options?: UseApiOptions
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const key = typeof path === "string" ? path : JSON.stringify(path);
  // 序列化 options 以检测变化（调用方应保持 options 引用稳定，或传入可序列化对象）
  const optionsKey = options ? JSON.stringify(options) : "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    unifiedApi<T>(path, options)
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
  }, [key, optionsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error };
}

/** useApiCallback 返回的类型 */
export interface UseApiCallbackResult<T> {
  call: (path: string, options?: UseApiOptions) => Promise<T | null>;
  loading: boolean;
}

/**
 * 命令式 API 调用 hook —— 手动触发请求。
 *
 * @example
 * const { call, loading } = useApiCallback<PokemonDetail>();
 * const detail = await call("/pokemon/25");
 */
export function useApiCallback<T = unknown>(): UseApiCallbackResult<T> {
  const [loading, setLoading] = useState(false);

  const call = useCallback(async (
    path: string,
    options?: UseApiOptions
  ): Promise<T | null> => {
    setLoading(true);
    try {
      const result = await unifiedApi<T>(path, options);
      return result.data;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { call, loading };
}
