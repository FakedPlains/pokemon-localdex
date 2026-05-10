import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { unifiedApi } from "../utils/api.js";
import { useInfiniteApi } from "../hooks/useInfiniteApi.js";
import Loading from "../components/Loading.jsx";

/* ── 属性颜色映射（用于行底色） ── */
const TYPE_BG_COLORS = {
  一般: "rgba(187,187,170,0.10)",
  火:   "rgba(255,68,34,0.10)",
  水:   "rgba(51,153,255,0.10)",
  电:   "rgba(255,204,51,0.10)",
  草:   "rgba(119,204,85,0.10)",
  冰:   "rgba(119,221,255,0.10)",
  格斗: "rgba(187,85,68,0.10)",
  毒:   "rgba(170,85,153,0.10)",
  地面: "rgba(221,187,85,0.10)",
  飞行: "rgba(102,153,255,0.10)",
  超能力:"rgba(255,85,153,0.10)",
  虫:   "rgba(170,187,34,0.10)",
  岩石: "rgba(187,170,102,0.10)",
  幽灵: "rgba(102,102,187,0.10)",
  龙:   "rgba(119,102,238,0.10)",
  恶:   "rgba(119,85,68,0.10)",
  钢:   "rgba(170,170,187,0.10)",
  妖精: "rgba(255,170,255,0.10)",
};

/* ── 分类颜色映射（参考 52Poké Wiki 配色） ── */
const CATEGORY_COLORS = {
  物理: { bg: "#FF4400", text: "#FFCC00" },
  特殊: { bg: "#2266CC", text: "#BBEEFF" },
  变化: { bg: "#999999", text: "#EEEEEE" },
};

/* ── 图标路径工具 ── */
function typeIconSrc(typeName) {
  return `${import.meta.env.BASE_URL}assets/type-icons/type-${typeName}@sm.png`;
}
function categoryIconSrc(category) {
  return `${import.meta.env.BASE_URL}assets/type-icons/category-${category}@sm.png`;
}

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

function parseExpandParam() {
  const hash = window.location.hash || "";
  const qIdx = hash.indexOf("?");
  if (qIdx < 0) return null;
  const params = new URLSearchParams(hash.slice(qIdx));
  return params.get("expand") || null;
}

/* ── 宝可梦网格组件 ── */
function PokemonGrid({ pokemon, emptyText = "暂无数据", labelFn }) {
  if (!pokemon || pokemon.length === 0) {
    return <div className="mv-pokemon-empty">{emptyText}</div>;
  }
  return (
    <div className="mv-pokemon-grid">
      {pokemon.map((p) => (
        <a
          key={p.id}
          className="mv-pokemon-card"
          href={`#/pokemon?id=${p.id}`}
          style={{ background: TYPE_BG_COLORS[p.primaryType] || "rgba(200,200,200,0.12)" }}
        >
          {p.image && <img className="mv-pokemon-card-img" src={p.image} alt={p.nameZh} loading="lazy" />}
          <span className="mv-pokemon-card-dex">#{String(p.dexNumber).padStart(4, "0")}</span>
          <span className="mv-pokemon-card-name">{p.nameZh}</span>
          <span className="mv-pokemon-card-types">
            {p.primaryType && <img className="mv-pokemon-card-type-icon" src={typeIconSrc(p.primaryType)} alt={p.primaryType} title={p.primaryType} />}
            {p.secondaryType && <img className="mv-pokemon-card-type-icon" src={typeIconSrc(p.secondaryType)} alt={p.secondaryType} title={p.secondaryType} />}
          </span>
          {labelFn && <span className="mv-pokemon-card-label">{labelFn(p)}</span>}
        </a>
      ))}
    </div>
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
  const [pokemonCache, setPokemonCache] = useState({});
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

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => (prev === id ? null : id));
    if (!pokemonCache[id]) {
      unifiedApi(`/moves/${id}/pokemon`).then((r) => {
        setPokemonCache((prev) => ({ ...prev, [id]: r.data }));
      });
    }
  }, [pokemonCache]);

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
                      {move.nameJa && <span className="mv-name-tag mv-name-ja">{move.nameJa}</span>}
                      {move.nameEn && <span className="mv-name-tag mv-name-en">{move.nameEn}</span>}
                      {move.introducedGeneration && (
                        <span className="mv-name-tag mv-name-gen">第 {move.introducedGeneration} 世代引入</span>
                      )}
                      {move.source?.url && (
                        <a href={move.source.url} target="_blank" rel="noopener noreferrer" className="mv-wiki-link" title={move.source.title || "Wiki"}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10" />
                            <path d="M9 2h5v5" /><path d="M14 2 7.5 8.5" />
                          </svg>
                        </a>
                      )}
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
                    <div className="mv-detail-effect">
                      <div className="mv-detail-effect-title">招式效果</div>
                      <div className="mv-detail-effect-text">
                        {move.effectDetail || move.description || "暂无详细说明"}
                      </div>
                    </div>

                    {/* 世代变更 */}
                    {move.generations?.length > 0 && (
                      <div className="mv-gen-section">
                        <div className="mv-gen-title">世代变更</div>
                        <div className="mv-gen-timeline">
                          {move.generations.map((record, i) => (
                            <div key={i} className={`mv-gen-item${record.versionExclusive ? ' mv-gen-exclusive' : ''}`}>
                              <div className="mv-gen-badges">
                                <div className="mv-gen-badge">
                                  {record.generation === 99 ? "Champions" : `Gen ${record.generation}`}
                                </div>
                                {(record.gameVersionName || record.gameVersionCode) && (
                                  <div className="mv-gen-version">{record.gameVersionName || record.gameVersionCode}</div>
                                )}
                                {record.versionExclusive && (
                                  <div className="mv-gen-exclusive-tag">仅限</div>
                                )}
                              </div>
                              <div className="mv-gen-text">{record.description}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 能学习该招式的宝可梦 */}
                    <div className="mv-pokemon-section">
                      <div className="mv-pokemon-section-title">能学习该招式的宝可梦</div>
                      {!pokemonCache[move.id] ? (
                        <div className="mv-detail-loading">
                          <div className="pulse-dot" />
                          <span>加载中…</span>
                        </div>
                      ) : (
                        <PokemonGrid
                          pokemon={pokemonCache[move.id]}
                          emptyText="暂无能学习该招式的宝可梦数据"
                          labelFn={(p) => formatLearnMethods(p.learnMethods)}
                        />
                      )}
                    </div>

                    {/* 来源 */}
                    {move.source?.url && (
                      <div className="mv-source">
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
