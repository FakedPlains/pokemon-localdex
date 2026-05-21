import { useState, useCallback, useRef } from "react";
import { api } from "../utils/api";

/**
 * useScrollPagination 配置项
 *
 * @typeParam T - 列表中单条数据的元素类型
 * @typeParam R - 映射后组件使用的数据类型（默认与 T 相同）
 */
export interface UseScrollPaginationOptions<T, R = T> {
  /** 每页条数，默认 50 */
  pageSize?: number;
  /**
   * 从 API 响应的 data 字段中提取项目数组。
   * 当接口的 data 是对象而非数组时使用（例如 learnset 返回 { moves, formKey }）。
   * 不提供时默认假设 data 本身就是 T[]。
   */
  extractItems?: (data: unknown) => T[];
  /** 将 API 响应的单条数据映射为组件使用的数据，返回 null 则跳过 */
  mapItem?: (item: T) => R | null;
  /** 对映射后的结果做去重（返回唯一标识字符串），相同 key 只保留首次出现 */
  dedupeKey?: (item: R) => string;
  /** 滚动触底阈值（距底部多少 px 时触发加载），默认 100 */
  threshold?: number;
  /**
   * 首页加载完成后的回调，可用于读取响应中的额外元数据。
   * 第二个参数是当前请求路径。
   * 返回一个新路径字符串时，后续分页请求将使用该路径（适用于服务端 fallback 场景）。
   */
  onFirstPage?: (responseData: unknown, currentPath: string) => string | void;
}

/** useScrollPagination 返回值 */
export interface UseScrollPaginationResult<R> {
  /** 已加载并映射后的全部数据 */
  data: R[];
  /** 是否正在加载 */
  loading: boolean;
  /** 是否还有更多数据可加载 */
  hasMore: boolean;
  /** 加载下一页（内部会检查 loading/hasMore 守卫） */
  loadMore: () => void;
  /** 重置并重新加载首页；若传入 newPath，会更新后续请求路径 */
  reset: (newPath?: string) => void;
  /** 绑定到可滚动容器的 onScroll 处理函数 */
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

/**
 * 轻量滚动分页 hook —— 为内嵌面板中 onScroll 驱动的无限滚动设计。
 *
 * 与 useInfiniteApi 的区别：
 * - 不依赖 IntersectionObserver，适用于固定高度容器 + onScroll 事件
 * - 不在 mount 时自动请求，需调用 reset(path) 触发首次加载
 * - 支持 mapItem 数据映射和 dedupeKey 去重
 * - 路径动态变化时通过 reset(newPath) 切换数据源
 *
 * 典型用法：
 * ```ts
 * const items = useScrollPagination<ItemEntry, ItemOption>("/items", {
 *   mapItem: (item) => ({ value: item.id, label: item.nameZh }),
 * });
 * // 面板打开时: items.reset()
 * // 搜索时: items.reset("/items?q=xxx")
 * // 容器: <div onScroll={items.onScroll}>...</div>
 * ```
 */
export function useScrollPagination<T = unknown, R = T>(
  initialPath: string | null,
  options: UseScrollPaginationOptions<T, R> = {},
): UseScrollPaginationResult<R> {
  const {
    pageSize = 50,
    extractItems,
    mapItem,
    dedupeKey,
    threshold = 100,
    onFirstPage,
  } = options;

  const [data, setData] = useState<R[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const offsetRef = useRef(0);
  const pathRef = useRef(initialPath);
  const fetchIdRef = useRef(0);
  const seenRef = useRef<Set<string>>(new Set());
  // 同步守卫：防止连续 scroll 事件在 React state 更新前多次触发请求
  const loadingRef = useRef(false);

  const fetchPage = useCallback((path: string, offset: number, append: boolean) => {
    const id = ++fetchIdRef.current;
    loadingRef.current = true;
    setLoading(true);

    const sep = path.includes("?") ? "&" : "?";
    const url = `${path}${sep}limit=${pageSize}&offset=${offset}`;

    api<{ data: unknown; hasMore?: boolean }>(url).then((r) => {
      if (id !== fetchIdRef.current) return;

      // 首页加载时调用 onFirstPage，允许调用方根据响应修正后续分页路径
      if (!append && onFirstPage) {
        const correctedPath = onFirstPage(r.data, path);
        if (correctedPath) pathRef.current = correctedPath;
      }

      const raw: T[] = extractItems
        ? extractItems(r.data)
        : (Array.isArray(r.data) ? r.data as T[] : []);

      const mapped: R[] = [];
      for (const item of raw) {
        const result = mapItem ? mapItem(item) : (item as unknown as R);
        if (result === null) continue;
        if (dedupeKey) {
          const key = dedupeKey(result);
          if (seenRef.current.has(key)) continue;
          seenRef.current.add(key);
        }
        mapped.push(result);
      }

      if (append) {
        setData((prev) => [...prev, ...mapped]);
      } else {
        setData(mapped);
      }
      setHasMore(r.hasMore ?? false);
      offsetRef.current = offset + raw.length;
      loadingRef.current = false;
      setLoading(false);
    }).catch(() => {
      if (id !== fetchIdRef.current) return;
      loadingRef.current = false;
      setLoading(false);
    });
  }, [pageSize, extractItems, mapItem, dedupeKey, onFirstPage]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || loading || !hasMore) return;
    const path = pathRef.current;
    if (!path) return;
    fetchPage(path, offsetRef.current, true);
  }, [loading, hasMore, fetchPage]);

  const reset = useCallback((newPath?: string) => {
    const path = newPath !== undefined ? newPath : pathRef.current;
    if (newPath !== undefined) pathRef.current = newPath;
    offsetRef.current = 0;
    seenRef.current = new Set();
    setData([]);
    setHasMore(true);
    if (!path) {
      setLoading(false);
      return;
    }
    fetchPage(path, 0, false);
  }, [fetchPage]);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
      loadMore();
    }
  }, [loadMore, threshold]);

  return { data, loading, hasMore, loadMore, reset, onScroll };
}
