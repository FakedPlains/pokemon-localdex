import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { unifiedApi } from "../utils/api.js";
import { useInfiniteApi } from "../hooks/useInfiniteApi.js";
import { TYPE_BG_COLORS, CATEGORY_COLORS } from "@pokemon-localdex/store-types/constants";
import { typeIconSrc, categoryIconSrc } from "../utils/iconPaths.js";
import { parseExpandParam } from "../utils/helpers.js";
import Loading from "../components/Loading.jsx";
import PokemonGrid from "../components/PokemonGrid.jsx";
import GenerationTimeline from "../components/GenerationTimeline.jsx";
import WikiLink from "../components/WikiLink.jsx";

/* ── 属性 Chip（图标 + 文字合并） ── */
function TypeIconChip({ type }) {
  if (!type) return null;
  return (
    <span className={`type-chip type-${type} mv-icon-chip`}>
      <img className="mv-chip-icon" src={typeIconSrc(type)} alt="" />
      {type}
    </span>
  );
}

/* ── 分类 Chip（图标 + 文字合并） ── */
function CategoryChip({ category }) {
  if (!category) return <span>—</span>;
  const colors = CATEGORY_COLORS[category] || { bg: "#999999", text: "#EEEEEE" };
  return (
    <span className="mv-cat-chip" style={{ background: colors.bg, color: colors.text }}>
      <img className="mv-chip-icon" src={categoryIconSrc(category)} alt="" />
      {category}
    </span>
  );
}

/* ── 学习方式翻译 ── */
const LEARN_METHOD_NAMES = {
  "升级": "升级",
  "招式机": "招式机",
  "遗传": "遗传",
  "教学": "教学",
  "level-up": "升级",
  "machine": "招式机",
  "egg": "遗传",
  "tutor": "教学",
};

function formatLearnMethods(methods) {
  if (!methods || methods.length === 0) return null;
  return methods.map((m) => LEARN_METHOD_NAMES[m] || m).join("/");
}

const PAGE_SIZE = 50;

export default function MovesPage({ query = "", type = "", category = "", generation = "" }) {
  const [expanded, setExpanded] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const detailRequestsRef = useRef(new Set());

  // 解析 URL 中的 expand 目标（如 #/moves?expand=123）
  const expandTargetRef = useRef(parseExpandParam());
  // 起始 offset：有 expand 目标时先通过 position 接口定位，再据此从列表中间开始加载
  const [initialOffset, setInitialOffset] = useState(null); // null = 尚未确定
  const didExpandRef = useRef(false); // 是否已完成首次定位展开

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

  // 先确定起始 offset：有 expand 目标 → 请求 position 接口；否则从 0 开始。
  useEffect(() => {
    const expandId = expandTargetRef.current;
    if (!expandId) {
      setInitialOffset(0);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (type) params.set("type", type);
    if (category) params.set("category", category);
    if (generation) params.set("generation", generation);
    const qs = params.toString();
    const url = `/moves/${expandId}/position${qs ? `?${qs}` : ""}`;
    unifiedApi(url)
      .then((r) => {
        if (cancelled) return;
        const pos = r?.data?.position ?? 0;
        // 让目标尽量落在加载页的中部偏上：往前多取约半页，对齐到 PAGE_SIZE 边界
        const start = Math.max(0, Math.floor((pos - Math.floor(PAGE_SIZE / 2)) / PAGE_SIZE) * PAGE_SIZE);
        setInitialOffset(start);
      })
      .catch(() => {
        if (cancelled) return;
        // position 查询失败（目标不在当前筛选结果中），退回从头加载
        expandTargetRef.current = null;
        setInitialOffset(0);
      });
    return () => { cancelled = true; };
  }, [query, type, category, generation]);

  const {
    data: moves,
    loading,
    hasMore,
    hasPrev,
    sentinelRef,
    topSentinelRef,
  } = useInfiniteApi(movesPath, { pageSize: PAGE_SIZE, initialOffset });

  const loadMoveDetail = useCallback((id) => {
    if (detailCache[id] || detailRequestsRef.current.has(id)) return;
    detailRequestsRef.current.add(id);
    unifiedApi(`/moves/${id}`)
      .then((r) => {
        setDetailCache((prev) => ({ ...prev, [id]: r.data }));
      })
      .catch(() => {
        detailRequestsRef.current.delete(id);
      });
  }, [detailCache]);

  // 首屏数据加载完成后，定位并展开 expand 目标（只执行一次）
  useEffect(() => {
    const expandId = expandTargetRef.current;
    if (!expandId || didExpandRef.current) return;
    if (loading || moves.length === 0) return;

    const target = moves.find((m) => String(m.id) === expandId);
    if (target) {
      didExpandRef.current = true;
      expandTargetRef.current = null;
      setExpanded(target.id);
      loadMoveDetail(target.id);
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-move-id="${target.id}"]`);
        if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
      });
      // 清理 URL 中的 expand 参数
      const hash = window.location.hash || "";
      const qIdx = hash.indexOf("?");
      if (qIdx >= 0) {
        window.history.replaceState(null, "", hash.slice(0, qIdx));
      }
    }
  }, [moves, loading, loadMoveDetail]);

  // 宝可梦区域展开状态（独立于招式详情的展开）
  const [pokemonExpanded, setPokemonExpanded] = useState({});

  const toggleExpand = useCallback((id) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    loadMoveDetail(id);
  }, [expanded, loadMoveDetail]);

  const togglePokemonSection = useCallback((id) => {
    setPokemonExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (initialOffset === null || (loading && moves.length === 0)) return <Loading />;

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

        {hasPrev && (
          <div className="mv-load-more mv-load-prev" ref={topSentinelRef}>
            <div className="pulse-dot" />
          </div>
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
                          <WikiLink url={detail.source?.url} title={detail.source?.title || "Wiki"} />
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
                                labelFn={(p) => formatLearnMethods(p.learnMethods)}
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
