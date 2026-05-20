import { useState, useEffect, useCallback, useRef } from "react";
import { unifiedApi } from "../utils/api.js";

/** 分页 API 响应的约定结构 */
export interface PaginatedResponse<T> {
  data: T[];
  total?: number;
  hasMore?: boolean;
}

/** useInfiniteApi 的配置项 */
export interface UseInfiniteApiOptions {
  /** 每页条数，默认 40 */
  pageSize?: number;
  /** IntersectionObserver 提前触发距离，默认 "400px" */
  rootMargin?: string;
}

/** useInfiniteApi 返回的状态类型 */
export interface UseInfiniteApiResult<T> {
  /** 已加载的全部数据 */
  data: T[];
  /** 服务端总数 */
  total: number;
  /** 首屏加载中 */
  loading: boolean;
  /** 追加加载中 */
  loadingMore: boolean;
  /** 是否还有更多数据 */
  hasMore: boolean;
  /** 请求错误 */
  error: Error | null;
  /** 哨兵元素 ref，挂载到列表底部触发加载更多 */
  sentinelRef: React.RefCallback<HTMLElement>;
  /** 手动触发加载更多 */
  loadMore: () => void;
  /** 重置并重新加载首页 */
  reset: () => void;
}

/**
 * 瀑布流分页 hook —— 基于 offset/limit 的无限滚动加载。
 *
 * @param basePath  API 路径（不含分页参数），如 "/pokemon?q=皮卡丘&type=电"
 * @param options   配置项
 */
export function useInfiniteApi<T = unknown>(
  basePath: string,
  options: UseInfiniteApiOptions = {}
): UseInfiniteApiResult<T> {
  const { pageSize = 40, rootMargin = "400px" } = options;

  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);         // 首屏加载
  const [loadingMore, setLoadingMore] = useState(false); // 追加加载
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sentinelRef = useRef<HTMLElement | null>(null);
  const offsetRef = useRef(0);
  const fetchIdRef = useRef(0); // 防止竞态

  // 构建带分页参数的完整 URL
  const buildUrl = useCallback((offset: number): string => {
    const sep = basePath.includes("?") ? "&" : "?";
    return `${basePath}${sep}limit=${pageSize}&offset=${offset}`;
  }, [basePath, pageSize]);

  // 加载一页数据
  const fetchPage = useCallback(async (offset: number, append: boolean): Promise<void> => {
    const id = ++fetchIdRef.current;
    if (!append) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const result = await unifiedApi<T[]>(buildUrl(offset));
      if (id !== fetchIdRef.current) return; // 竞态丢弃

      const newItems = result.data ?? [];
      const newTotal = result.total ?? 0;
      const newHasMore = result.hasMore ?? false;

      if (append) {
        setData((prev) => [...prev, ...newItems]);
      } else {
        setData(newItems);
      }
      setTotal(newTotal);
      setHasMore(newHasMore);
      offsetRef.current = offset + newItems.length;
    } catch (err: unknown) {
      if (id !== fetchIdRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (id === fetchIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [buildUrl]);

  // basePath 变化时重置并加载首页
  useEffect(() => {
    offsetRef.current = 0;
    setData([]);
    setTotal(0);
    setHasMore(false);
    fetchPage(0, false);
  }, [fetchPage]);

  // 加载更多
  const loadMore = useCallback((): void => {
    if (loadingMore || loading || !hasMore) return;
    fetchPage(offsetRef.current, true);
  }, [fetchPage, loadingMore, loading, hasMore]);

  // IntersectionObserver 自动触发加载更多
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, rootMargin]);

  // 手动重置
  const reset = useCallback((): void => {
    offsetRef.current = 0;
    setData([]);
    setTotal(0);
    setHasMore(false);
    fetchPage(0, false);
  }, [fetchPage]);

  // 将 ref 对象转为 RefCallback 以满足 React 19 兼容性
  const sentinelRefCallback = useCallback((node: HTMLElement | null): void => {
    sentinelRef.current = node;
  }, []);

  return {
    data,
    total,
    loading,
    loadingMore,
    hasMore,
    error,
    sentinelRef: sentinelRefCallback,
    loadMore,
    reset
  };
}
