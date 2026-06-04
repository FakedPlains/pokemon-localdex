import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LEARN_METHOD_LABELS } from "@pokemon-localdex/store-types/constants";
import type { LearnsetRecord, LearnsetMeta } from "@pokemon-localdex/store-types";
import { describeLearnsetEntry } from "../../utils/helpers.js";
import { unifiedApi } from "../../utils/api.js";
import TypeChip from "../TypeChip.jsx";
import CustomSelect from "../CustomSelect.jsx";
import Loading from "../Loading.tsx";
import type { PokemonDetail, DisplayVariant } from "./types";

const PAGE_SIZE = 50;

// ─── Types ───

interface MovesTabProps {
  detail: PokemonDetail;
  display: DisplayVariant;
  detailGeneration: string | number | null;
  onDetailGenerationChange: (gen: string) => void;
  learnsetMeta: LearnsetMeta | null | undefined;
  externalFormId?: number | null;
}

interface LearnsetResponse {
  data?: LearnsetRecord[];
  hasMore?: boolean;
  effectiveFormId?: number;
  methodCounts?: Record<string, number>;
}

interface SelectOption {
  value: string;
  label: string;
}

/* ─── Moves Tab（瀑布流分页 + 服务端方法筛选） ─── */
export default function MovesTab({ detail, display, detailGeneration, onDetailGenerationChange, learnsetMeta, externalFormId }: MovesTabProps) {
  const pokemonId = detail.id;

  // 累积的所有已加载数据
  const [allMoves, setAllMoves] = useState<LearnsetRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [learnsetFormId, setLearnsetFormId] = useState<number | null>(null);
  const [methodFilter, setMethodFilter] = useState("");
  const [selectedVersionRaw, setSelectedVersion] = useState<string | null>(null);
  const [versionGenRef, setVersionGenRef] = useState<number | null>(null);
  // 服务端返回的全量方法计数（精确到当前 form+gen+version）
  const [methodCounts, setMethodCounts] = useState<Record<string, number>>({});
  // 招式搜索关键词
  const [moveSearch, setMoveSearch] = useState("");

  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // 服务端首次返回的实际 formId（可能经过 fallback），用 ref 避免驱动 fetchPage 重建
  const resolvedFormIdRef = useRef<number | null>(null);
  // 竞态保护：递增 requestId，回调中检查是否过时
  const requestIdRef = useRef(0);
  // 检测 pokemonId 变化，统一在初始加载 effect 中重置筛选器
  const prevPokemonIdRef = useRef(pokemonId);
  // 搜索防抖相关 refs（提前声明，供多处 effect 使用）
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchMountedRef = useRef(false);

  const learnsetGenOptions = learnsetMeta?.generations || [];
  const learnsetFormIds = useMemo(() => (learnsetMeta?.forms || []).map(f => f.formId), [learnsetMeta]);
  const versionsByGen = learnsetMeta?.versionsByGen || {};

  // 世代下拉选项
  const genSelectOptions = useMemo<SelectOption[]>(() => {
    return learnsetGenOptions.map((gen) => ({
      value: String(gen),
      label: gen === 99 ? "Champions" : `第 ${gen} 世代`,
    }));
  }, [learnsetGenOptions]);

  // 当前选中的世代
  const activeGen = useMemo<number | null>(() => {
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

  // 版本下拉选项
  const versionSelectOptions = useMemo<SelectOption[]>(() => {
    return availableVersions.map((v) => ({
      value: v.code,
      label: v.name,
    }));
  }, [availableVersions]);

  const selectedVersion = useMemo<string | null>(() => {
    if (versionGenRef === activeGen && selectedVersionRaw !== null) {
      if (availableVersions.some((v) => v.code === selectedVersionRaw)) return selectedVersionRaw;
    }
    return availableVersions.length > 0 ? availableVersions[0].code : null;
  }, [activeGen, versionGenRef, selectedVersionRaw, availableVersions]);

  // 当前选中的形态 formId（数字）
  const activeFormId = useMemo<number | null>(() => {
    if (externalFormId != null && learnsetFormIds.includes(externalFormId)) return externalFormId;
    // 从 detail forms 中找到当前形态对应的数据库 formId
    const detailForms = detail.forms || [];
    const currentFormKey = display.form?.formKey || "default";
    const matchedDetail = detailForms.find((f) => f.formKey === currentFormKey);
    if (matchedDetail?.id && learnsetFormIds.includes(matchedDetail.id)) return matchedDetail.id;
    // 默认形态
    const defaultMeta = (learnsetMeta?.forms || []).find((f) => f.isDefault);
    if (defaultMeta) return defaultMeta.formId;
    return learnsetFormIds[0] ?? null;
  }, [externalFormId, display.form, learnsetFormIds, detail.forms, learnsetMeta]);

  // 获取一页数据（method 筛选和 search 由服务端处理）
  // 返回 false 表示被竞态丢弃，调用方据此决定是否更新 loading 状态
  const fetchPage = useCallback(async (offset: number, isInitial: boolean, method: string, search?: string): Promise<boolean> => {
    if (!activeGen || activeFormId == null) return false;
    const rid = ++requestIdRef.current;
    // 追加请求使用首次请求服务端返回的实际 effectiveFormId（可能经过 fallback），
    // 初始请求仍用 activeFormId 让服务端做 fallback。
    const formIdToSend = (!isInitial && resolvedFormIdRef.current != null) ? resolvedFormIdRef.current : activeFormId;
    const params = new URLSearchParams({
      generation: String(activeGen),
      formId: String(formIdToSend),
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (selectedVersion !== null) {
      params.set("version", selectedVersion);
    }
    if (method) {
      params.set("method", method);
    }
    if (search) {
      params.set("search", search);
    }
    try {
      const r: LearnsetResponse = await unifiedApi(`/pokemon/${pokemonId}/learnset?${params}`);
      // 竞态保护：如果已经有更新的请求发出，丢弃本次结果
      if (rid !== requestIdRef.current) return false;
      const moves = r.data || [];
      const more = r.hasMore ?? false;
      const effectiveId = r.effectiveFormId ?? activeFormId;

      if (isInitial) {
        setAllMoves(moves);
        resolvedFormIdRef.current = effectiveId;
        setLearnsetFormId(effectiveId);
        // methodCounts 来自服务端，是当前 form+gen+version 的全量计数（不受 method/search 筛选影响）
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
  }, [pokemonId, activeGen, activeFormId, selectedVersion]);

  // 初始加载（世代/形态/版本/宝可梦变化时重置）
  // 切换世代/版本/形态/宝可梦时统一清空招式筛选，默认展示全部招式。
  useEffect(() => {
    const pokemonChanged = prevPokemonIdRef.current !== pokemonId;
    if (pokemonChanged) {
      prevPokemonIdRef.current = pokemonId;
      setSelectedVersion(null);
      setVersionGenRef(null);
      setLearnsetFormId(null);
      resolvedFormIdRef.current = null;
    }
    // 无论哪个维度变化，都重置招式筛选为"全部"
    setMethodFilter("");
    setMoveSearch("");
    // 重置搜索防抖标记，避免 setMoveSearch("") 触发多余的搜索请求
    searchMountedRef.current = false;
    // 重置加载更多状态，防止被竞态丢弃的旧请求导致 loadingMore 卡住
    setLoadingMore(false);
    if (!activeGen) { setAllMoves([]); setHasMore(false); setMethodCounts({}); setInitialLoading(false); return; }
    setInitialLoading(true);
    offsetRef.current = 0;
    // 记住本次请求的 requestId，用于在 .then() 中判断是否仍是最新请求
    const rid = requestIdRef.current + 1; // fetchPage 内部会设为这个值
    fetchPage(0, true, "", "").then((accepted) => {
      // accepted=true: 本次请求未过期，正常关闭 loading
      // accepted=false 且 rid 仍是最新: fetchPage 早退（activeGen/formId 无效），也要关闭
      if (accepted !== false || rid === requestIdRef.current) {
        setInitialLoading(false);
      }
      // accepted=false 且 rid 已过时: 说明更新请求已发出，由它负责关闭 loading
    });
  }, [fetchPage, activeGen]); // fetchPage 已包含 pokemonId/gen/form/version 依赖

  // 方法筛选变化时重置分页并重新请求
  const handleMethodChange = useCallback((method: string) => {
    const newMethod = method === methodFilter ? "" : method;
    setMethodFilter(newMethod);
    setMoveSearch("");
    searchMountedRef.current = false; // 避免 setMoveSearch("") 触发多余搜索请求
    setLoadingMore(false); // 防止竞态卡住
    setAllMoves([]);
    setHasMore(false);
    setInitialLoading(true);
    offsetRef.current = 0;
    const rid = requestIdRef.current + 1;
    fetchPage(0, true, newMethod, "").then((accepted) => {
      if (accepted !== false || rid === requestIdRef.current) {
        setInitialLoading(false);
      }
    });
  }, [fetchPage, methodFilter]);

  // 加载更多
  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPage(offsetRef.current, false, methodFilter, moveSearch || undefined).then((accepted) => {
      if (accepted !== false) setLoadingMore(false);
    });
  }, [fetchPage, loadingMore, hasMore, methodFilter, moveSearch]);

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

  const isFallback = learnsetFormId != null && learnsetFormId !== activeFormId;

  // 用 ref 持有最新的 fetchPage / methodFilter，避免搜索 effect 闭包过时
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;
  const methodFilterRef = useRef(methodFilter);
  methodFilterRef.current = methodFilter;

  // 搜索防抖：moveSearch 变化后延迟 300ms 发起服务端搜索
  useEffect(() => {
    if (!searchMountedRef.current) {
      searchMountedRef.current = true;
      return;
    }
    // 清除上一次的定时器
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    // 搜索词变化时延迟触发请求（空搜索词也需要触发以恢复全量数据）
    searchTimerRef.current = setTimeout(() => {
      setLoadingMore(false); // 防止竞态卡住
      setAllMoves([]);
      setHasMore(false);
      setInitialLoading(true);
      offsetRef.current = 0;
      const rid = requestIdRef.current + 1;
      fetchPageRef.current(0, true, methodFilterRef.current, moveSearch || undefined).then((accepted) => {
        if (accepted !== false || rid === requestIdRef.current) {
          setInitialLoading(false);
        }
      });
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [moveSearch]); // eslint-disable-line react-hooks/exhaustive-deps -- 仅搜索词变化时触发

  return (
    <div className="tab-moves">
      {/* Search + Generation & Version selectors — all in one row */}
      <div className="mv-toolbar-row">
        <div className="mv-search-wrap">
          <svg className="mv-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="mv-search-input"
            type="text"
            placeholder="搜索招式…"
            value={moveSearch}
            onChange={(e) => setMoveSearch(e.target.value)}
          />
          {moveSearch && (
            <button
              className="mv-search-clear"
              onClick={() => setMoveSearch("")}
              title="清除搜索"
            >
              ×
            </button>
          )}
        </div>

        {learnsetMeta && learnsetGenOptions.length > 0 ? (
          <div className="mv-select-group">
            <label className="mv-select-label">世代</label>
            <CustomSelect
              value={activeGen != null ? String(activeGen) : ""}
              options={genSelectOptions}
              placeholder="选择世代"
              onChange={(val: string) => onDetailGenerationChange(val)}
              className="mv-gen-select"
            />
          </div>
        ) : (
          <span className="muted">{learnsetMeta ? "暂无招式数据" : "加载中…"}</span>
        )}

        {availableVersions.length > 1 && (
          <div className="mv-select-group">
            <label className="mv-select-label">版本</label>
            <CustomSelect
              value={selectedVersion || ""}
              options={versionSelectOptions}
              placeholder="选择版本"
              onChange={(val: string) => { setVersionGenRef(activeGen); setSelectedVersion(val); }}
              className="mv-version-select"
            />
          </div>
        )}
      </div>

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
              const order: Record<string, number> = { "level-up": 1, evolution: 2, "pre-evolution": 3, "form-change": 4, tm: 5, hm: 6, tutor: 7, egg: 8, event: 9 };
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
          <span className="mv-method-count muted">
            {moveSearch
              ? `搜索到 ${allMoves.length} 条结果`
              : `共 ${methodFilter ? methodCounts[methodFilter] || allMoves.length : totalCount} 条招式${methodFilter ? ` (${LEARN_METHOD_LABELS[methodFilter] || methodFilter})` : ""}`}
          </span>
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
            <Loading variant="inline" text="加载招式…" />
          </div>
        )}
        {allMoves.length === 0 && !initialLoading ? (
          <p className="muted">
            {moveSearch
              ? `没有找到包含「${moveSearch}」的招式。`
              : methodFilter
                ? `没有通过「${LEARN_METHOD_LABELS[methodFilter] || methodFilter}」学习的招式。`
                : "当前世代还没有导入可学招式表。"}
          </p>
        ) : allMoves.length > 0 ? (
          <>
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
                // 如果是招式学习器/秘传学习器方式，附加编号显示
                const tmDisplay = (entry.learnMethod === "tm" || entry.learnMethod === "hm") && entry.tmNumber
                  ? entry.tmNumber
                  : null;
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
                    <span className="mv-learn-method-cell">
                      {learnText}
                      {tmDisplay && <span className="mv-tm-badge">{tmDisplay}</span>}
                    </span>
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
              <Loading variant="inline" text="加载更多招式…" style={{ padding: "12px 0" }} />
            )}
            {hasMore && !loadingMore && !moveSearch && (
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
