import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../utils/api.js";
import { ALL_TYPE_OPTIONS, GENERATION_OPTIONS, STAT_KEYS, LEARN_METHOD_LABELS } from "../utils/constants.js";
import {
  buildEvolutionFamilies,
  getPokemonPreviewImage,
  resolvePokemonDisplayVariant,
  buildPokemonGenerationOptions,
  getPokemonLearnsetEntries,
  sortLearnsetEntries,
  buildMoveLookup,
  resolveLearnsetMove,
  resolveMoveGenerationRecord,
  describeLearnsetEntry,
  getTypeChips
} from "../utils/helpers.js";
import TypeChip from "../components/TypeChip.jsx";
import StatCalculator from "../components/StatCalculator.jsx";
import Loading from "../components/Loading.jsx";

/* ─── Main Page ─── */
export default function PokedexPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [generation, setGeneration] = useState("");
  const [expandedSlug, setExpandedSlug] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailGeneration, setDetailGeneration] = useState("");

  const [list, setList] = useState([]);
  const [allMoves, setAllMoves] = useState([]);
  const [loading, setLoading] = useState(true);

  const drawerRef = useRef(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (type) params.set("type", type);
    if (generation) params.set("generation", generation);
    const [listResult, movesResult] = await Promise.all([
      api(`/pokemon?${params.toString()}`),
      api("/moves")
    ]);
    setList(listResult.data);
    setAllMoves(movesResult.data);
    setLoading(false);
  }, [query, type, generation]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Close drawer when filters change
  useEffect(() => { setExpandedSlug(null); setDetail(null); }, [query, type, generation]);

  // Fetch detail when a card is expanded
  useEffect(() => {
    if (!expandedSlug) { setDetail(null); return; }
    let cancelled = false;
    setDetail(null);
    api(`/pokemon/${encodeURIComponent(expandedSlug)}`).then((r) => {
      if (!cancelled) {
        setDetail(r.data);
        setDetailGeneration("");
      }
    });
    return () => { cancelled = true; };
  }, [expandedSlug]);

  // Scroll drawer into view
  useEffect(() => {
    if (detail && drawerRef.current) {
      setTimeout(() => drawerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 120);
    }
  }, [detail]);

  const handleToggle = useCallback((slug) => {
    setExpandedSlug((prev) => (prev === slug ? null : slug));
  }, []);

  const families = useMemo(() => buildEvolutionFamilies(list), [list]);

  if (loading && list.length === 0) return <Loading />;

  return (
    <div className="dex-page">
      {/* Header */}
      <div className="dex-header panel">
        <div className="dex-header-top">
          <div>
            <h2 className="panel-title">全国图鉴</h2>
            <p className="panel-subtitle">点击宝可梦卡片展开详情，查看特性、种族值计算器和招式表。</p>
          </div>
          <span className="chip">{list.length} 只宝可梦</span>
        </div>
        <div className="dex-filters">
          <input
            className="dex-search"
            placeholder="搜索名称 / 编号…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
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

      {/* Card grid */}
      <div className="dex-grid">
        {families.length === 0 && <div className="dex-empty">没有匹配的宝可梦。</div>}
        {families.map((family) => {
          // For each family, render each member as a card
          return family.chain.map((member) => {
            const slug = member.slug || member.id;
            const isExpanded = expandedSlug === slug;
            const image = getPokemonPreviewImage(member);
            return (
              <div key={slug} className="dex-card-wrapper" style={isExpanded ? { gridColumn: "1 / -1" } : undefined}>
                <button
                  className={`dex-card ${isExpanded ? "dex-card-active" : ""}`}
                  onClick={() => handleToggle(slug)}
                >
                  <div className="dex-card-img-wrap">
                    {image?.url
                      ? <img src={image.url} alt={image.alt || member.nameZh} referrerPolicy="no-referrer" loading="lazy" />
                      : <span className="dex-card-placeholder">?</span>}
                  </div>
                  <span className="dex-card-dex">#{String(member.dexNumber || "?").padStart(4, "0")}</span>
                  <strong className="dex-card-name">{member.nameZh}</strong>
                  <span className="dex-card-en">{member.nameEn || ""}</span>
                  <div className="dex-card-types">
                    <TypeChip type={member.primaryType} />
                    <TypeChip type={member.secondaryType} />
                  </div>
                </button>

                {/* Drawer */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      ref={drawerRef}
                      className="dex-drawer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <div className="dex-drawer-inner">
                        {detail ? (
                          <DrawerContent
                            detail={detail}
                            allMoves={allMoves}
                            detailGeneration={detailGeneration}
                            onDetailGenerationChange={setDetailGeneration}
                          />
                        ) : (
                          <div className="dex-drawer-loading">
                            <div className="pulse-dot" />
                            <span>加载详情…</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

/* ─── Drawer Content with Tabs ─── */
function DrawerContent({ detail, allMoves, detailGeneration, onDetailGenerationChange }) {
  const [tab, setTab] = useState("overview");
  const [imageMode, setImageMode] = useState("official");

  const display = useMemo(
    () => resolvePokemonDisplayVariant(detail, detailGeneration, "base", ""),
    [detail, detailGeneration]
  );

  const tabs = [
    { key: "overview", label: "概览" },
    { key: "stats", label: "种族值 & 能力值" },
    { key: "moves", label: "招式表" }
  ];

  return (
    <div className="drawer-content">
      {/* Top: image + basic info side by side */}
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
            <MetaPill label="捕获率" value={detail.catchRate} />
            <MetaPill label="颜色" value={detail.color} />
          </div>
          <div className="drawer-abilities">
            <span className="drawer-ability-label">特性</span>
            {(detail.abilities || []).map((a, i) => (
              <span key={i} className="drawer-ability-chip">{a}</span>
            ))}
            {detail.hiddenAbility && (
              <span className="drawer-ability-chip drawer-ability-hidden" title="隐藏特性">
                {detail.hiddenAbility} ✦
              </span>
            )}
          </div>
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
          {tab === "overview" && <OverviewTab detail={detail} display={display} />}
          {tab === "stats" && <StatsTab detail={detail} display={display} />}
          {tab === "moves" && (
            <MovesTab
              detail={detail}
              display={display}
              allMoves={allMoves}
              detailGeneration={detailGeneration}
              onDetailGenerationChange={onDetailGenerationChange}
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

/* ─── Overview Tab ─── */
function OverviewTab({ detail, display }) {
  const generations = detail.generationAvailability || [];
  const formOptions = display.formOptions || [];

  return (
    <div className="tab-overview">
      {/* Forms */}
      {formOptions.length > 1 && (
        <div className="ov-section">
          <h4 className="ov-heading">形态</h4>
          <div className="ov-forms-grid">
            {formOptions.map((form) => (
              <div key={form.id} className="ov-form-card">
                {form.images?.official?.url && (
                  <img src={form.images.official.url} alt={form.nameZh} className="ov-form-img" referrerPolicy="no-referrer" />
                )}
                <strong>{form.nameZh}</strong>
                <span className="muted">{[form.primaryType, form.secondaryType].filter(Boolean).join(" / ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generation availability */}
      <div className="ov-section">
        <h4 className="ov-heading">世代与地区图鉴</h4>
        <div className="ov-gen-list">
          {generations.length > 0
            ? generations.map((g, i) => (
              <span key={i} className="ov-gen-pill">
                第 {g.generation} 世代
                {(g.regions || []).length > 0 && (
                  <span className="ov-gen-regions">
                    {g.regions.map((r) => `${r.region}${r.dexNumber ? ` #${r.dexNumber}` : ""}`).join("、")}
                  </span>
                )}
              </span>
            ))
            : <span className="muted">暂无世代记录</span>}
        </div>
      </div>

      {/* Generation records */}
      {(detail.generationRecords || []).length > 0 && (
        <div className="ov-section">
          <h4 className="ov-heading">按世代记录</h4>
          <div className="ov-gen-records">
            {detail.generationRecords.map((record, i) => (
              <div key={i} className="ov-gen-record-card">
                <strong>第 {record.generation} 世代</strong>
                <div className="ov-record-body">
                  <span>属性：{[record.primaryType, record.secondaryType].filter(Boolean).join(" / ") || "—"}</span>
                  <span>特性：{(record.abilityIds || []).join(" / ") || "—"}</span>
                  <span>隐藏特性：{record.hiddenAbilityId || "无"}</span>
                  <span>招式数：{record.learnset?.length || record.moveIds?.length || 0}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Stats Tab ─── */
function StatsTab({ detail, display }) {
  const stats = display.stats || {};

  return (
    <div className="tab-stats">
      {/* Base stat bars */}
      <div className="ov-section">
        <h4 className="ov-heading">种族值</h4>
        <BaseStatBars stats={stats} />
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

function BaseStatBars({ stats }) {
  const total = STAT_KEYS.reduce((s, k) => s + (stats[k] || 0), 0);
  return (
    <div className="bsb-grid">
      {STAT_KEYS.map((key) => {
        const val = stats[key] || 0;
        const pct = Math.min((val / 200) * 100, 100);
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
            <span className="bsb-val">{val}</span>
          </div>
        );
      })}
      <div className="bsb-row bsb-total">
        <span className="bsb-label">合计</span>
        <div className="bsb-track" />
        <span className="bsb-val">{total}</span>
      </div>
    </div>
  );
}

/* ─── Moves Tab ─── */
function MovesTab({ detail, display, allMoves, detailGeneration, onDetailGenerationChange }) {
  const generation = display.generation;
  const entries = useMemo(
    () => sortLearnsetEntries(getPokemonLearnsetEntries(detail, generation)),
    [detail, generation]
  );
  const moveLookup = useMemo(() => buildMoveLookup(allMoves), [allMoves]);
  const generationRecords = useMemo(
    () => [...(detail.generationRecords || [])].filter((r) => r.generation).sort((a, b) => a.generation - b.generation),
    [detail]
  );

  return (
    <div className="tab-moves">
      {/* Generation pills */}
      <div className="mv-gen-strip">
        {generationRecords.map((record) => {
          const count = record.learnset?.length || record.moveIds?.length || 0;
          const isActive = String(record.generation) === String(generation);
          return (
            <button
              key={record.generation}
              className={`mv-gen-pill ${isActive ? "mv-gen-pill-active" : ""}`}
              onClick={() => onDetailGenerationChange(String(record.generation))}
            >
              第 {record.generation} 世代 · {count || "无"} 招
            </button>
          );
        })}
        {generationRecords.length === 0 && <span className="muted">暂无世代招式记录</span>}
      </div>

      {entries.length === 0 ? (
        <p className="muted">当前世代还没有导入可学招式表。</p>
      ) : (
        <>
          <p className="muted" style={{ margin: "0 0 8px" }}>共 {entries.length} 条记录</p>
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
            {entries.map((entry, i) => {
              const move = resolveLearnsetMove(entry, moveLookup);
              const moveRecord = move ? resolveMoveGenerationRecord(move, generation) : undefined;
              const learnText = describeLearnsetEntry(entry) || "—";
              return (
                <div key={i} className="mv-row">
                  <span className="mv-move-name">{entry.moveNameZh || move?.nameZh || "未知"}</span>
                  <span>{learnText}</span>
                  <span><TypeChip type={moveRecord?.type || move?.type || ""} /></span>
                  <span>{moveRecord?.category || move?.category || "—"}</span>
                  <span>{moveRecord?.power ?? move?.power ?? "—"}</span>
                  <span>{moveRecord?.accuracy != null ? `${moveRecord.accuracy}%` : move?.accuracy != null ? `${move.accuracy}%` : "—"}</span>
                  <span>{moveRecord?.pp ?? move?.pp ?? "—"}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
