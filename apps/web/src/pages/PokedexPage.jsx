import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../utils/api.js";
import { useInfiniteApi } from "../hooks/useInfiniteApi.js";
import { ALL_TYPE_OPTIONS, GENERATION_OPTIONS, STAT_KEYS } from "../utils/constants.js";
import {
  getPokemonPreviewImage,
  resolvePokemonDisplayVariant,
  describeLearnsetEntry
} from "../utils/helpers.js";
import { LEARN_METHOD_LABELS } from "../utils/constants.js";
import TypeChip from "../components/TypeChip.jsx";
import StatCalculator from "../components/StatCalculator.jsx";
import Loading from "../components/Loading.jsx";

/* ─── Main Page ─── */
export default function PokedexPage() {
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [generation, setGeneration] = useState("");
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailGeneration, setDetailGeneration] = useState("");

  const detailRef = useRef(null);
  const activeCardRef = useRef(null);
  const listContainerRef = useRef(null);
  const scrollTargetSlugRef = useRef(null);
  const composingRef = useRef(false);
  const debounceRef = useRef(null);

  // 构建分页请求路径
  const pokemonPath = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (type) params.set("type", type);
    if (generation) params.set("generation", generation);
    const qs = params.toString();
    return qs ? `/pokemon?${qs}` : "/pokemon";
  }, [query, type, generation]);

  const { data: list, total, loading, hasMore, sentinelRef, loadingMore } = useInfiniteApi(pokemonPath, { pageSize: 60 });

  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!composingRef.current) {
      debounceRef.current = setTimeout(() => setQuery(value), 300);
    }
  }, []);

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleCompositionEnd = useCallback((e) => {
    composingRef.current = false;
    const value = e.target.value;
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(value), 300);
  }, []);

  // Cleanup debounce timer
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // Close detail when filters change
  useEffect(() => { setSelectedSlug(null); setDetail(null); }, [query, type, generation]);

  // Fetch detail when a card is selected
  useEffect(() => {
    if (!selectedSlug) { setDetail(null); return; }
    let cancelled = false;
    setDetail(null);
    api(`/pokemon/${encodeURIComponent(selectedSlug)}`).then((r) => {
      if (!cancelled) {
        setDetail(r.data);
        setDetailGeneration("");
      }
    });
    return () => { cancelled = true; };
  }, [selectedSlug]);

  // ── Scroll positioning strategy ──
  // When OPENING detail: list switches to compact mode. We use index-based calculation
  // because useLayoutEffect fires before framer-motion layout animations complete,
  // so DOM measurements would return stale (grid-mode) positions.
  // When CLOSING detail: list switches back to grid mode. We must wait for the CSS/framer
  // transition (350ms) to finish, then use DOM measurement to find the card's final position.
  const COMPACT_ITEM_HEIGHT = 69;
  const COMPACT_GAP = 4;
  const COMPACT_PADDING = 8;
  const isClosingRef = useRef(false);
  const closingSlugRef = useRef(null);

  // OPEN: index-based instant positioning (fires before paint)
  useLayoutEffect(() => {
    if (isClosingRef.current) return;
    const slug = scrollTargetSlugRef.current;
    if (!slug || !selectedSlug) return;
    scrollTargetSlugRef.current = null;

    const container = listContainerRef.current;
    if (!container) return;

    const index = list.findIndex((m) => (m.slug || m.id) === slug);
    if (index < 0) return;

    // Position by index: in compact mode each item is COMPACT_ITEM_HEIGHT + COMPACT_GAP tall.
    const cardTop = COMPACT_PADDING + index * (COMPACT_ITEM_HEIGHT + COMPACT_GAP);
    // Center within the actually-visible portion of the container (not the full clientHeight,
    // since the container may extend below the viewport).
    const rect = container.getBoundingClientRect();
    const visibleTop = Math.max(rect.top, 0);
    const visibleBottom = Math.min(rect.bottom, window.innerHeight);
    const visibleHeight = Math.max(visibleBottom - visibleTop, 200);
    const visibleCenterOffset = (visibleTop - rect.top) + visibleHeight / 2;
    const targetScroll = cardTop - visibleCenterOffset + COMPACT_ITEM_HEIGHT / 2;
    container.scrollTo({ top: Math.max(0, targetScroll), behavior: "instant" });
  }, [selectedSlug, list]);

  // CLOSE: wait for layout transition to finish, then DOM-measure the card's position
  useEffect(() => {
    if (!isClosingRef.current) return;
    const slug = closingSlugRef.current;
    if (!slug) { isClosingRef.current = false; return; }
    closingSlugRef.current = null;

    const timer = setTimeout(() => {
      isClosingRef.current = false;
      const container = listContainerRef.current;
      const card = container?.querySelector(`[data-slug="${CSS.escape(slug)}"]`);
      if (!card || !container) return;

      // Use visible-area centering (same logic as open, but with actual DOM measurements)
      const cardRect = card.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const visibleTop = Math.max(containerRect.top, 0);
      const visibleBottom = Math.min(containerRect.bottom, window.innerHeight);
      const visibleHeight = Math.max(visibleBottom - visibleTop, 200);
      const visibleCenterViewport = visibleTop + visibleHeight / 2;
      const cardCenterViewport = cardRect.top + card.offsetHeight / 2;
      const scrollAdjust = cardCenterViewport - visibleCenterViewport;
      container.scrollTo({ top: Math.max(0, container.scrollTop + scrollAdjust), behavior: "instant" });
    }, 380);
    return () => { clearTimeout(timer); isClosingRef.current = false; };
  }, [selectedSlug]);

  // Scroll detail panel to top when detail changes
  useEffect(() => {
    if (detail && detailRef.current) {
      detailRef.current.scrollTop = 0;
    }
  }, [detail]);

  const handleSelect = useCallback((slug) => {
    setSelectedSlug((prev) => {
      const isToggleClose = prev === slug;
      if (isToggleClose) {
        isClosingRef.current = true;
        closingSlugRef.current = prev;
      } else {
        scrollTargetSlugRef.current = slug;
      }
      return isToggleClose ? null : slug;
    });
  }, []);

  const handleClose = useCallback(() => {
    isClosingRef.current = true;
    setSelectedSlug((prev) => {
      closingSlugRef.current = prev;
      return null;
    });
  }, []);

  if (loading && list.length === 0) return <Loading />;

  const hasSelection = selectedSlug !== null;

  return (
    <div className="dex-page">
      {/* Header */}
      <div className="dex-header panel">
        <div className="dex-header-top">
          <div>
            <h2 className="panel-title">全国图鉴</h2>
            <p className="panel-subtitle">点击宝可梦查看详情，包括特性、种族值计算器和招式表。</p>
          </div>
          <span className="chip">{total > 0 ? `${list.length} / ${total}` : `${list.length}`} 只宝可梦</span>
        </div>
        <div className="dex-toolbar">
          <div className="dex-search-wrap">
            <svg className="dex-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8.5" cy="8.5" r="5.5" /><line x1="13" y1="13" x2="17" y2="17" />
            </svg>
            <input
              className="dex-search"
              placeholder="搜索名称 / 编号…"
              value={inputValue}
              onChange={handleInputChange}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
            />
          </div>
          <div className="dex-filters">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">全部属性</option>
              {ALL_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={generation} onChange={(e) => setGeneration(e.target.value)}>
              <option value="">全部世代</option>
              {GENERATION_OPTIONS.map((g) => <option key={g} value={g}>第 {g} 世代</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Master-Detail body */}
      <div className="dex-body">
        {/* Left: Pokemon list */}
        <div className={`dex-list-panel panel ${hasSelection ? "dex-list-panel-narrow" : ""}`}>
          <div ref={listContainerRef} className={`dex-list ${hasSelection ? "dex-list-compact" : ""}`}>
            {list.length === 0 && !loading && <div className="dex-empty">没有匹配的宝可梦。</div>}
            {list.map((member) => {
              const slug = member.slug || member.id;
              const isActive = selectedSlug === slug;
              const image = getPokemonPreviewImage(member);
              return (
                <motion.button
                  layout
                  layoutId={`dex-item-${slug}`}
                  key={slug}
                  ref={isActive ? activeCardRef : undefined}
                  data-slug={slug}
                  className={`dex-item ${hasSelection ? "dex-item-compact" : ""} ${isActive ? "dex-item-active" : ""}`}
                  onClick={() => handleSelect(slug)}
                  transition={{ layout: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
                >
                  <div className="dex-item-img">
                    {image?.url
                      ? <img src={image.url} alt={image.alt || member.nameZh} referrerPolicy="no-referrer" loading="lazy" />
                      : <span className="dex-card-placeholder">?</span>}
                  </div>
                  <div className="dex-item-info">
                    <span className="dex-item-dex">#{String(member.dexNumber || "?").padStart(4, "0")}</span>
                    <strong className="dex-item-name">{member.nameZh}</strong>
                    <span className="dex-item-en">{member.nameEn || ""}</span>
                  </div>
                  <div className="dex-item-types">
                    <TypeChip type={member.primaryType} />
                    <TypeChip type={member.secondaryType} />
                  </div>
                </motion.button>
              );
            })}
            {hasMore && (
              <div className="dex-load-more" ref={sentinelRef}>
                <div className="pulse-dot" />
              </div>
            )}
          </div>
        </div>

        {/* Right: Detail panel */}
        <AnimatePresence mode="wait">
          {hasSelection && (
            <motion.div
              key="detail-panel"
              className="dex-detail-panel panel"
              ref={detailRef}
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Close button */}
              <button className="dex-detail-close" onClick={handleClose} title="关闭详情">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" />
                </svg>
              </button>
              {detail ? (
                <DrawerContent
                  detail={detail}
                  detailGeneration={detailGeneration}
                  onDetailGenerationChange={setDetailGeneration}
                />
              ) : (
                <div className="dex-drawer-loading">
                  <div className="pulse-dot" />
                  <span>加载详情…</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── Drawer Content with Tabs ─── */
function DrawerContent({ detail, detailGeneration, onDetailGenerationChange }) {
  const [tab, setTab] = useState("stats");
  const [imageMode, setImageMode] = useState("official");
  const [detailForm, setDetailForm] = useState("default");
  const [learnsetMeta, setLearnsetMeta] = useState(null);
  const [learnsetFormOverride, setLearnsetFormOverride] = useState(null);

  const pokemonId = detail.id;

  // Reset tab & form when detail changes
  useEffect(() => {
    setTab("stats");
    setImageMode("official");
    setDetailForm("default");
    setLearnsetFormOverride(null);
    setLearnsetMeta(null);
  }, [detail]);

  // 加载 learnset meta（可用世代和形态列表）
  useEffect(() => {
    let cancelled = false;
    api(`/pokemon/${pokemonId}/learnset/meta`).then((r) => {
      if (!cancelled) setLearnsetMeta(r.data);
    });
    return () => { cancelled = true; };
  }, [pokemonId]);

  const learnsetFormKeys = learnsetMeta?.formKeys || [];

  const display = useMemo(
    () => resolvePokemonDisplayVariant(detail, detailGeneration, detailForm, ""),
    [detail, detailGeneration, detailForm]
  );

  // 构建 detail form → learnset formKey 的映射表
  const formToLearnsetMap = useMemo(() => {
    const map = new Map();
    if (learnsetFormKeys.length === 0 || display.formOptions.length === 0) return map;
    const usedLearnsetKeys = new Set();
    // 第一轮：直接匹配 formKey 或 nameZh
    for (const form of display.formOptions) {
      const direct = learnsetFormKeys.find(
        (fk) => !usedLearnsetKeys.has(fk) && (fk === form.formKey || fk === form.nameZh)
      );
      if (direct) {
        map.set(form.id, direct);
        usedLearnsetKeys.add(direct);
      }
    }
    // 第二轮：未匹配的 form 按顺序分配剩余的 learnset key
    const remaining = learnsetFormKeys.filter((fk) => !usedLearnsetKeys.has(fk));
    let ri = 0;
    for (const form of display.formOptions) {
      if (!map.has(form.id) && ri < remaining.length) {
        map.set(form.id, remaining[ri++]);
      }
    }
    return map;
  }, [display.formOptions, learnsetFormKeys]);

  const mapFormToLearnsetKey = useCallback((form) => {
    if (!form) return null;
    return formToLearnsetMap.get(form.id) || null;
  }, [formToLearnsetMap]);

  // 当切换 detail 形态时，同时联动 learnset 的 formKey
  const handleFormChange = useCallback((formId) => {
    setDetailForm(formId);
    const form = display.formOptions.find((f) => f.id === formId);
    setLearnsetFormOverride(mapFormToLearnsetKey(form));
  }, [display.formOptions, mapFormToLearnsetKey]);

  // 计算当前传给 MovesTab 的 learnset formKey
  const activeLearnsetFormKey = useMemo(() => {
    if (learnsetFormOverride && learnsetFormKeys.includes(learnsetFormOverride)) return learnsetFormOverride;
    // 用当前 display.form 做映射
    const mapped = mapFormToLearnsetKey(display.form);
    if (mapped) return mapped;
    return learnsetFormKeys[0] || null;
  }, [learnsetFormOverride, learnsetFormKeys, display.form, mapFormToLearnsetKey]);

  const generations = detail.generations || [];

  const tabs = [
    { key: "stats", label: "种族值" },
    { key: "moves", label: "招式表" }
  ];

  return (
    <div className="drawer-content">
      {/* Hero: image + basic info */}
      <div className="drawer-hero">
        <div className="drawer-img-box">
          <DrawerImage images={display.images} mode={imageMode} onModeChange={setImageMode} />
        </div>
        <div className="drawer-intro">
          <div className="drawer-title-row">
            <span className="drawer-dex">#{String(detail.dexNumber).padStart(4, "0")}</span>
            <h3 className="drawer-name">{detail.nameZh}</h3>
            <span className="drawer-en">{detail.nameEn || ""}</span>
          </div>
          <div className="drawer-types-row">
            <TypeChip type={display.primaryType} />
            <TypeChip type={display.secondaryType} />
          </div>
          <div className="drawer-meta-strip">
            <MetaPill label="分类" value={detail.category} />
            <MetaPill label="身高" value={detail.heightM ? `${detail.heightM}m` : null} />
            <MetaPill label="体重" value={detail.weightKg ? `${detail.weightKg}kg` : null} />
          </div>
          <div className="drawer-abilities">
            <span className="drawer-ability-label">特性</span>
            {display.abilityText && display.abilityText.split(" / ").map((a, i) => (
              <span key={i} className="drawer-ability-chip">{a}</span>
            ))}
            {display.hiddenAbilityText && display.hiddenAbilityText !== "无" && (
              <span className="drawer-ability-chip drawer-ability-hidden" title="隐藏特性">
                {display.hiddenAbilityText} ✦
              </span>
            )}
          </div>
          {/* Form selector */}
          {display.formOptions.length > 1 && (
            <div className="drawer-form-selector">
              <span className="drawer-ability-label">形态</span>
              <div className="drawer-form-chips">
                {display.formOptions.map((form) => (
                  <button
                    key={form.id}
                    className={`drawer-form-chip ${form.id === display.form.id ? "drawer-form-chip-active" : ""}`}
                    onClick={() => handleFormChange(form.id)}
                  >
                    {form.nameZh}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Generation & source pills */}
      {(generations.length > 0 || detail.source?.url) && (
        <div className="drawer-extra">
          {generations.length > 0 && (
            <div className="drawer-gen-row">
              {generations.map((g) => (
                <span key={g} className="drawer-gen-pill">第 {g} 世代</span>
              ))}
            </div>
          )}
          {detail.source?.url && (
            <a href={detail.source.url} target="_blank" rel="noopener noreferrer" className="drawer-source-link">
              {detail.source.title || "数据来源"}
            </a>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="drawer-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`drawer-tab ${tab === t.key ? "drawer-tab-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="drawer-tab-body"
        >
          {tab === "stats" && (
            <StatsTab
              detail={detail}
              display={display}
              detailGeneration={detailGeneration}
              onDetailGenerationChange={onDetailGenerationChange}
            />
          )}
          {tab === "moves" && (
            <MovesTab
              detail={detail}
              display={display}
              detailGeneration={detailGeneration}
              onDetailGenerationChange={onDetailGenerationChange}
              learnsetMeta={learnsetMeta}
              externalFormKey={activeLearnsetFormKey}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ─── Drawer Image ─── */
function DrawerImage({ images, mode, onModeChange }) {
  const src = mode === "shiny"
    ? images?.shinyOfficial || images?.shinySprite || images?.official || images?.sprite
    : images?.official || images?.sprite || images?.shinyOfficial || images?.shinySprite;

  return (
    <div className="drawer-img-inner">
      {src?.url
        ? <img src={src.url} alt={src.alt || ""} referrerPolicy="no-referrer" />
        : <span className="drawer-img-empty">暂无图片</span>}
      <div className="drawer-img-toggle">
        <button className={mode === "official" ? "active" : ""} onClick={() => onModeChange("official")}>普通</button>
        <button className={mode === "shiny" ? "active" : ""} onClick={() => onModeChange("shiny")}>闪光</button>
      </div>
    </div>
  );
}

/* ─── Meta Pill ─── */
function MetaPill({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <span className="drawer-meta-pill">
      <span className="drawer-meta-key">{label}</span>
      <span className="drawer-meta-val">{value}</span>
    </span>
  );
}

/* ─── Stats Tab ─── */
function StatsTab({ detail, display, detailGeneration, onDetailGenerationChange }) {
  const stats = display.stats || {};

  // 获取当前形态的 statVariants
  const currentForm = display.form || {};
  const statVariants = currentForm.statVariants || [];
  const hasStatVariants = statVariants.length > 1;

  // 构建世代段切换选项：每个 variant 对应一个按钮
  const variantButtons = useMemo(() => {
    if (!hasStatVariants) return [];
    return statVariants.map((v, i) => {
      const gs = v.generationStart;
      const ge = v.generationEnd;
      let label;
      if (gs && ge) label = gs === ge ? `第 ${gs} 世代` : `第 ${gs}–${ge} 世代`;
      else if (gs) label = ge === undefined ? `第 ${gs} 世代起` : `第 ${gs}–${ge} 世代`;
      else if (ge) label = `第 ${ge} 世代及之前`;
      else label = `变体 ${i + 1}`;
      return { ...v, label, index: i };
    });
  }, [statVariants, hasStatVariants]);

  // 判断当前选中的是哪个 variant
  const activeVariantIndex = useMemo(() => {
    if (!hasStatVariants) return -1;
    const gen = display.generation;
    for (let i = 0; i < statVariants.length; i++) {
      const v = statVariants[i];
      const gs = v.generationStart;
      const ge = v.generationEnd;
      if (gs && ge && gen >= gs && gen <= ge) return i;
      if (gs && !ge && gen >= gs) return i;
      if (!gs && ge && gen <= ge) return i;
      if (!gs && !ge) return i;
    }
    return statVariants.length - 1;
  }, [statVariants, hasStatVariants, display.generation]);

  // 点击 variant 按钮时，设置一个属于该范围的世代
  const handleVariantClick = useCallback((variant) => {
    const targetGen = variant.generationStart || variant.generationEnd || 9;
    onDetailGenerationChange(String(targetGen));
  }, [onDetailGenerationChange]);

  // 计算与另一个 variant 的差异
  const diffStats = useMemo(() => {
    if (!hasStatVariants || activeVariantIndex < 0) return null;
    // 与前一个 variant 对比（如果当前是最新的，就和旧的对比）
    const otherIndex = activeVariantIndex === statVariants.length - 1
      ? activeVariantIndex - 1
      : activeVariantIndex + 1;
    if (otherIndex < 0 || otherIndex >= statVariants.length) return null;
    const current = statVariants[activeVariantIndex]?.baseStats;
    const other = statVariants[otherIndex]?.baseStats;
    if (!current || !other) return null;
    const diff = {};
    let hasDiff = false;
    for (const key of STAT_KEYS) {
      const d = (current[key] || 0) - (other[key] || 0);
      diff[key] = d;
      if (d !== 0) hasDiff = true;
    }
    return hasDiff ? diff : null;
  }, [statVariants, activeVariantIndex, hasStatVariants]);

  return (
    <div className="tab-stats">
      {/* Generation variant switcher */}
      {hasStatVariants && (
        <div className="stat-variant-switcher">
          <span className="stat-variant-hint">该宝可梦的种族值在不同世代有所调整</span>
          <div className="stat-variant-chips">
            {variantButtons.map((v, i) => (
              <button
                key={i}
                className={`stat-variant-chip ${i === activeVariantIndex ? "stat-variant-chip-active" : ""}`}
                onClick={() => handleVariantClick(v)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Base stat bars */}
      <div className="ov-section">
        <h4 className="ov-heading">种族值 — {display.form.nameZh || detail.nameZh}</h4>
        <BaseStatBars stats={stats} diff={diffStats} />
      </div>

      {/* Calculator */}
      <div className="ov-section">
        <h4 className="ov-heading">能力值计算器</h4>
        <p className="muted" style={{ margin: "0 0 12px" }}>
          选择性格、设置等级、个体值和努力值，实时计算 Lv.50 / Lv.100 下的最终能力值。
        </p>
        <StatCalculator baseStats={stats} />
      </div>
    </div>
  );
}

/* ─── Base Stat Bars (visual only) ─── */
const STAT_COLORS = {
  hp: "#ff5959", atk: "#f5ac78", def: "#fae078",
  spa: "#9db7f5", spd: "#a7db8d", spe: "#fa92b2"
};
const STAT_LABELS_SHORT = { hp: "HP", atk: "ATK", def: "DEF", spa: "SPA", spd: "SPD", spe: "SPE" };

function BaseStatBars({ stats, diff }) {
  const total = STAT_KEYS.reduce((s, k) => s + (stats[k] || 0), 0);
  const totalDiff = diff ? STAT_KEYS.reduce((s, k) => s + (diff[k] || 0), 0) : 0;
  return (
    <div className="bsb-grid">
      {STAT_KEYS.map((key) => {
        const val = stats[key] || 0;
        const pct = Math.min((val / 200) * 100, 100);
        const d = diff ? diff[key] || 0 : 0;
        return (
          <div key={key} className="bsb-row">
            <span className="bsb-label" style={{ color: STAT_COLORS[key] }}>{STAT_LABELS_SHORT[key]}</span>
            <div className="bsb-track">
              <motion.div
                className="bsb-fill"
                style={{ background: STAT_COLORS[key] }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            <span className="bsb-val-group">
              <span className="bsb-val">{val}</span>
              {d !== 0 && (
                <span className={`bsb-diff ${d > 0 ? "bsb-diff-up" : "bsb-diff-down"}`}>
                  {d > 0 ? `+${d}` : d}
                </span>
              )}
            </span>
          </div>
        );
      })}
      <div className="bsb-row bsb-total">
        <span className="bsb-label">合计</span>
        <div className="bsb-track" />
        <span className="bsb-val-group">
          <span className="bsb-val">{total}</span>
          {totalDiff !== 0 && (
            <span className={`bsb-diff ${totalDiff > 0 ? "bsb-diff-up" : "bsb-diff-down"}`}>
              {totalDiff > 0 ? `+${totalDiff}` : totalDiff}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/* ─── Moves Tab ─── */
function MovesTab({ detail, display, detailGeneration, onDetailGenerationChange, learnsetMeta, externalFormKey }) {
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
    api(`/pokemon/${pokemonId}/learnset?${params}`).then((r) => {
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
                    <span className="mv-move-name">{entry.moveNameZh || "未知"}</span>
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
