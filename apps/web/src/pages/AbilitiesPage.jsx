import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api } from "../utils/api.js";
import { useInfiniteApi } from "../hooks/useInfiniteApi.js";
import Loading from "../components/Loading.jsx";

function parseExpandParam() {
  const hash = window.location.hash || "";
  const qIdx = hash.indexOf("?");
  if (qIdx < 0) return null;
  const params = new URLSearchParams(hash.slice(qIdx));
  return params.get("expand") || null;
}

export default function AbilitiesPage({ query = "", generation = "" }) {
  const [expanded, setExpanded] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const pendingExpandRef = useRef(parseExpandParam());

  // 构建分页请求路径
  const abilitiesPath = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (generation) params.set("generation", generation);
    const qs = params.toString();
    return qs ? `/abilities?${qs}` : "/abilities";
  }, [query, generation]);

  const { data: abilities, total, loading, loadingMore, hasMore, sentinelRef, loadMore } = useInfiniteApi(abilitiesPath, { pageSize: 50 });

  // Auto-expand ability from URL hash param (e.g. #/abilities?expand=123)
  useEffect(() => {
    const expandId = pendingExpandRef.current;
    if (!expandId || loading) return;
    if (abilities.length === 0 && !hasMore) {
      // No abilities at all, give up
      pendingExpandRef.current = null;
      return;
    }
    if (abilities.length === 0) return; // still loading first page

    const numId = Number(expandId);
    const target = abilities.find((a) => a.id === numId || String(a.id) === expandId);
    if (target) {
      pendingExpandRef.current = null; // consume once found
      const key = target.id;
      setExpanded(key);
      if (!detailCache[key]) {
        api(`/abilities/${encodeURIComponent(key)}`).then((r) => {
          setDetailCache((prev) => ({ ...prev, [key]: r.data }));
        });
      }
      // Scroll to the ability row after DOM update
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-ability-id="${key}"]`);
        if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
      });
      // Clean up the expand param from hash
      const hash = window.location.hash || "";
      const qIdx = hash.indexOf("?");
      if (qIdx >= 0) {
        window.history.replaceState(null, "", hash.slice(0, qIdx));
      }
    } else if (hasMore && !loadingMore) {
      // Target not found yet, load more data
      loadMore();
    } else if (!hasMore) {
      // All data loaded but target not found, give up
      pendingExpandRef.current = null;
      const hash = window.location.hash || "";
      const qIdx = hash.indexOf("?");
      if (qIdx >= 0) {
        window.history.replaceState(null, "", hash.slice(0, qIdx));
      }
    }
  }, [abilities, loading, hasMore, loadingMore, loadMore]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = useCallback((slug) => {
    if (expanded === slug) {
      setExpanded(null);
      return;
    }
    setExpanded(slug);
    if (!detailCache[slug]) {
      api(`/abilities/${encodeURIComponent(slug)}`).then((r) => {
        setDetailCache((prev) => ({ ...prev, [slug]: r.data }));
      });
    }
  }, [expanded, detailCache]);

  if (loading && abilities.length === 0) return <Loading />;

  return (
    <section className="ab-page">
      <div className="panel ab-panel">
        <div className="ab-header">
          <h2 className="panel-title">特性资料</h2>
          <p className="panel-subtitle">
            共收录 {total > 0 ? total : abilities.length} 个特性，按编号排序。点击展开查看详细效果与世代变更。
          </p>
        </div>


        {abilities.length === 0 && !loading && (
          <div className="ab-empty">没有找到匹配的特性。</div>
        )}

        <div className="ab-list">
          {abilities.map((ability) => {
            const key = ability.id;
            const isExpanded = expanded === key;
            const detail = detailCache[key];
            return (
              <div key={ability.id} data-ability-id={ability.id} className={`ab-row${isExpanded ? " ab-row-expanded" : ""}`}>
                <button className="ab-row-header" onClick={() => toggleExpand(key)}>
                  <span className="ab-row-number">
                    {ability.number ? String(ability.number).padStart(3, "0") : "—"}
                  </span>
                  <span className="ab-row-name">{ability.nameZh}</span>
                  {ability.nameEn && <span className="ab-row-name-en">{ability.nameEn}</span>}
                  <span className="ab-row-desc">
                    {ability.description || "暂无说明"}
                  </span>
                  <span className={`ab-row-arrow${isExpanded ? " ab-row-arrow-open" : ""}`}>
                    ▾
                  </span>
                </button>

                {isExpanded && (
                  <div className="ab-row-detail">
                    {!detail ? (
                      <div className="ab-detail-loading">
                        <div className="pulse-dot" />
                        <span>加载中…</span>
                      </div>
                    ) : (
                      <>
                        {/* 名称标签 */}
                        <div className="ab-detail-names">
                          {detail.nameJa && <span className="ab-name-tag ab-name-ja">{detail.nameJa}</span>}
                          {detail.nameEn && <span className="ab-name-tag ab-name-en">{detail.nameEn}</span>}
                          {detail.introducedGeneration && (
                            <span className="ab-name-tag ab-name-gen">第 {detail.introducedGeneration} 世代引入</span>
                          )}
                        </div>

                        {/* 详细效果 */}
                        <div className="ab-detail-effect">
                          <div className="ab-detail-effect-title">特性效果</div>
                          <div className="ab-detail-effect-text">
                            {detail.effectDetail || detail.description || "暂无详细说明"}
                          </div>
                        </div>

                        {/* 世代变更 */}
                        {detail.generations?.length > 0 && (
                          <div className="ab-gen-section">
                            <div className="ab-gen-title">世代变更</div>
                            <div className="ab-gen-timeline">
                              {detail.generations.map((record, i) => (
                                <div key={i} className="ab-gen-item">
                                  <div className="ab-gen-badges">
                                    <div className="ab-gen-badge">
                                      {record.generation === 99 ? "Champions" : `Gen ${record.generation}`}
                                    </div>
                                    {record.gameVersionName && (
                                      <div className="ab-gen-version">{record.gameVersionName}</div>
                                    )}
                                  </div>
                                  <div className="ab-gen-text">{record.description}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 来源 */}
                        {detail.source?.url && (
                          <div className="ab-source">
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
          <div className="ab-load-more" ref={sentinelRef}>
            <div className="pulse-dot" />
          </div>
        )}
      </div>
    </section>
  );
}
