import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { unifiedApi } from "../utils/api.js";
import { useInfiniteApi } from "../hooks/useInfiniteApi.js";
import { parseExpandParam } from "../utils/helpers.js";
import Loading from "../components/Loading.jsx";
import PokemonGrid from "../components/PokemonGrid.jsx";
import GenerationTimeline from "../components/GenerationTimeline.jsx";
import WikiLink from "../components/WikiLink.jsx";

const PAGE_SIZE = 50;

export default function AbilitiesPage({ query = "", generation = "" }) {
  const [expanded, setExpanded] = useState(null);
  const [detailCache, setDetailCache] = useState({});

  // 解析 URL 中的 expand 目标
  const expandTargetRef = useRef(parseExpandParam());
  const [initialOffset, setInitialOffset] = useState(null);
  const didExpandRef = useRef(false);

  // Reset expanded when filters change
  useEffect(() => { setExpanded(null); }, [query, generation]);

  // 构建分页请求路径
  const abilitiesPath = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (generation) params.set("generation", generation);
    const qs = params.toString();
    return qs ? `/abilities?${qs}` : "/abilities";
  }, [query, generation]);

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
    if (generation) params.set("generation", generation);
    const qs = params.toString();
    const url = `/abilities/${expandId}/position${qs ? `?${qs}` : ""}`;
    unifiedApi(url)
      .then((r) => {
        if (cancelled) return;
        const pos = r?.data?.position ?? 0;
        const start = Math.max(0, Math.floor((pos - Math.floor(PAGE_SIZE / 2)) / PAGE_SIZE) * PAGE_SIZE);
        setInitialOffset(start);
      })
      .catch(() => {
        if (cancelled) return;
        expandTargetRef.current = null;
        setInitialOffset(0);
      });
    return () => { cancelled = true; };
  }, [query, generation]);

  const {
    data: abilities,
    total,
    loading,
    hasMore,
    hasPrev,
    sentinelRef,
    topSentinelRef,
  } = useInfiniteApi(abilitiesPath, { pageSize: PAGE_SIZE, initialOffset });

  // 首屏加载完后定位展开目标（仅一次）
  useEffect(() => {
    const expandId = expandTargetRef.current;
    if (!expandId || didExpandRef.current) return;
    if (loading || abilities.length === 0) return;

    const numId = Number(expandId);
    const target = abilities.find((a) => a.id === numId || String(a.id) === expandId);
    if (target) {
      didExpandRef.current = true;
      expandTargetRef.current = null;
      const key = target.id;
      setExpanded(key);
      if (!detailCache[key]) {
        unifiedApi(`/abilities/${key}`).then((r) => {
          setDetailCache((prev) => ({ ...prev, [key]: r.data }));
        });
      }
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-ability-id="${key}"]`);
        if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
      });
      const hash = window.location.hash || "";
      const qIdx = hash.indexOf("?");
      if (qIdx >= 0) {
        window.history.replaceState(null, "", hash.slice(0, qIdx));
      }
    }
  }, [abilities, loading, detailCache]);

  // 宝可梦区域展开状态（独立于特性详情的展开）
  const [pokemonExpanded, setPokemonExpanded] = useState({});

  const toggleExpand = useCallback((id) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!detailCache[id]) {
      unifiedApi(`/abilities/${id}`).then((r) => {
        setDetailCache((prev) => ({ ...prev, [id]: r.data }));
      });
    }
  }, [expanded, detailCache]);

  const togglePokemonSection = useCallback((id) => {
    setPokemonExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (initialOffset === null || (loading && abilities.length === 0)) return <Loading />;

  return (
    <section className="ab-page">
      <div className="panel ab-panel">
        <div className="ab-header">
          <h2 className="panel-title">特性资料</h2>
          <span className="panel-subtitle">
            共收录 {total > 0 ? total : abilities.length} 个特性，按编号排序。点击展开查看详细效果与世代变更。
          </span>
        </div>


        {abilities.length === 0 && !loading && (
          <div className="ab-empty">没有找到匹配的特性。</div>
        )}

        {hasPrev && (
          <div className="ab-load-more ab-load-prev" ref={topSentinelRef}>
            <div className="pulse-dot" />
          </div>
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
                      <div className="shared-detail-loading">
                        <div className="pulse-dot" />
                        <span>加载中…</span>
                      </div>
                    ) : (
                      <>
                        {/* 名称标签 */}
                        <div className="ab-detail-names">
                          {detail.nameJa && <span className="shared-name-tag shared-name-ja">{detail.nameJa}</span>}
                          {detail.nameEn && <span className="shared-name-tag shared-name-en">{detail.nameEn}</span>}
                          {detail.introducedGeneration && (
                            <span className="shared-name-tag shared-name-gen">第 {detail.introducedGeneration} 世代引入</span>
                          )}
                          <WikiLink url={detail.source?.url} title={detail.source?.title || "Wiki"} />
                        </div>

                        {/* 详细效果 */}
                        <div className="shared-detail-effect">
                          <div className="shared-detail-effect-title">特性效果</div>
                          <div className="shared-detail-effect-text">
                            {detail.effectDetail || detail.description || "暂无详细说明"}
                          </div>
                        </div>

                        {/* 世代变更 */}
                        <GenerationTimeline generations={detail.generations} />

                        {/* 拥有该特性的宝可梦 */}
                        <div className="shared-pokemon-section">
                          <button
                            className={`shared-pokemon-toggle${pokemonExpanded[key] ? " shared-pokemon-toggle-open" : ""}`}
                            onClick={() => togglePokemonSection(key)}
                          >
                            <span className="shared-pokemon-section-title">拥有该特性的宝可梦</span>
                            <span className={`shared-pokemon-toggle-arrow${pokemonExpanded[key] ? " shared-pokemon-toggle-arrow-open" : ""}`}>▾</span>
                          </button>
                          {pokemonExpanded[key] && (
                            <div className="shared-pokemon-content">
                              <PokemonGrid
                                apiPath={`/abilities/${key}/pokemon`}
                                emptyText="暂无拥有该特性的宝可梦数据"
                                labelFn={(p) => p.isHidden ? "隐藏特性" : null}
                              />
                            </div>
                          )}
                        </div>

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
          <div className="ab-load-more" ref={sentinelRef}>
            <div className="pulse-dot" />
          </div>
        )}
      </div>
    </section>
  );
}
