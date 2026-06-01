import { useState, useCallback, useMemo } from "react";
import { unifiedApi } from "../utils/api.js";
import { useApi } from "../hooks/useApi.js";
import Loading from "../components/Loading.jsx";
import GenerationTimeline from "../components/GenerationTimeline.jsx";
import WikiLink from "../components/WikiLink.jsx";
import {
  FIELD_EFFECT_KIND_LABELS,
  FIELD_EFFECT_SOURCE_TYPE_LABELS,
  FIELD_EFFECT_TRIGGER_METHOD_LABELS,
  EFFECT_TYPE_LABELS,
  TRIGGER_LABELS,
  TARGET_LABELS,
  MODIFIER_TYPE_LABELS,
  BATTLE_STAT_LABELS,
} from "@pokemon-localdex/store-types/battle-effects";

const KIND_ALL = 0;
const KIND_OPTIONS = [
  { id: KIND_ALL, label: "全部" },
  { id: 1, label: "天气" },
  { id: 2, label: "场地" },
  { id: 3, label: "异常状态" },
  { id: 4, label: "场侧效果" },
  { id: 5, label: "全场效果" },
];

export default function FieldEffectsPage() {
  const [activeKind, setActiveKind] = useState(KIND_ALL);
  const [expanded, setExpanded] = useState(null);
  const [detailCache, setDetailCache] = useState({});

  // 加载列表数据（useApi 接受路径字符串）
  const { data: allEffects, loading } = useApi("/field-effects");

  // 按分类筛选
  const filteredEffects = useMemo(() => {
    if (!allEffects) return [];
    if (activeKind === KIND_ALL) return allEffects;
    return allEffects.filter((e) => e.kind === activeKind);
  }, [allEffects, activeKind]);

  // 计算每种分类的数量
  const kindCounts = useMemo(() => {
    if (!allEffects) return {};
    const counts = {};
    for (const e of allEffects) {
      counts[e.kind] = (counts[e.kind] || 0) + 1;
    }
    counts[KIND_ALL] = allEffects.length;
    return counts;
  }, [allEffects]);

  const toggleExpand = useCallback((id) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!detailCache[id]) {
      unifiedApi(`/field-effects/${id}`).then((r) => {
        setDetailCache((prev) => ({ ...prev, [id]: r.data }));
      });
    }
  }, [expanded, detailCache]);

  if (loading) return <Loading />;

  return (
    <section className="fe-page">
      <div className="panel fe-panel">
        <div className="fe-header">
          <h2 className="panel-title">场地效果</h2>
          <span className="panel-subtitle">
            天气、场地、异常状态、场侧和全场效果一览。点击展开查看触发来源与对战修正。
          </span>
        </div>

        {/* Kind tabs */}
        <div className="fe-tabs">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`fe-tab${activeKind === opt.id ? " fe-tab-active" : ""}`}
              onClick={() => setActiveKind(opt.id)}
            >
              {opt.label}
              {kindCounts[opt.id] != null && (
                <span className="fe-tab-count">({kindCounts[opt.id]})</span>
              )}
            </button>
          ))}
        </div>

        {/* Effect list */}
        {filteredEffects.length === 0 && !loading && (
          <div className="fe-empty">没有找到匹配的场地效果。</div>
        )}

        <div className="fe-list">
          {filteredEffects.map((effect) => {
            const isExpanded = expanded === effect.id;
            const detail = detailCache[effect.id];
            return (
              <div key={effect.id} className={`fe-row${isExpanded ? " fe-row-expanded" : ""}`}>
                <button className="fe-row-header" onClick={() => toggleExpand(effect.id)}>
                  <span className="fe-row-kind-badge" data-kind={effect.kind}>
                    {FIELD_EFFECT_KIND_LABELS[effect.kind] || "未知"}
                  </span>
                  <span className="fe-row-name">{effect.nameZh}</span>
                  {effect.nameEn && <span className="fe-row-name-en">{effect.nameEn}</span>}
                  <span className="fe-row-desc">{effect.description || ""}</span>
                  <span className="fe-row-meta">
                    {effect.maxTurns && <span className="fe-row-meta-tag">{effect.maxTurns}回合</span>}
                    {effect.maxLayers && <span className="fe-row-meta-tag">最多{effect.maxLayers}层</span>}
                  </span>
                  <span className={`fe-row-arrow${isExpanded ? " fe-row-arrow-open" : ""}`}>▾</span>
                </button>

                {isExpanded && (
                  <div className="fe-row-detail">
                    {!detail ? (
                      <div className="fe-loading-detail">
                        <div className="pulse-dot" />
                        <span>加载中…</span>
                      </div>
                    ) : (
                      <>
                        {/* 名称标签 */}
                        <div className="fe-detail-names">
                          {detail.nameJa && <span className="shared-name-tag shared-name-ja">{detail.nameJa}</span>}
                          {detail.nameEn && <span className="shared-name-tag shared-name-en">{detail.nameEn}</span>}
                          {detail.introducedGeneration && (
                            <span className="shared-name-tag shared-name-gen">第 {detail.introducedGeneration} 世代引入</span>
                          )}
                          <WikiLink url={detail.source?.url} title={detail.source?.title || "Wiki"} />
                        </div>

                        {/* 描述 */}
                        {detail.description && (
                          <div className="fe-detail-section">
                            <div className="fe-detail-section-title">效果说明</div>
                            <div className="fe-detail-description">{detail.description}</div>
                          </div>
                        )}

                        {/* 来源关联 */}
                        {detail.sources && detail.sources.length > 0 && (
                          <div className="fe-detail-section">
                            <div className="fe-detail-section-title">触发来源</div>
                            <div className="fe-sources-list">
                              {detail.sources.map((src) => (
                                <div key={src.id} className="fe-source-item">
                                  <span className="fe-source-type-badge" data-type={src.sourceType}>
                                    {FIELD_EFFECT_SOURCE_TYPE_LABELS[src.sourceType] || "未知"}
                                  </span>
                                  <span className="fe-source-name">{src.sourceName || `#${src.sourceId}`}</span>
                                  <span className="fe-source-trigger">
                                    {FIELD_EFFECT_TRIGGER_METHOD_LABELS[src.triggerMethod] || ""}
                                  </span>
                                  {src.probability != null && src.probability < 1 && (
                                    <span className="fe-source-note">{Math.round(src.probability * 100)}%</span>
                                  )}
                                  {src.note && <span className="fe-source-note">{src.note}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 对战修正 */}
                        {detail.modifiers && detail.modifiers.length > 0 && (
                          <div className="fe-detail-section">
                            <div className="fe-detail-section-title">对战修正</div>
                            <table className="fe-modifiers-table">
                              <thead>
                                <tr>
                                  <th>效果类型</th>
                                  <th>触发条件</th>
                                  <th>目标</th>
                                  <th>修正方式</th>
                                  <th>数值</th>
                                  <th>备注</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.modifiers.map((mod) => (
                                  <tr key={mod.id}>
                                    <td>{EFFECT_TYPE_LABELS[mod.effectType] || mod.effectType}</td>
                                    <td>{TRIGGER_LABELS[mod.trigger] || mod.trigger}</td>
                                    <td>{TARGET_LABELS[mod.target] || mod.target}</td>
                                    <td>
                                      {MODIFIER_TYPE_LABELS[mod.modifierType] || mod.modifierType}
                                      {mod.affectedStat != null && ` (${BATTLE_STAT_LABELS[mod.affectedStat] || mod.affectedStat})`}
                                    </td>
                                    <td>{mod.modifierValue != null ? mod.modifierValue : "—"}</td>
                                    <td>{mod.note || ""}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* 世代变更 */}
                        <GenerationTimeline generations={detail.generations} />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
