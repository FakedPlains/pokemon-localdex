import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LEARN_METHOD_LABELS } from "@pokemon-localdex/store-types/constants";
import { describeLearnsetEntry } from "../../utils/helpers.js";
import { unifiedApi } from "../../utils/api.js";
import TypeChip from "../TypeChip.jsx";

const PAGE_SIZE = 50;

/* ─── Moves Tab（瀑布流分页 + 服务端方法筛选） ─── */
export default function MovesTab({ detail, display, detailGeneration, onDetailGenerationChange, learnsetMeta, externalFormKey }) {
  const pokemonId = detail.id;

  // 累积的所有已加载数据
  const [allMoves, setAllMoves] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [learnsetFormKey, setLearnsetFormKey] = useState(null);
  const [methodFilter, setMethodFilter] = useState("");
  const [selectedVersionRaw, setSelectedVersion] = useState(null);
  const [versionGenRef, setVersionGenRef] = useState(null);
  // 服务端返回的全量方法计数（精确到当前 form+gen+version）
  const [methodCounts, setMethodCounts] = useState({});

  const offsetRef = useRef(0);
  const sentinelRef = useRef(null);
  // 服务端首次返回的实际 formKey（可能经过 fallback），用 ref 避免驱动 fetchPage 重建
  const resolvedFormKeyRef = useRef(null);
  // 竞态保护：递增 requestId，回调中检查是否过时
  const requestIdRef = useRef(0);
  // 检测 pokemonId 变化，统一在初始加载 effect 中重置筛选器
  const prevPokemonIdRef = useRef(pokemonId);

  const learnsetGenOptions = learnsetMeta?.generations || [];
  const learnsetFormKeys = learnsetMeta?.formKeys || [];
  const versionsByGen = learnsetMeta?.versionsByGen || {};

  // 当前选中的世代
  const activeGen = useMemo(() => {
    const requested = Number(detailGeneration || 0);
    if (requested && learnsetGenOptions.includes(requested)) return requested;
    if (learnsetGenOptions.length === 0) return null;
    const normalGens = learnsetGenOptions.filter(g => g !== 99);
    return normalGens.length > 0 ? normalGens[normalGens.length - 1] : learnsetGenOptions[learnsetGenOptions.length - 1];
  }, [detailGeneration, learnsetGenOptions]);

  // 当前世代下可用的游戏版本
  const availableVersions = useMemo(() => {
    if (!activeGen) return [];
    return versionsByGen[activeGen] || [];
  }, [activeGen, versionsByGen]);

  const selectedVersion = useMemo(() => {
    if (versionGenRef === activeGen && selectedVersionRaw !== null) {
      if (availableVersions.some((v) => v.code === selectedVersionRaw)) return selectedVersionRaw;
    }
    return availableVersions.length > 0 ? availableVersions[0].code : null;
  }, [activeGen, versionGenRef, selectedVersionRaw, availableVersions]);

  // 当前选中的形态
  const activeFormKey = useMemo(() => {
    if (externalFormKey && learnsetFormKeys.includes(externalFormKey)) return externalFormKey;
    const displayFormKey = display.form?.formKey || "default";
    if (learnsetFormKeys.includes(displayFormKey)) return displayFormKey;
    const displayName = display.form?.nameZh;
    if (displayName && learnsetFormKeys.includes(displayName)) return displayName;
    if (learnsetFormKeys.includes("default")) return "default";
    return learnsetFormKeys[0] || "default";
  }, [externalFormKey, display.form, learnsetFormKeys]);

  // 获取一页数据（method 筛选由服务端处理）
  // 返回 false 表示被竞态丢弃，调用方据此决定是否更新 loading 状态
  const fetchPage = useCallback(async (offset, isInitial, method) => {
    if (!activeGen) return false;
    const rid = ++requestIdRef.current;
    // 追加请求使用首次请求服务端返回的实际 formKey（可能是 fallback 后的），
    // 初始请求仍用 activeFormKey 让服务端做 fallback。
    // 读 ref 而非 state，避免 learnsetFormKey 变化驱动 fetchPage/effect 重建。
    const formToSend = (!isInitial && resolvedFormKeyRef.current) ? resolvedFormKeyRef.current : activeFormKey;
    const params = new URLSearchParams({
      generation: String(activeGen),
      form: formToSend,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (selectedVersion !== null) {
      params.set("version", selectedVersion);
    }
    if (method) {
      params.set("method", method);
    }
    try {
      const r = await unifiedApi(`/pokemon/${pokemonId}/learnset?${params}`);
      // 竞态保护：如果已经有更新的请求发出，丢弃本次结果
      if (rid !== requestIdRef.current) return false;
      const moves = r.data || [];
      const more = r.hasMore ?? false;
      const fk = r.formKey || activeFormKey;

      if (isInitial) {
        setAllMoves(moves);
        resolvedFormKeyRef.current = fk;
        setLearnsetFormKey(fk);
        // methodCounts 来自服务端，是当前 form+gen+version 的全量计数（不受 method 筛选影响）
        if (r.methodCounts) setMethodCounts(r.methodCounts);
      } else {
        setAllMoves((prev) => [...prev, ...moves]);
      }
      setHasMore(more);
      offsetRef.current = offset + moves.length;
      return true;
    } catch {
      if (rid !== requestIdRef.current) return false;
      if (isInitial) { setAllMoves([]); setMethodCounts({}); }
      setHasMore(false);
      return true;
    }
  }, [pokemonId, activeGen, activeFormKey, selectedVersion]);

  // 初始加载（世代/形态/版本/宝可梦变化时重置）
  // 宝可梦切换的筛选器重置也在此处完成，避免两个 effect 之间的时序问题。
  useEffect(() => {
    // 宝可梦切换时：同步重置筛选器，确保首次请求不带旧 methodFilter
    const pokemonChanged = prevPokemonIdRef.current !== pokemonId;
    if (pokemonChanged) {
      prevPokemonIdRef.current = pokemonId;
      setMethodFilter("");
      setSelectedVersion(null);
      setVersionGenRef(null);
      setLearnsetFormKey(null);
      resolvedFormKeyRef.current = null;
    }
    if (!activeGen) { setAllMoves([]); setHasMore(false); setMethodCounts({}); return; }
    setInitialLoading(true);
    offsetRef.current = 0;
    // pokemonChanged 时强制使用空 methodFilter，否则沿用当前值
    const method = pokemonChanged ? "" : methodFilter;
    fetchPage(0, true, method).then((accepted) => {
      // 竞态保护：被丢弃的请求不应关闭 loading，新请求开头已设置了 loading=true
      if (accepted !== false) setInitialLoading(false);
    });
  }, [fetchPage, activeGen]); // fetchPage 已包含 pokemonId/gen/form/version 依赖

  // 方法筛选变化时重置分页并重新请求
  const handleMethodChange = useCallback((method) => {
    const newMethod = method === methodFilter ? "" : method;
    setMethodFilter(newMethod);
    setAllMoves([]);
    setHasMore(false);
    setInitialLoading(true);
    offsetRef.current = 0;
    fetchPage(0, true, newMethod).then((accepted) => {
      if (accepted !== false) setInitialLoading(false);
    });
  }, [fetchPage, methodFilter]);

  // 加载更多
  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPage(offsetRef.current, false, methodFilter).then((accepted) => {
      if (accepted !== false) setLoadingMore(false);
    });
  }, [fetchPage, loadingMore, hasMore, methodFilter]);

  // IntersectionObserver 自动加载更多
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore && !initialLoading) {
          handleLoadMore();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, initialLoading, handleLoadMore]);

  const totalCount = Object.values(methodCounts).reduce((s, c) => s + c, 0);

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

      {/* Game version pills */}
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

      {/* Method filter pills — 使用服务端全量计数 */}
      {Object.keys(methodCounts).length > 1 && (
        <div className="mv-method-strip">
          <button
            className={`mv-method-pill ${!methodFilter ? "mv-method-pill-active" : ""}`}
            onClick={() => handleMethodChange("")}
          >
            全部 ({totalCount})
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
                onClick={() => handleMethodChange(method)}
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
        {initialLoading && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.6)", zIndex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 32 }}>
            <div className="dex-drawer-loading">
              <div className="pulse-dot" />
              <span>加载招式…</span>
            </div>
          </div>
        )}
        {allMoves.length === 0 && !initialLoading ? (
          <p className="muted">
            {methodFilter
              ? `没有通过「${LEARN_METHOD_LABELS[methodFilter] || methodFilter}」学习的招式。`
              : "当前世代还没有导入可学招式表。"}
          </p>
        ) : allMoves.length > 0 ? (
          <>
            <p className="muted" style={{ margin: "0 0 8px" }}>
              共 {methodFilter ? methodCounts[methodFilter] || allMoves.length : totalCount} 条记录
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
              {allMoves.map((entry, i) => {
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

            {/* 瀑布流加载触发器 */}
            <div ref={sentinelRef} style={{ height: 1 }} />
            {loadingMore && (
              <div className="dex-drawer-loading" style={{ padding: "12px 0" }}>
                <div className="pulse-dot" />
                <span>加载更多招式…</span>
              </div>
            )}
            {hasMore && !loadingMore && (
              <button
                className="mv-load-more-btn"
                onClick={handleLoadMore}
              >
                加载更多
              </button>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
