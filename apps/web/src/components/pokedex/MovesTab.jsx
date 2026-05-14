import { useEffect, useMemo, useState } from "react";
import { LEARN_METHOD_LABELS } from "@pokemon-localdex/store-types/constants";
import { describeLearnsetEntry } from "../../utils/helpers.js";
import { unifiedApi } from "../../utils/api.js";
import TypeChip from "../TypeChip.jsx";

/* ─── Moves Tab ─── */
export default function MovesTab({ detail, display, detailGeneration, onDetailGenerationChange, learnsetMeta, externalFormKey }) {
  const [learnsetData, setLearnsetData] = useState([]);
  const [learnsetLoading, setLearnsetLoading] = useState(false);
  const [learnsetFormKey, setLearnsetFormKey] = useState(null);
  const [methodFilter, setMethodFilter] = useState("");
  const [selectedVersionRaw, setSelectedVersion] = useState(null); // null = 未手动选择
  const [versionGenRef, setVersionGenRef] = useState(null); // 记录 selectedVersion 对应的世代

  const pokemonId = detail.id;

  const learnsetGenOptions = learnsetMeta?.generations || [];
  const learnsetFormKeys = learnsetMeta?.formKeys || [];
  const versionsByGen = learnsetMeta?.versionsByGen || {};

  // 当前选中的世代：优先用 detailGeneration，否则取 learnset 可用世代中最大的
  const activeGen = useMemo(() => {
    const requested = Number(detailGeneration || 0);
    if (requested && learnsetGenOptions.includes(requested)) return requested;
    return learnsetGenOptions.length > 0 ? learnsetGenOptions[learnsetGenOptions.length - 1] : null;
  }, [detailGeneration, learnsetGenOptions]);

  // 当前世代下可用的游戏版本
  const availableVersions = useMemo(() => {
    if (!activeGen) return [];
    return versionsByGen[activeGen] || [];
  }, [activeGen, versionsByGen]);

  // 同步派生 selectedVersion：世代切换时自动选中第一个版本，同一世代内保留用户选择
  const selectedVersion = useMemo(() => {
    if (versionGenRef === activeGen && selectedVersionRaw !== null) {
      // 确认用户选择的版本在当前世代仍然有效
      if (availableVersions.some((v) => v.code === selectedVersionRaw)) return selectedVersionRaw;
    }
    return availableVersions.length > 0 ? availableVersions[0].code : null;
  }, [activeGen, versionGenRef, selectedVersionRaw, availableVersions]);

  // 当前选中的形态：优先使用外部传入的 formKey
  const activeFormKey = useMemo(() => {
    if (externalFormKey && learnsetFormKeys.includes(externalFormKey)) return externalFormKey;
    // fallback: 尝试用 display.form.formKey 匹配
    const displayFormKey = display.form?.formKey || "default";
    if (learnsetFormKeys.includes(displayFormKey)) return displayFormKey;
    const displayName = display.form?.nameZh;
    if (displayName && learnsetFormKeys.includes(displayName)) return displayName;
    if (learnsetFormKeys.includes("default")) return "default";
    return learnsetFormKeys[0] || "default";
  }, [externalFormKey, display.form, learnsetFormKeys]);

  // 加载 learnset 数据
  useEffect(() => {
    if (!activeGen) { setLearnsetData([]); return; }
    let cancelled = false;
    setLearnsetLoading(true);
    const params = new URLSearchParams({ generation: String(activeGen), form: activeFormKey });
    if (selectedVersion !== null) {
      params.set("version", selectedVersion);
    }
    unifiedApi(`/pokemon/${pokemonId}/learnset?${params}`).then((r) => {
      if (!cancelled) {
        setLearnsetData(r.data || []);
        setLearnsetFormKey(r.formKey || activeFormKey);
        setLearnsetLoading(false);
      }
    }).catch(() => {
      if (!cancelled) { setLearnsetData([]); setLearnsetLoading(false); }
    });
    return () => { cancelled = true; };
  }, [pokemonId, activeGen, activeFormKey, selectedVersion]);

  // 重置筛选器
  useEffect(() => { setMethodFilter(""); setSelectedVersion(null); setVersionGenRef(null); }, [pokemonId]);

  // 按学习方式分组统计
  const methodCounts = useMemo(() => {
    const counts = {};
    for (const entry of learnsetData) {
      const m = entry.learnMethod || "other";
      counts[m] = (counts[m] || 0) + 1;
    }
    return counts;
  }, [learnsetData]);

  // 排序后的招式列表
  const sortedEntries = useMemo(() => {
    const methodOrder = { "level-up": 1, evolution: 2, "pre-evolution": 3, "form-change": 4, tm: 5, hm: 6, tutor: 7, egg: 8, event: 9, other: 10 };
    let filtered = learnsetData;
    if (methodFilter) {
      filtered = learnsetData.filter((e) => e.learnMethod === methodFilter);
    }
    return [...filtered].sort((a, b) => {
      const am = methodOrder[a.learnMethod] || 99;
      const bm = methodOrder[b.learnMethod] || 99;
      if (am !== bm) return am - bm;
      const al = a.level ?? 999;
      const bl = b.level ?? 999;
      if (al !== bl) return al - bl;
      return String(a.moveNameZh || "").localeCompare(String(b.moveNameZh || ""), "zh-Hans-CN");
    });
  }, [learnsetData, methodFilter]);

  const isFallback = learnsetFormKey && learnsetFormKey !== activeFormKey;

  return (
    <div className="tab-moves">
      {/* Generation pills */}
      <div className="mv-gen-strip">
        {learnsetGenOptions.map((gen) => {
          const isActive = gen === activeGen;
          return (
            <button
              key={gen}
              className={`mv-gen-pill ${isActive ? "mv-gen-pill-active" : ""}`}
              onClick={() => onDetailGenerationChange(String(gen))}
            >
              {gen === 99 ? "Champions" : `第 ${gen} 世代`}
            </button>
          );
        })}
        {learnsetMeta && learnsetGenOptions.length === 0 && <span className="muted">暂无招式数据</span>}
        {!learnsetMeta && <span className="muted">加载中…</span>}
      </div>

      {/* Game version pills — 只有一个版本时不显示 */}
      {availableVersions.length > 1 && (
        <div className="mv-version-strip">
          {availableVersions.map((v) => (
            <button
              key={v.code}
              className={`mv-version-pill ${selectedVersion === v.code ? "mv-version-pill-active" : ""}`}
              onClick={() => { setVersionGenRef(activeGen); setSelectedVersion(selectedVersion === v.code ? null : v.code); }}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}

      {/* Method filter pills */}
      {sortedEntries.length > 0 && Object.keys(methodCounts).length > 1 && (
        <div className="mv-method-strip">
          <button
            className={`mv-method-pill ${!methodFilter ? "mv-method-pill-active" : ""}`}
            onClick={() => setMethodFilter("")}
          >
            全部 ({learnsetData.length})
          </button>
          {Object.entries(methodCounts)
            .sort(([a], [b]) => {
              const order = { "level-up": 1, evolution: 2, "pre-evolution": 3, "form-change": 4, tm: 5, hm: 6, tutor: 7, egg: 8, event: 9 };
              return (order[a] || 99) - (order[b] || 99);
            })
            .map(([method, count]) => (
              <button
                key={method}
                className={`mv-method-pill ${methodFilter === method ? "mv-method-pill-active" : ""}`}
                onClick={() => setMethodFilter(method)}
              >
                {LEARN_METHOD_LABELS[method] || method} ({count})
              </button>
            ))}
        </div>
      )}

      {/* Fallback hint */}
      {isFallback && (
        <p className="muted" style={{ margin: "0 0 8px", fontStyle: "italic" }}>
          当前形态无独立招式数据，显示的是默认形态的招式表。
        </p>
      )}

      <div style={{ position: "relative" }}>
        {learnsetLoading && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.6)", zIndex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 32 }}>
            <div className="dex-drawer-loading">
              <div className="pulse-dot" />
              <span>加载招式…</span>
            </div>
          </div>
        )}
        {sortedEntries.length === 0 && !learnsetLoading ? (
          <p className="muted">当前世代还没有导入可学招式表。</p>
        ) : sortedEntries.length > 0 ? (
          <>
            <p className="muted" style={{ margin: "0 0 8px" }}>
              共 {sortedEntries.length} 条记录
              {methodFilter ? ` (${LEARN_METHOD_LABELS[methodFilter] || methodFilter})` : ""}
            </p>
            <div className="mv-table">
              <div className="mv-row mv-head">
                <span>招式</span>
                <span>学习方式</span>
                <span>属性</span>
                <span>分类</span>
                <span>威力</span>
                <span>命中</span>
                <span>PP</span>
              </div>
              {sortedEntries.map((entry, i) => {
                const learnText = describeLearnsetEntry(entry) || "—";
                return (
                  <div key={i} className="mv-row">
                    <span className="mv-move-name">
                      <a
                        className="drawer-move-link"
                        href={entry.moveId ? `#/moves?expand=${entry.moveId}` : "#/moves"}
                        title={entry.moveDescription || entry.moveNameZh}
                      >
                        {entry.moveNameZh || "未知"}
                        {entry.moveDescription && (
                          <span className="move-tooltip">{entry.moveDescription}</span>
                        )}
                      </a>
                    </span>
                    <span>{learnText}</span>
                    <span><TypeChip type={entry.moveType || ""} /></span>
                    <span>{entry.moveCategory || "—"}</span>
                    <span>{entry.movePower ?? "—"}</span>
                    <span>{entry.moveAccuracy != null ? `${entry.moveAccuracy}%` : "—"}</span>
                    <span>{entry.movePP ?? "—"}</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
