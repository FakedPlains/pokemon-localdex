import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { unifiedApi } from "../utils/api.js";
import { useInfiniteApi } from "../hooks/useInfiniteApi.js";
import Loading from "../components/Loading.jsx";

function parseExpandParam() {
  const hash = window.location.hash || "";
  const qIdx = hash.indexOf("?");
  if (qIdx < 0) return null;
  const params = new URLSearchParams(hash.slice(qIdx));
  return params.get("expand") || null;
}

export default function ItemsPage({ query = "" }) {
  const [expanded, setExpanded] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const pendingExpandRef = useRef(parseExpandParam());

  // Reset expanded when filters change
  useEffect(() => { setExpanded(null); }, [query]);

  // 构建分页请求路径
  const itemsPath = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `/items?${qs}` : "/items";
  }, [query]);

  const { data: items, total, loading, loadingMore, hasMore, sentinelRef, loadMore } = useInfiniteApi(itemsPath, { pageSize: 50 });

  // Auto-expand item from URL hash param (e.g. #/items?expand=some-slug)
  useEffect(() => {
    const expandId = pendingExpandRef.current;
    if (!expandId || loading) return;
    if (items.length === 0 && !hasMore) {
      pendingExpandRef.current = null;
      return;
    }
    if (items.length === 0) return;

    const target = items.find((it) => it.slug === expandId || String(it.id) === expandId);
    if (target) {
      pendingExpandRef.current = null;
      const key = target.slug || target.id;
      setExpanded(key);
      if (!detailCache[key]) {
        unifiedApi(`/items/${encodeURIComponent(key)}`).then((r) => {
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
    } else if (hasMore && !loadingMore) {
      loadMore();
    } else if (!hasMore) {
      pendingExpandRef.current = null;
      const hash = window.location.hash || "";
      const qIdx = hash.indexOf("?");
      if (qIdx >= 0) {
        window.history.replaceState(null, "", hash.slice(0, qIdx));
      }
    }
  }, [items, loading, hasMore, loadingMore, loadMore]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = useCallback((key) => {
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setExpanded(key);
    if (!detailCache[key]) {
      unifiedApi(`/items/${encodeURIComponent(key)}`).then((r) => {
        setDetailCache((prev) => ({ ...prev, [key]: r.data }));
      });
    }
  }, [expanded, detailCache]);

  if (loading && items.length === 0) return <Loading />;

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

        <div className="it-list">
          {items.map((item) => {
            const key = item.slug || item.id;
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
                      <div className="it-detail-loading">
                        <div className="pulse-dot" />
                        <span>加载中…</span>
                      </div>
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
                          {detail.nameJa && <span className="it-name-tag it-name-ja">{detail.nameJa}</span>}
                          {detail.nameEn && <span className="it-name-tag it-name-en">{detail.nameEn}</span>}
                          {detail.introducedGeneration && (
                            <span className="it-name-tag it-name-gen">第 {detail.introducedGeneration} 世代引入</span>
                          )}
                          {detail.category && (
                            <span className="it-name-tag it-name-cat">{detail.category}</span>
                          )}
                          {detail.source?.url && (
                            <a href={detail.source.url} target="_blank" rel="noopener noreferrer" className="it-wiki-link" title={detail.source.title || "Wiki"}>
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10" />
                                <path d="M9 2h5v5" /><path d="M14 2 7.5 8.5" />
                              </svg>
                            </a>
                          )}
                        </div>

                        {/* 效果说明 */}
                        <div className="it-detail-effect">
                          <div className="it-detail-effect-title">效果说明</div>
                          <div className="it-detail-effect-text">
                            {detail.effectSummary || "暂无说明"}
                          </div>
                        </div>

                        {/* 效果详情 */}
                        {detail.effectDetail && (
                          <div className="it-detail-effect">
                            <div className="it-detail-effect-title">效果详情</div>
                            <div className="it-detail-effect-text">
                              {detail.effectDetail}
                            </div>
                          </div>
                        )}

                        {/* 世代变更 */}
                        {detail.generations?.length > 0 && (
                          <div className="it-gen-section">
                            <div className="it-gen-title">世代变更</div>
                            <div className="it-gen-timeline">
                              {detail.generations.map((record, i) => (
                                <div key={i} className="it-gen-item">
                                  <div className="it-gen-badges">
                                    <div className="it-gen-badge">
                                      {record.generation === 99 ? "Champions" : `Gen ${record.generation}`}
                                    </div>
                                    {record.gameVersionCode && (
                                      <div className="it-gen-version">{record.gameVersionCode}</div>
                                    )}
                                  </div>
                                  <div className="it-gen-text">{record.description}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 来源 */}
                        {detail.source?.url && (
                          <div className="it-source">
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
