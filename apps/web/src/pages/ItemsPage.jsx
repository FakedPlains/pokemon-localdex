import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { unifiedApi } from "../utils/api.js";
import { useInfiniteApi } from "../hooks/useInfiniteApi.js";
import { parseExpandParam } from "../utils/helpers.js";
import Loading from "../components/Loading.tsx";
import GenerationTimeline from "../components/GenerationTimeline.jsx";
import WikiLink from "../components/WikiLink.jsx";

const PAGE_SIZE = 50;

export default function ItemsPage({ query = "" }) {
  const [expanded, setExpanded] = useState(null);
  const [detailCache, setDetailCache] = useState({});

  // 解析 URL 中的 expand 目标
  const expandTargetRef = useRef(parseExpandParam());
  const [initialOffset, setInitialOffset] = useState(null);
  const didExpandRef = useRef(false);

  // Reset expanded when filters change
  useEffect(() => { setExpanded(null); }, [query]);

  // 构建分页请求路径
  const itemsPath = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `/items?${qs}` : "/items";
  }, [query]);

  // 确定起始 offset
  useEffect(() => {
    const expandId = expandTargetRef.current;
    if (!expandId) {
      setInitialOffset(0);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const qs = params.toString();
    const url = `/items/${expandId}/position${qs ? `?${qs}` : ""}`;
    unifiedApi(url)
      .then((r) => {
        if (cancelled) return;
        const pos = r?.data?.position ?? 0;
        const start = Math.max(0, pos - Math.floor(PAGE_SIZE / 2));
        setInitialOffset(start);
      })
      .catch(() => {
        if (cancelled) return;
        expandTargetRef.current = null;
        setInitialOffset(0);
      });
    return () => { cancelled = true; };
  }, [query]);

  const {
    data: items,
    total,
    loading,
    hasMore,
    hasPrev,
    sentinelRef,
    topSentinelRef,
  } = useInfiniteApi(itemsPath, { pageSize: PAGE_SIZE, initialOffset });

  // 首屏加载完后定位展开目标（仅一次）
  useEffect(() => {
    const expandId = expandTargetRef.current;
    if (!expandId || didExpandRef.current) return;
    if (loading || items.length === 0) return;

    const target = items.find((it) => String(it.id) === expandId || it.nameZh === expandId);
    if (target) {
      didExpandRef.current = true;
      expandTargetRef.current = null;
      const key = String(target.id);
      setExpanded(key);
      if (!detailCache[key]) {
        unifiedApi(`/items/${key}`).then((r) => {
          setDetailCache((prev) => ({ ...prev, [key]: r.data }));
        });
      }
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-item-id="${key}"]`);
        if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
      });
      const hash = window.location.hash || "";
      const qIdx = hash.indexOf("?");
      if (qIdx >= 0) {
        window.history.replaceState(null, "", hash.slice(0, qIdx));
      }
    }
  }, [items, loading, detailCache]);

  const toggleExpand = useCallback((key) => {
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setExpanded(key);
    if (!detailCache[key]) {
      unifiedApi(`/items/${key}`).then((r) => {
        setDetailCache((prev) => ({ ...prev, [key]: r.data }));
      });
    }
  }, [expanded, detailCache]);

  if (initialOffset === null || (loading && items.length === 0)) return <Loading />;

  return (
    <section className="it-page">
      <div className="panel it-panel">
        <div className="it-header">
          <h2 className="panel-title">道具资料</h2>
          <span className="panel-subtitle">
            共收录 {total > 0 ? total : items.length} 个道具，按编号排序。点击展开查看详细效果与世代变更。
          </span>
        </div>

        {items.length === 0 && !loading && (
          <div className="it-empty">没有找到匹配的道具。</div>
        )}

        {hasPrev && (
          <div className="it-load-more it-load-prev" ref={topSentinelRef}>
            <div className="pulse-dot" />
          </div>
        )}

        <div className="it-list">
          {items.map((item) => {
            const key = String(item.id);
            const isExpanded = expanded === key;
            const detail = detailCache[key];
            return (
              <div key={item.id} data-item-id={key} className={`it-row${isExpanded ? " it-row-expanded" : ""}`}>
                <button className="it-row-header" onClick={() => toggleExpand(key)}>
                  <span className="it-row-thumb">
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt="" referrerPolicy="no-referrer" />
                      : <span className="it-row-thumb-placeholder">?</span>}
                  </span>
                  <span className="it-row-name">{item.nameZh}</span>
                  {item.nameEn && <span className="it-row-name-en">{item.nameEn}</span>}
                  <span className="it-row-cat">
                    <span className="chip">{item.category || "未分类"}</span>
                  </span>
                  <span className="it-row-desc">
                    {item.effectSummary || "暂无说明"}
                  </span>
                  <span className={`it-row-arrow${isExpanded ? " it-row-arrow-open" : ""}`}>
                    ▾
                  </span>
                </button>

                {isExpanded && (
                  <div className="it-row-detail">
                    {!detail ? (
                      <Loading variant="inline" text="加载中…" />
                    ) : (
                      <>
                        {/* 图片 */}
                        {detail.imageUrl && (
                          <div className="it-detail-image">
                            <img src={detail.imageUrl} alt={detail.nameZh} referrerPolicy="no-referrer" />
                          </div>
                        )}

                        {/* 名称标签 */}
                        <div className="it-detail-names">
                          {detail.nameJa && <span className="shared-name-tag shared-name-ja">{detail.nameJa}</span>}
                          {detail.nameEn && <span className="shared-name-tag shared-name-en">{detail.nameEn}</span>}
                          {detail.introducedGeneration && (
                            <span className="shared-name-tag shared-name-gen">第 {detail.introducedGeneration} 世代引入</span>
                          )}
                          {detail.category && (
                            <span className="shared-name-tag it-name-cat">{detail.category}</span>
                          )}
                          <WikiLink url={detail.source?.url} title={detail.source?.title || "Wiki"} />
                        </div>

                        {/* 效果说明 */}
                        <div className="shared-detail-effect">
                          <div className="shared-detail-effect-title">效果说明</div>
                          <div className="shared-detail-effect-text">
                            {detail.effectSummary || "暂无说明"}
                          </div>
                        </div>

                        {/* 效果详情 */}
                        {detail.effectDetail && (
                          <div className="shared-detail-effect">
                            <div className="shared-detail-effect-title">效果详情</div>
                            <div className="shared-detail-effect-text">
                              {detail.effectDetail}
                            </div>
                          </div>
                        )}

                        {/* 世代变更 */}
                        <GenerationTimeline generations={detail.generations} />

                        {/* 来源 */}
                        {detail.source?.url && (
                          <div className="shared-source">
                            <a href={detail.source.url} target="_blank" rel="noopener noreferrer">
                              来源：{detail.source.title || "52Poké Wiki"}
                            </a>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {hasMore && (
          <div className="it-load-more" ref={sentinelRef}>
            <div className="pulse-dot" />
          </div>
        )}
      </div>
    </section>
  );
}
