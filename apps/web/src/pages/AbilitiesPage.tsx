import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api } from "../utils/api";
import { useInfiniteApi } from "../hooks/useInfiniteApi";
import { parseExpandParam } from "../utils/helpers";
import type { BaseGenerationRecord } from "@pokemon-localdex/store-types";
import Loading from "../components/Loading";
import PokemonGrid from "../components/PokemonGrid";
import GenerationTimeline from "../components/GenerationTimeline";
import WikiLink from "../components/WikiLink";

export interface AbilitiesPageProps {
  query?: string;
  generation?: string;
}

type AbilityListItem = {
  id: string;
  number?: number;
  nameZh: string;
  nameEn?: string;
  description?: string;
};

type AbilityDetail = {
  id: string;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  description?: string;
  effectDetail?: string;
  introducedGeneration?: number;
  source?: { url?: string; title?: string };
  generations?: BaseGenerationRecord[];
};

export default function AbilitiesPage({ query = "", generation = "" }: AbilitiesPageProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, AbilityDetail>>({});
  const pendingExpandRef = useRef<string | null>(parseExpandParam());

  // 构建分页请求路径
  const abilitiesPath = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (generation) params.set("generation", generation);
    const qs = params.toString();
    return qs ? `/abilities?${qs}` : "/abilities";
  }, [query, generation]);

  const { data: abilities, total, loading, loadingMore, hasMore, sentinelRef, loadMore } = useInfiniteApi<AbilityListItem>(abilitiesPath, { pageSize: 50 });

  // Auto-expand ability from URL hash param (e.g. #/abilities?expand=123)
  useEffect(() => {
    const expandId = pendingExpandRef.current;
    if (!expandId || loading) return;
    if (abilities.length === 0 && !hasMore) {
      pendingExpandRef.current = null;
      return;
    }
    if (abilities.length === 0) return;

    const target = abilities.find((a) => a.id === expandId);
    if (target) {
      pendingExpandRef.current = null;
      const key = target.id;
      setExpanded(key);
      if (!detailCache[key]) {
        api<AbilityDetail>(`/abilities/${key}`).then((r) => {
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
  }, [abilities, loading, hasMore, loadingMore, loadMore]); // eslint-disable-line react-hooks/exhaustive-deps

  // 宝可梦区域展开状态（独立于特性详情的展开）
  const [pokemonExpanded, setPokemonExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = useCallback((id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!detailCache[id]) {
      api<AbilityDetail>(`/abilities/${id}`).then((r) => {
        setDetailCache((prev) => ({ ...prev, [id]: r.data }));
      });
    }
  }, [expanded, detailCache]);

  const togglePokemonSection = useCallback((id: string) => {
    setPokemonExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (loading && abilities.length === 0) return <Loading />;

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
                          <WikiLink url={detail.source?.url ?? ""} title={detail.source?.title ?? "Wiki"} />
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
                                labelFn={(p) => ("isHidden" in p && p.isHidden) ? "隐藏特性" : null}
                              />
                            </div>
                          )}
                        </div>

                        {/* 来源 */}
                        {detail.source?.url && (
                          <div className="shared-source">
                            <a href={detail.source.url} target="_blank" rel="noopener noreferrer">
                              来源：{detail.source.title ?? "52Poké Wiki"}
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
