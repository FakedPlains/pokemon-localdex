import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../utils/api.js";

/**
 * 瀑布流分页 hook —— 基于 offset/limit 的无限滚动加载。
 *
 * @param {string} basePath  API 路径（不含分页参数），如 "/pokemon?q=皮卡丘&type=电"
 * @param {object} options
 * @param {number} [options.pageSize=40]  每页条数
 * @param {string} [options.rootMargin="400px"]  IntersectionObserver 提前触发距离
 * @returns {{ data, total, loading, loadingMore, hasMore, sentinelRef, reset }}
 */
export function useInfiniteApi(basePath, options = {}) {
  const { pageSize = 40, rootMargin = "400px" } = options;

  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);       // 首屏加载
  const [loadingMore, setLoadingMore] = useState(false); // 追加加载
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);

  const sentinelRef = useRef(null);
  const offsetRef = useRef(0);
  const fetchIdRef = useRef(0);  // 防止竞态

  // 构建带分页参数的完整 URL
  const buildUrl = useCallback((offset) => {
    const sep = basePath.includes("?") ? "&" : "?";
    return `${basePath}${sep}limit=${pageSize}&offset=${offset}`;
  }, [basePath, pageSize]);

  // 加载一页数据
  const fetchPage = useCallback(async (offset, append) => {
    const id = ++fetchIdRef.current;
    if (!append) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const result = await api(buildUrl(offset));
      if (id !== fetchIdRef.current) return; // 竞态丢弃

      const newItems = result.data || [];
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

  // basePath 变化时重置并加载首页
  useEffect(() => {
    offsetRef.current = 0;
    setData([]);
    setTotal(0);
    setHasMore(false);
    fetchPage(0, false);
  }, [fetchPage]);

  // 加载更多
  const loadMore = useCallback(() => {
    if (loadingMore || loading || !hasMore) return;
    fetchPage(offsetRef.current, true);
  }, [fetchPage, loadingMore, loading, hasMore]);

  // IntersectionObserver 自动触发加载更多
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

  // 手动重置
  const reset = useCallback(() => {
    offsetRef.current = 0;
    setData([]);
    setTotal(0);
    setHasMore(false);
    fetchPage(0, false);
  }, [fetchPage]);

  return { data, total, loading, loadingMore, hasMore, error, sentinelRef, loadMore, reset };
}
