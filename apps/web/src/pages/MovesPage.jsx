import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useInfiniteApi } from "../hooks/useInfiniteApi.js";
import { TYPE_BG_COLORS, CATEGORY_COLORS, typeIconSrc, categoryIconSrc } from "../utils/constants.js";
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

export default function MovesPage({ query = "", type = "", category = "", generation = "" }) {
  const [expanded, setExpanded] = useState(null);
  const pendingExpandRef = useRef(parseExpandParam());

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

  const { data: moves, total, loading, loadingMore, hasMore, sentinelRef, loadMore } = useInfiniteApi(movesPath, { pageSize: 50 });

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
  }, [moves, loading, hasMore, loadingMore, loadMore]); // eslint-disable-line react-hooks/exhaustive-deps

  // 宝可梦区域展开状态（独立于招式详情的展开）
  const [pokemonExpanded, setPokemonExpanded] = useState({});

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => (prev === id ? null : id));
  }, []);

  const togglePokemonSection = useCallback((id) => {
    setPokemonExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (loading && moves.length === 0) return <Loading />;

  return (
    <section className="mv-page">
      <div className="panel mv-panel">
        <div className="mv-header">
          <h2 className="panel-title">招式资料</h2>
          <span className="panel-subtitle">
            共收录 {total > 0 ? total : moves.length} 个招式，按编号排序。点击展开查看详细效果与世代变更。
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
                    {/* 名称标签 */}
                    <div className="mv-detail-names">
                      {move.nameJa && <span className="shared-name-tag shared-name-ja">{move.nameJa}</span>}
                      {move.nameEn && <span className="shared-name-tag shared-name-en">{move.nameEn}</span>}
                      {move.introducedGeneration && (
                        <span className="shared-name-tag shared-name-gen">第 {move.introducedGeneration} 世代引入</span>
                      )}
                      <WikiLink url={move.source?.url} title={move.source?.title || "Wiki"} />
                    </div>

                    {/* 基础数据 */}
                    <div className="mv-detail-stats-grid">
                      <div className="mv-detail-stat">
                        <span className="mv-detail-stat-label">属性</span>
                        <span className="mv-detail-stat-value">
                          {move.type ? <TypeIconChip type={move.type} /> : "—"}
                        </span>
                      </div>
                      <div className="mv-detail-stat">
                        <span className="mv-detail-stat-label">分类</span>
                        <span className="mv-detail-stat-value">
                          <CategoryChip category={move.category} />
                        </span>
                      </div>
                      <div className="mv-detail-stat">
                        <span className="mv-detail-stat-label">威力</span>
                        <span className="mv-detail-stat-value">{move.power ?? "—"}</span>
                      </div>
                      <div className="mv-detail-stat">
                        <span className="mv-detail-stat-label">命中</span>
                        <span className="mv-detail-stat-value">{move.accuracy != null ? `${move.accuracy}%` : "—"}</span>
                      </div>
                      <div className="mv-detail-stat">
                        <span className="mv-detail-stat-label">PP</span>
                        <span className="mv-detail-stat-value">{move.pp ?? "—"}</span>
                      </div>
                    </div>

                    {/* 效果说明 */}
                    <div className="shared-detail-effect">
                      <div className="shared-detail-effect-title">招式效果</div>
                      <div className="shared-detail-effect-text">
                        {move.effectDetail || move.description || "暂无详细说明"}
                      </div>
                    </div>

                    {/* 世代变更 */}
                    <GenerationTimeline generations={move.generations} />

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
                    {move.source?.url && (
                      <div className="shared-source">
                        <a href={move.source.url} target="_blank" rel="noopener noreferrer">
                          来源：{move.source.title || "52Poké Wiki"}
                        </a>
                      </div>
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
