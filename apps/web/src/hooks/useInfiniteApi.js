import { useState, useEffect, useCallback, useRef } from "react";
import { unifiedApi } from "../utils/api.js";

/**
 * 瀑布流分页 hook —— 基于 offset/limit 的无限滚动加载。
 * 支持双向加载：从任意 offset 开始，向下追加 + 向上 prepend。
 *
 * @param {string} basePath  API 路径（不含分页参数），如 "/pokemon?q=皮卡丘&type=电"
 * @param {object} options
 * @param {number} [options.pageSize=40]  每页条数
 * @param {number} [options.initialOffset=0]  起始 offset（用于从列表中间开始加载）
 * @param {string} [options.rootMargin="400px"]  IntersectionObserver 提前触发距离
 * @returns {{ data, total, loading, loadingMore, loadingPrev, hasMore, hasPrev, sentinelRef, topSentinelRef, reset, loadMore, loadPrev }}
 */
export function useInfiniteApi(basePath, options = {}) {
  // initialOffset 为 null/undefined 表示「起始位置尚未确定」（如需先查询搜索结果在列表中的位置）。
  // 此时 hook 不发起任何请求，保持 loading 状态，直到外部传入一个真实的数字 offset。
  const { pageSize = 40, rootMargin = "400px", initialOffset = 0 } = options;

  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);          // 首屏加载
  const [loadingMore, setLoadingMore] = useState(false);  // 向下追加
  const [loadingPrev, setLoadingPrev] = useState(false);  // 向上追加
  const [hasMore, setHasMore] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [error, setError] = useState(null);

  const sentinelRef = useRef(null);     // 底部哨兵
  const topSentinelRef = useRef(null);  // 顶部哨兵
  const nextOffsetRef = useRef(0);      // 下一次向下加载的 offset
  const prevOffsetRef = useRef(0);      // 下一次向上加载的起始点（向下数）
  const fetchIdRef = useRef(0);         // 防止竞态

  // 构建带分页参数的完整 URL
  const buildUrl = useCallback((offset) => {
    const sep = basePath.includes("?") ? "&" : "?";
    return `${basePath}${sep}limit=${pageSize}&offset=${offset}`;
  }, [basePath, pageSize]);

  // 加载一页数据（向下）
  const fetchPageDown = useCallback(async (offset, isFirstLoad) => {
    const id = ++fetchIdRef.current;
    if (isFirstLoad) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const result = await unifiedApi(buildUrl(offset));
      if (id !== fetchIdRef.current) return; // 竞态丢弃

      const newItems = result.data || [];
      const newTotal = result.total ?? 0;
      const newHasMore = result.hasMore ?? false;

      if (isFirstLoad) {
        setData(newItems);
      } else {
        setData((prev) => [...prev, ...newItems]);
      }
      setTotal(newTotal);
      setHasMore(newHasMore);
      nextOffsetRef.current = offset + newItems.length;
    } catch (err) {
      if (id !== fetchIdRef.current) return;
      setError(err);
    } finally {
      if (id === fetchIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [buildUrl]);

  // 加载一页数据（向上 prepend）
  const fetchPageUp = useCallback(async () => {
    if (prevOffsetRef.current <= 0) return;

    const id = ++fetchIdRef.current;
    setLoadingPrev(true);
    setError(null);

    // 计算向上加载的范围：从 prevOffset 往前取 pageSize 条
    const end = prevOffsetRef.current;
    const start = Math.max(0, end - pageSize);
    const count = end - start;

    try {
      const sep = basePath.includes("?") ? "&" : "?";
      const url = `${basePath}${sep}limit=${count}&offset=${start}`;
      const result = await unifiedApi(url);
      if (id !== fetchIdRef.current) return;

      const newItems = result.data || [];

      // 向上 prepend 会把已有内容往下推，导致 window 滚动位置视觉跳动。
      // 记录插入前的 scrollHeight，插入后用高度差补偿 scrollTop，保持视口稳定。
      const prevScrollHeight = document.documentElement.scrollHeight;
      const prevScrollTop = window.scrollY;

      setData((prev) => [...newItems, ...prev]);
      prevOffsetRef.current = start;
      setHasPrev(start > 0);

      // 在下一帧（DOM 更新后）补偿滚动位置
      requestAnimationFrame(() => {
        const delta = document.documentElement.scrollHeight - prevScrollHeight;
        if (delta > 0) {
          window.scrollTo({ top: prevScrollTop + delta, behavior: "instant" });
        }
      });
    } catch (err) {
      if (id !== fetchIdRef.current) return;
      setError(err);
    } finally {
      if (id === fetchIdRef.current) {
        setLoadingPrev(false);
      }
    }
  }, [basePath, pageSize]);

  // basePath 或 initialOffset 变化时重置并加载首页。
  // 当 initialOffset 尚未确定（null/undefined）时不发起请求，避免多打一次 offset=0 的列表查询。
  useEffect(() => {
    if (initialOffset == null) {
      // 起始位置未就绪：保持首屏 loading，不发请求
      setLoading(true);
      return;
    }
    nextOffsetRef.current = initialOffset;
    prevOffsetRef.current = initialOffset;
    setData([]);
    setTotal(0);
    setHasMore(false);
    setHasPrev(initialOffset > 0);
    fetchPageDown(initialOffset, true);
  }, [fetchPageDown, initialOffset]);

  // 加载更多（向下）
  const loadMore = useCallback(() => {
    if (loadingMore || loading || !hasMore) return;
    fetchPageDown(nextOffsetRef.current, false);
  }, [fetchPageDown, loadingMore, loading, hasMore]);

  // 加载更多（向上）
  const loadPrev = useCallback(() => {
    if (loadingPrev || loading || !hasPrev) return;
    fetchPageUp();
  }, [fetchPageUp, loadingPrev, loading, hasPrev]);

  // IntersectionObserver 自动触发向下加载
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, rootMargin]);

  // IntersectionObserver 自动触发向上加载
  useEffect(() => {
    const el = topSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadPrev();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadPrev, rootMargin]);

  // 手动重置
  const reset = useCallback(() => {
    nextOffsetRef.current = 0;
    prevOffsetRef.current = 0;
    setData([]);
    setTotal(0);
    setHasMore(false);
    setHasPrev(false);
    fetchPageDown(0, true);
  }, [fetchPageDown]);

  return {
    data,
    total,
    loading,
    loadingMore,
    loadingPrev,
    hasMore,
    hasPrev,
    error,
    sentinelRef,
    topSentinelRef,
    loadMore,
    loadPrev,
    reset,
  };
}
