import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { unifiedApi } from "../utils/api";
import { useInfiniteApi } from "../hooks/useInfiniteApi";
import { TYPE_BG_COLORS, CATEGORY_COLORS } from "@pokemon-localdex/store-types/constants";
import { typeIconSrc, categoryIconSrc } from "../utils/iconPaths";
import { parseExpandParam } from "../utils/helpers";
import type { BaseGenerationRecord } from "@pokemon-localdex/store-types";
import Loading from "../components/Loading";
import PokemonGrid from "../components/PokemonGrid";
import GenerationTimeline from "../components/GenerationTimeline";
import WikiLink from "../components/WikiLink";

export interface MovesPageProps {
  query?: string;
  type?: string;
  category?: string;
  generation?: string;
}

type MoveListItem = {
  id: number;
  number?: number;
  nameZh: string;
  description?: string;
  type?: string;
  category?: string;
  power?: number | null;
  accuracy?: number | null;
  pp?: number | null;
};

type MoveDetail = {
  id: number;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  type?: string;
  category?: string;
  power?: number | null;
  accuracy?: number | null;
  pp?: number | null;
  description?: string;
  effectDetail?: string;
  introducedGeneration?: number;
  source?: { url?: string; title?: string };
  generations?: BaseGenerationRecord[];
};

type CategoryColorDef = { bg: string; text: string };

/* ── 属性 Chip（图标 + 文字合并） ── */
function TypeIconChip({ type }: { type: string }) {
  if (!type) return null;
  return (
    <span className={`type-chip type-${type} mv-icon-chip`}>
      <img className="mv-chip-icon" src={typeIconSrc(type)} alt="" />
      {type}
    </span>
  );
}

/* ── 分类 Chip（图标 + 文字合并） ── */
function CategoryChip({ category }: { category: string | undefined }) {
  if (!category) return <span>—</span>;
  const colors: CategoryColorDef = CATEGORY_COLORS[category] || { bg: "#999999", text: "#EEEEEE" };
  return (
    <span className="mv-cat-chip" style={{ background: colors.bg, color: colors.text }}>
      <img className="mv-chip-icon" src={categoryIconSrc(category)} alt="" />
      {category}
    </span>
  );
}

/* ── 学习方式翻译 ── */
const LEARN_METHOD_NAMES: Record<string, string> = {
  "升级": "升级",
  "招式机": "招式机",
  "遗传": "遗传",
  "教学": "教学",
  "level-up": "升级",
  "machine": "招式机",
  "egg": "遗传",
  "tutor": "教学",
};

function formatLearnMethods(methods: string[] | undefined): string | null {
  if (!methods || methods.length === 0) return null;
  return methods.map((m) => LEARN_METHOD_NAMES[m] || m).join("/");
}

export default function MovesPage({ query = "", type = "", category = "", generation = "" }: MovesPageProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [detailCache, setDetailCache] = useState<Record<number, MoveDetail>>({});
  const pendingExpandRef = useRef<string | null>(parseExpandParam());
  const detailRequestsRef = useRef<Set<number>>(new Set());

  // Reset expanded when filters change
  useEffect(() => { setExpanded(null); }, [query, type, category, generation]);

  // 构建分页请求路径（所有筛选条件都由服务端处理）
  const movesPath = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (type) params.set("type", type);
    if (category) params.set("category", category);
    if (generation) params.set("generation", generation);
    const qs = params.toString();
    return qs ? `/moves?${qs}` : "/moves";
  }, [query, type, category, generation]);

  const { data: moves, total: _total, loading, loadingMore, hasMore, sentinelRef, loadMore } = useInfiniteApi<MoveListItem>(movesPath, { pageSize: 50 });

  const loadMoveDetail = useCallback((id: number) => {
    if (detailCache[id] || detailRequestsRef.current.has(id)) return;
    detailRequestsRef.current.add(id);
    unifiedApi<MoveDetail>(`/moves/${id}`)
      .then((r) => {
        setDetailCache((prev) => ({ ...prev, [id]: r.data }));
      })
      .catch(() => {
        detailRequestsRef.current.delete(id);
      });
  }, [detailCache]);

  // Auto-expand move from URL hash param (e.g. #/moves?expand=123)
  useEffect(() => {
    const expandId = pendingExpandRef.current;
    if (!expandId || loading) return;
    if (moves.length === 0 && !hasMore) {
      pendingExpandRef.current = null;
      return;
    }
    if (moves.length === 0) return;

    const target = moves.find((m) => String(m.id) === expandId);
    if (target) {
      pendingExpandRef.current = null;
      setExpanded(target.id);
      loadMoveDetail(target.id);
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-move-id="${target.id}"]`);
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
  }, [moves, loading, hasMore, loadingMore, loadMore, loadMoveDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  // 宝可梦区域展开状态（独立于招式详情的展开）
  const [pokemonExpanded, setPokemonExpanded] = useState<Record<number, boolean>>({});

  const toggleExpand = useCallback((id: number) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    loadMoveDetail(id);
  }, [expanded, loadMoveDetail]);

  const togglePokemonSection = useCallback((id: number) => {
    setPokemonExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (loading && moves.length === 0) return <Loading />;

  return (
    <section className="mv-page">
      <div className="panel mv-panel">
        <div className="mv-header">
          <h2 className="panel-title">招式资料</h2>
          <span className="panel-subtitle">
            已加载 {moves.length} 个招式，按编号排序。点击展开查看详细效果与世代变更。
          </span>
        </div>


        {/* ── 表头 ── */}
        <div className="mv-list-head">
          <span className="mv-col-no">#</span>
          <span className="mv-col-name">招式名</span>
          <span className="mv-col-type">属性</span>
          <span className="mv-col-cat">分类</span>
          <span className="mv-col-pow">威力</span>
          <span className="mv-col-acc">命中</span>
          <span className="mv-col-pp">PP</span>
          <span className="mv-col-arrow" />
        </div>

        {moves.length === 0 && !loading && (
          <div className="mv-empty">没有找到匹配的招式。</div>
        )}

        <div className="mv-list">
          {moves.map((move) => {
            const isExpanded = expanded === move.id;
            const detail = detailCache[move.id];
            const rowBg = move.type ? TYPE_BG_COLORS[move.type] : undefined;
            return (
              <div
                key={move.id}
                data-move-id={move.id}
                className={`mv-row-item${isExpanded ? " mv-row-expanded" : ""}`}
                style={rowBg && !isExpanded ? { background: rowBg } : undefined}
              >
                <button
                  className="mv-row-header"
                  onClick={() => toggleExpand(move.id)}
                  style={rowBg && isExpanded ? { background: rowBg } : undefined}
                >
                  <span className="mv-row-left">
                    <span className="mv-row-number">
                      {move.number ? String(move.number).padStart(3, "0") : "—"}
                    </span>
                    <span className="mv-row-name">{move.nameZh}</span>
                  </span>
                  {move.description && (
                    <span className="mv-row-desc">{move.description}</span>
                  )}
                  <span className="mv-row-right">
                    <span className="mv-row-type">
                      {move.type ? <TypeIconChip type={move.type} /> : "—"}
                    </span>
                    <span className="mv-row-cat">
                      <CategoryChip category={move.category} />
                    </span>
                    <span className="mv-row-pow">{move.power ?? "—"}</span>
                    <span className="mv-row-acc">{move.accuracy != null ? `${move.accuracy}` : "—"}</span>
                    <span className="mv-row-pp">{move.pp ?? "—"}</span>
                    <span className={`mv-row-arrow${isExpanded ? " mv-row-arrow-open" : ""}`}>▾</span>
                  </span>
                </button>

                {isExpanded && (
                  <div className="mv-row-detail">
                    {!detail ? (
                      <div className="shared-detail-loading">
                        <div className="pulse-dot" />
                        <span>加载中…</span>
                      </div>
                    ) : (
                      <>
                        {/* 名称标签 */}
                        <div className="mv-detail-names">
                          {detail.nameJa && <span className="shared-name-tag shared-name-ja">{detail.nameJa}</span>}
                          {detail.nameEn && <span className="shared-name-tag shared-name-en">{detail.nameEn}</span>}
                          {detail.introducedGeneration && (
                            <span className="shared-name-tag shared-name-gen">第 {detail.introducedGeneration} 世代引入</span>
                          )}
                          <WikiLink url={detail.source?.url ?? ""} title={detail.source?.title ?? "Wiki"} />
                        </div>

                        {/* 基础数据 */}
                        <div className="mv-detail-stats-grid">
                          <div className="mv-detail-stat">
                            <span className="mv-detail-stat-label">属性</span>
                            <span className="mv-detail-stat-value">
                              {detail.type ? <TypeIconChip type={detail.type} /> : "—"}
                            </span>
                          </div>
                          <div className="mv-detail-stat">
                            <span className="mv-detail-stat-label">分类</span>
                            <span className="mv-detail-stat-value">
                              <CategoryChip category={detail.category} />
                            </span>
                          </div>
                          <div className="mv-detail-stat">
                            <span className="mv-detail-stat-label">威力</span>
                            <span className="mv-detail-stat-value">{detail.power ?? "—"}</span>
                          </div>
                          <div className="mv-detail-stat">
                            <span className="mv-detail-stat-label">命中</span>
                            <span className="mv-detail-stat-value">{detail.accuracy != null ? `${detail.accuracy}%` : "—"}</span>
                          </div>
                          <div className="mv-detail-stat">
                            <span className="mv-detail-stat-label">PP</span>
                            <span className="mv-detail-stat-value">{detail.pp ?? "—"}</span>
                          </div>
                        </div>

                        {/* 效果说明 */}
                        <div className="shared-detail-effect">
                          <div className="shared-detail-effect-title">招式效果</div>
                          <div className="shared-detail-effect-text">
                            {detail.effectDetail || detail.description || "暂无详细说明"}
                          </div>
                        </div>

                        {/* 世代变更 */}
                        <GenerationTimeline generations={detail.generations} />

                        {/* 能学习该招式的宝可梦 */}
                        <div className="shared-pokemon-section">
                          <button
                            className={`shared-pokemon-toggle${pokemonExpanded[move.id] ? " shared-pokemon-toggle-open" : ""}`}
                            onClick={() => togglePokemonSection(move.id)}
                          >
                            <span className="shared-pokemon-section-title">能学习该招式的宝可梦</span>
                            <span className={`shared-pokemon-toggle-arrow${pokemonExpanded[move.id] ? " shared-pokemon-toggle-arrow-open" : ""}`}>▾</span>
                          </button>
                          {pokemonExpanded[move.id] && (
                            <div className="shared-pokemon-content">
                              <PokemonGrid
                                apiPath={`/moves/${move.id}/pokemon`}
                                emptyText="暂无能学习该招式的宝可梦数据"
                                labelFn={(p) => formatLearnMethods("learnMethods" in p ? p.learnMethods as string[] : undefined)}
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
          <div className="mv-load-more" ref={sentinelRef}>
            <div className="pulse-dot" />
          </div>
        )}
      </div>
    </section>
  );
}
