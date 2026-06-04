import { useState, useEffect, useCallback } from "react";
import { unifiedApi } from "../utils/api.js";

/** useApi 的返回结构 */
export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * 单次请求 hook：在 path/options 变化时自动请求并返回 data/loading/error。
 *
 * @template T 期望的 data 载荷类型。调用方应显式传入泛型以获得类型安全，
 *             例如 useApi<ChampionsSeasonSummary[]>("/champions/seasons")，
 *             避免在调用处使用 as 断言。
 */
export function useApi<T = unknown>(path: string, options?: RequestInit): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const key = path;
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

    return () => {
      cancelled = true;
    };
  }, [key, optionsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error };
}

/** useApiCallback 的返回结构 */
export interface UseApiCallbackResult {
  call: <T = unknown>(path: string, options?: RequestInit) => Promise<T>;
  loading: boolean;
}

/**
 * 命令式请求 hook：返回一个可手动调用的 call 函数，并跟踪 loading 状态。
 * call 支持按调用传入泛型以指定返回的 data 类型。
 */
export function useApiCallback(): UseApiCallbackResult {
  const [loading, setLoading] = useState(false);

  const call = useCallback(async <T = unknown>(path: string, options?: RequestInit): Promise<T> => {
    setLoading(true);
    try {
      const result = await unifiedApi<T>(path, options);
      return result.data;
    } finally {
      setLoading(false);
    }
  }, []);

  return { call, loading };
}
