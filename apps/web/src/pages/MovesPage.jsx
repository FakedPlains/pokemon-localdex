import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../utils/api.js";
import { useInfiniteApi } from "../hooks/useInfiniteApi.js";
import Loading from "../components/Loading.jsx";

/* ── 属性颜色映射（用于行底色） ── */
const TYPE_BG_COLORS = {
  一般: "rgba(138,138,127,0.10)",
  火:   "rgba(210,106,46,0.10)",
  水:   "rgba(59,132,197,0.10)",
  电:   "rgba(228,192,42,0.10)",
  草:   "rgba(138,166,90,0.10)",
  冰:   "rgba(110,190,201,0.10)",
  格斗: "rgba(180,71,63,0.10)",
  毒:   "rgba(139,94,167,0.10)",
  地面: "rgba(182,143,78,0.10)",
  飞行: "rgba(127,156,214,0.10)",
  超能力:"rgba(219,99,144,0.10)",
  虫:   "rgba(122,154,42,0.10)",
  岩石: "rgba(154,135,82,0.10)",
  幽灵: "rgba(107,91,149,0.10)",
  龙:   "rgba(76,98,212,0.10)",
  恶:   "rgba(90,75,67,0.10)",
  钢:   "rgba(123,141,161,0.10)",
  妖精: "rgba(217,141,184,0.10)",
};

/* ── 分类颜色映射（参考 52Poké Wiki 配色） ── */
const CATEGORY_COLORS = {
  物理: "#c92112",
  特殊: "#4f5870",
  变化: "#737373",
};

/* ── 图标路径工具 ── */
function typeIconSrc(typeName) {
  return `/assets/type-icons/type-${typeName}@sm.png`;
}
function categoryIconSrc(category) {
  return `/assets/type-icons/category-${category}@sm.png`;
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
  const bg = CATEGORY_COLORS[category] || "#737373";
  return (
    <span className="mv-cat-chip" style={{ background: bg }}>
      <img className="mv-chip-icon" src={categoryIconSrc(category)} alt="" />
      {category}
    </span>
  );
}

export default function MovesPage({ query = "", type = "", category = "", generation = "" }) {
  const [expanded, setExpanded] = useState(null);

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

  const { data: moves, total, loading, hasMore, sentinelRef, loadingMore } = useInfiniteApi(movesPath, { pageSize: 50 });

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => (prev === id ? null : id));
  }, []);

  if (loading && moves.length === 0) return <Loading />;

  return (
    <section className="mv-page">
      <div className="panel mv-panel">
        <div className="mv-header">
          <h2 className="panel-title">招式资料</h2>
          <p className="panel-subtitle">
            共收录 {total > 0 ? total : moves.length} 个招式，按编号排序。点击展开查看详细效果与世代变更。
          </p>
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

                    {/* 世代变更（过滤掉传说阿尔宙斯 LA） */}
                    {move.generations?.filter((r) => r.gameVersionCode !== "LA").length > 0 && (
                      <div className="mv-gen-section">
                        <div className="mv-gen-title">世代变更</div>
                        <div className="mv-gen-timeline">
                          {move.generations.filter((r) => r.gameVersionCode !== "LA").map((record, i) => (
                            <div key={i} className="mv-gen-item">
                              <div className="mv-gen-badges">
                                <div className="mv-gen-badge">
                                  {record.generation === 99 ? "Champions" : `Gen ${record.generation}`}
                                </div>
                                {record.gameVersionName && (
                                  <div className="mv-gen-version">{record.gameVersionName}</div>
                                )}
                              </div>
                              <div className="mv-gen-text">{record.description}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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
