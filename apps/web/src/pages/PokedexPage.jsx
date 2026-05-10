import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { unifiedApi } from "../utils/api.js";
import { useInfiniteApi } from "../hooks/useInfiniteApi.js";
import { STAT_KEYS, LEARN_METHOD_LABELS } from "../utils/constants.js";
import {
  getPokemonPreviewImage,
  resolvePokemonDisplayVariant,
  describeLearnsetEntry
} from "../utils/helpers.js";
import { saveBoxConfig, getTeams, saveTeam } from "../utils/teamStorage.js";
import { useToast } from "../components/Toast.jsx";
import TypeChip from "../components/TypeChip.jsx";
import StatCalculator from "../components/StatCalculator.jsx";
import Loading from "../components/Loading.jsx";
import WikiLink from "../components/WikiLink.jsx";
import ViewToggle from "../components/ViewToggle.jsx";

/* ─── Main Page ─── */
export default function PokedexPage({ query = "", types = [], generation = "", initialPokemonId = null, onInitialPokemonConsumed }) {
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailGeneration, setDetailGeneration] = useState("");
  const [dexViewMode, setDexViewMode] = useState("card"); // "card" | "list"

  const detailRef = useRef(null);
  const activeCardRef = useRef(null);
  const prevSlugRef = useRef(null);  // remember slug before closing detail
  const filterChangedWhileOpenRef = useRef(false); // track filter changes with detail open
  const fromUrlNavRef = useRef(false); // true when selection comes from URL navigation (#/pokemon?id=X)

  // 构建分页请求路径
  const pokemonPath = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (types.length > 0) params.set("type", types.join(","));
    if (generation) params.set("generation", generation);
    const qs = params.toString();
    return qs ? `/pokemon?${qs}` : "/pokemon";
  }, [query, types, generation]);

  // Mark that filters changed while detail panel is open
  useEffect(() => {
    if (selectedSlug && !fromUrlNavRef.current) {
      filterChangedWhileOpenRef.current = true;
    }
  }, [query, types, generation]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: list, total, loading, hasMore, sentinelRef, loadingMore } = useInfiniteApi(pokemonPath, { pageSize: 60 });

  // After list reloads due to filter change while detail is open:
  // - has results → auto-select the first pokemon
  // - no results  → close detail, show empty state
  useEffect(() => {
    if (!filterChangedWhileOpenRef.current || loading) return;
    filterChangedWhileOpenRef.current = false;

    if (list.length > 0) {
      const firstSlug = String(list[0].id);
      setSelectedSlug(firstSlug);
    } else {
      setSelectedSlug(null);
      setDetail(null);
    }
  }, [list, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // 从 URL 参数 (#/pokemon?id=X) 自动选中宝可梦
  useEffect(() => {
    if (!initialPokemonId) return;
    fromUrlNavRef.current = true; // mark so scroll handler scrolls to top instead of scrollIntoView
    setSelectedSlug(String(initialPokemonId));
    if (onInitialPokemonConsumed) onInitialPokemonConsumed();
    // 清理 URL hash，避免刷新后重复触发
    const hash = window.location.hash || "";
    if (hash.startsWith("#/pokemon")) {
      window.history.replaceState(null, "", "#/pokedex");
    }
  }, [initialPokemonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch detail when a card is selected
  useEffect(() => {
    if (!selectedSlug) { setDetail(null); return; }
    let cancelled = false;
    setDetail(null);
    unifiedApi(`/pokemon/${selectedSlug}`).then((r) => {
      if (!cancelled) {
        setDetail(r.data);
        setDetailGeneration("");
      }
    });
    return () => { cancelled = true; };
  }, [selectedSlug]);

  // Scroll detail panel to top when detail changes
  useEffect(() => {
    if (detail && detailRef.current) {
      detailRef.current.scrollTop = 0;
    }
  }, [detail]);

  // Scroll handling for layout transitions.
  // Only scroll when layout actually changes (entering/leaving split view),
  // NOT when switching between pokemon within the split view.
  const scrollTimerRef = useRef(null);
  const hadSelectionRef = useRef(false); // was there a selection BEFORE this change?

  useEffect(() => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);

    const wasOpen = hadSelectionRef.current;
    const isOpen = !!selectedSlug;
    hadSelectionRef.current = isOpen;

    if (isOpen && !wasOpen) {
      // Entering split view from grid: scroll to the selected card after layout animation
      prevSlugRef.current = selectedSlug;
      const isFromUrl = fromUrlNavRef.current;
      fromUrlNavRef.current = false;
      scrollTimerRef.current = setTimeout(() => {
        if (isFromUrl) {
          // Navigated from another page (e.g. moves/abilities) — scroll to top so detail panel is visible
          window.scrollTo({ top: 0, behavior: "instant" });
        } else {
          const card = document.querySelector(`[data-slug="${CSS.escape(selectedSlug)}"]`);
          if (card) {
            card.scrollIntoView({ block: "start", behavior: "instant" });
          }
        }
      }, 380);
    } else if (isOpen && wasOpen) {
      // Switching pokemon within split view: just update prevSlug, no scroll
      prevSlugRef.current = selectedSlug;
    } else if (!isOpen && prevSlugRef.current) {
      // Closing detail: scroll back to the previously selected card
      const slugToRestore = prevSlugRef.current;
      scrollTimerRef.current = setTimeout(() => {
        const card = document.querySelector(`[data-slug="${CSS.escape(slugToRestore)}"]`);
        if (card) {
          card.scrollIntoView({ block: "center", behavior: "instant" });
        }
      }, 380);
    }

    return () => { if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current); };
  }, [selectedSlug]);

  const handleSelect = useCallback((slug) => {
    setSelectedSlug((prev) => (prev === slug ? null : slug));
  }, []);

  const handleClose = useCallback(() => {
    setSelectedSlug(null);
  }, []);

  if (loading && list.length === 0) return <Loading />;

  const hasSelection = selectedSlug !== null;

  // 选中详情时强制使用卡片模式（紧凑列表）
  const effectiveViewMode = hasSelection ? "card" : dexViewMode;

  return (
    <div className="dex-page">
      {/* 视图切换按钮（仅在未选中详情时显示） */}
      {!hasSelection && list.length > 0 && (
        <div className="dex-view-toggle">
          <ViewToggle mode={effectiveViewMode} onChange={setDexViewMode} />
        </div>
      )}

      <div className={`dex-body${hasSelection ? " dex-body-split" : ""}`}>
        {/* Left: Pokemon list — scrolls naturally with the page */}
        <div className={`dex-list-panel${hasSelection ? " dex-list-panel-narrow" : ""}`}>
          {effectiveViewMode === "card" ? (
          <div className={`dex-list ${hasSelection ? "dex-list-compact" : ""}`}>
            {list.length === 0 && !loading && <div className="dex-empty">没有匹配的宝可梦。</div>}
            {list.map((member) => {
              const slug = String(member.id);
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
          ) : (
          /* 列表视图 */
          <div className="dex-table-view">
            {list.length === 0 && !loading && <div className="dex-empty">没有匹配的宝可梦。</div>}
            <div className="dex-table-header">
              <span className="dex-table-hcol dex-table-hcol-img"></span>
              <span className="dex-table-hcol dex-table-hcol-dex">编号</span>
              <span className="dex-table-hcol dex-table-hcol-name">名称</span>
              <span className="dex-table-hcol dex-table-hcol-types">属性</span>
              <span className="dex-table-hcol-spacer" />
              <span className="dex-table-hcol dex-table-hcol-ability">特性</span>
              <span className="dex-table-hcol dex-table-hcol-stats">HP</span>
              <span className="dex-table-hcol dex-table-hcol-stats">攻击</span>
              <span className="dex-table-hcol dex-table-hcol-stats">防御</span>
              <span className="dex-table-hcol dex-table-hcol-stats">特攻</span>
              <span className="dex-table-hcol dex-table-hcol-stats">特防</span>
              <span className="dex-table-hcol dex-table-hcol-stats">速度</span>
              <span className="dex-table-hcol dex-table-hcol-stats">合计</span>
            </div>
            {list.map((member) => {
              const slug = String(member.id);
              const image = getPokemonPreviewImage(member);
              const bs = member.baseStats || {};
              const total = STAT_KEYS.reduce((s, k) => s + (bs[k] || 0), 0);
              return (
                <div key={slug} className="dex-table-row" data-slug={slug} onClick={() => handleSelect(slug)}>
                  <div className="dex-table-col dex-table-col-img">
                    <div className="dex-table-thumb">
                      {image?.url
                        ? <img src={image.url} alt={member.nameZh} referrerPolicy="no-referrer" loading="lazy" />
                        : <span className="dex-card-placeholder">?</span>}
                    </div>
                  </div>
                  <div className="dex-table-col dex-table-col-dex">
                    <span className="dex-table-dex">#{String(member.dexNumber || "?").padStart(4, "0")}</span>
                  </div>
                  <div className="dex-table-col dex-table-col-name">
                    <strong className="dex-table-name-zh">{member.nameZh}</strong>
                    <span className="dex-table-name-en">{member.nameEn || ""}</span>
                  </div>
                  <div className="dex-table-col dex-table-col-types">
                    <TypeChip type={member.primaryType} />
                    <TypeChip type={member.secondaryType} />
                  </div>
                  <div className="dex-table-col-spacer" />
                  <div className="dex-table-col dex-table-col-ability">
                    <span className="dex-table-ability">{(member.abilities || []).join(" / ") || "—"}</span>
                    {member.hiddenAbility && <span className="dex-table-ability-hidden">{member.hiddenAbility}</span>}
                  </div>
                  {STAT_KEYS.map((k) => (
                    <div key={k} className="dex-table-col dex-table-col-stat">
                      <span className="dex-table-stat-val">{bs[k] ?? "—"}</span>
                    </div>
                  ))}
                  <div className="dex-table-col dex-table-col-stat dex-table-col-total">
                    <span className="dex-table-stat-val dex-table-stat-total">{total || "—"}</span>
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <div className="dex-load-more" ref={sentinelRef}>
                <div className="pulse-dot" />
              </div>
            )}
          </div>
          )}
        </div>

        {/* Right: Detail panel — sticky so it stays visible while list scrolls */}
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
    unifiedApi(`/pokemon/${pokemonId}/learnset/meta`).then((r) => {
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
            <WikiLink url={detail.source?.url} title={detail.source?.title || "Wiki"} className="drawer-wiki-link" />
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
            {(display.abilitiesDetailed || []).map((ab, i) => (
              <a
                key={i}
                className={`drawer-ability-chip drawer-ability-link${ab.isHidden ? " drawer-ability-hidden" : ""}`}
                href={ab.abilityId ? `#/abilities?expand=${ab.abilityId}` : "#/abilities"}
                title={ab.description || ab.nameZh}
              >
                <span className="drawer-ability-chip-text">
                  {ab.nameZh}{ab.isHidden ? " ✦" : ""}
                </span>
                {ab.description && (
                  <span className="ability-tooltip">{ab.description}</span>
                )}
              </a>
            ))}
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

/* ─── Team Picker Modal ─── */
function TeamPickerModal({ onSelect, onClose }) {
  const teams = getTeams();
  const modalRef = useRef(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    const handleClick = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    const newTeam = saveTeam({ name, format: "singles", members: [] });
    onSelect(newTeam);
  };

  return (
    <div className="sc-team-picker-overlay">
      <div className="sc-team-picker" ref={modalRef}>
        <div className="sc-team-picker-header">
          <strong>选择队伍</strong>
          <button className="sc-team-picker-close" onClick={onClose}>✕</button>
        </div>
        <div className="sc-team-picker-list">
          {teams.map((t) => {
            const memberCount = (t.members || []).length;
            const isFull = memberCount >= 6;
            return (
              <button
                key={t.teamId}
                className={`sc-team-picker-item ${isFull ? "sc-team-picker-item-full" : ""}`}
                onClick={() => !isFull && onSelect(t)}
                disabled={isFull}
              >
                <span className="sc-team-picker-item-name">{t.name || "未命名队伍"}</span>
                <span className="sc-team-picker-item-count">{memberCount}/6</span>
                {isFull && <span className="sc-team-picker-item-tag">已满</span>}
              </button>
            );
          })}
        </div>
        <div className="sc-team-picker-footer">
          {creating ? (
            <div className="sc-team-picker-create-form">
              <input
                className="sc-team-picker-create-input"
                type="text"
                placeholder="输入队伍名称…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <button className="sc-team-picker-create-confirm" onClick={handleCreate}>确定</button>
              <button className="sc-team-picker-create-cancel" onClick={() => { setCreating(false); setNewName(""); }}>取消</button>
            </div>
          ) : (
            <button className="sc-team-picker-create-btn" onClick={() => setCreating(true)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M8 3v10M3 8h10" />
              </svg>
              创建新队伍
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Stats Tab ─── */
function StatsTab({ detail, display, detailGeneration, onDetailGenerationChange }) {
  const toast = useToast();
  const stats = display.stats || {};
  const [calcValues, setCalcValues] = useState(null);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [addFeedback, setAddFeedback] = useState(""); // "box" | "team" | ""

  // 构建当前宝可梦配置数据
  const buildConfig = useCallback(() => {
    const img = getPokemonPreviewImage(detail);
    return {
      pokemonId: String(detail.id),
      nameZh: display.form?.nameZh || detail.nameZh || "",
      level: calcValues?.level || 50,
      nature: calcValues?.nature || "认真",
      ivs: calcValues?.ivs || {},
      evs: calcValues?.evs || {},
      statMode: calcValues?.statMode || "classic",
      sps: calcValues?.sps || {},
      champNature: calcValues?.champNature || "认真",
      moves: [],
      itemId: "",
      itemImageUrl: "",
      abilityId: "",
      imageUrl: img?.url || "",
      shinyImageUrl: display.images?.shinyOfficial || display.images?.shinySprite || "",
      isShiny: false,
      primaryType: display.primaryType || "",
      secondaryType: display.secondaryType || "",
      baseStats: stats,
    };
  }, [detail, display, stats, calcValues]);

  const handleAddToBox = useCallback(() => {
    const config = buildConfig();
    saveBoxConfig(config);
    setAddFeedback("box");
    setTimeout(() => setAddFeedback(""), 2000);
  }, [buildConfig]);

  const handleAddToTeam = useCallback((team) => {
    const config = buildConfig();
    const members = [...(team.members || [])];
    if (members.length >= 6) {
      toast.error("该队伍已有 6 只宝可梦，无法继续添加。");
      return;
    }
    const duplicate = members.find((m) => m.pokemonId === config.pokemonId);
    if (duplicate) {
      toast.error(`该队伍中已存在「${config.nameZh || config.pokemonId}」，不能重复添加同一宝可梦。`);
      return;
    }
    const slot = members.length + 1;
    members.push({ ...config, slot });
    saveTeam({ ...team, members });
    setShowTeamPicker(false);
    setAddFeedback("team");
    setTimeout(() => setAddFeedback(""), 2000);
  }, [buildConfig]);

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
        <StatCalculator baseStats={stats} onChange={setCalcValues} />

        {/* 添加到盒子/队伍按钮 */}
        <div className="sc-actions">
          <button className="sc-action-btn sc-action-box" onClick={handleAddToBox}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="12" height="10" rx="1.5" />
              <path d="M2 7h12" />
              <path d="M6 4V2.5A.5.5 0 0 1 6.5 2h3a.5.5 0 0 1 .5.5V4" />
            </svg>
            添加到盒子
          </button>
          <button className="sc-action-btn sc-action-team" onClick={() => setShowTeamPicker(true)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="5" r="3" />
              <path d="M2 14c0-2.5 2.5-4.5 6-4.5s6 2 6 4.5" />
            </svg>
            添加到队伍
          </button>
          {addFeedback === "box" && <span className="sc-action-feedback">✓ 已添加到盒子</span>}
          {addFeedback === "team" && <span className="sc-action-feedback">✓ 已添加到队伍</span>}
        </div>

        {/* 队伍选择弹窗 */}
        {showTeamPicker && <TeamPickerModal onSelect={handleAddToTeam} onClose={() => setShowTeamPicker(false)} />}
      </div>
    </div>
  );
}

/* ─── Base Stat Bars (visual only) ─── */
const STAT_COLORS = {
  hp: "#8AC654", atk: "#F8CB3C", def: "#D98837",
  spa: "#59C3D0", spd: "#5890CD", spe: "#A456D0"
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
