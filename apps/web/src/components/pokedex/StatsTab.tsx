import { useCallback, useMemo, useState } from "react";
import { STAT_KEYS, TYPE_OPTIONS, TYPE_CHART_BY_ID, TYPE_IDS, typeNameToId } from "@pokemon-localdex/store-types/constants";
import { getPokemonPreviewImage } from "../../utils/helpers.js";
import { saveBoxConfig, saveTeam } from "../../utils/teamStorage.js";
import { useToast } from "../Toast.jsx";
import InlineStatCalculator from "./InlineStatCalculator";
import TeamPickerModal from "./TeamPickerModal.jsx";
import type { PokemonDetail, DisplayVariant } from "./types";

/* ── Types ── */
interface CalcValues {
  level: number;
  nature: string;
  ivs: Record<string, number>;
  evs: Record<string, number>;
  statMode: "classic" | "champions";
  sps: Record<string, number>;
  champNature: string;
}

interface StatsTabProps {
  detail: PokemonDetail;
  display: DisplayVariant;
  onDetailGenerationChange: (gen: string) => void;
  /** 对战 Tab 联动：注入性格/EV 预设 */
  applyPreset?: { nature?: string; evs?: Record<string, number> } | null;
}

/* ─── Type Coverage Summary ─── */
interface CoverageSummaryProps {
  primaryType: string | null;
  secondaryType: string | null;
}

function TypeCoverageSummary({ primaryType, secondaryType }: CoverageSummaryProps) {
  const coverage = useMemo(() => {
    const primaryId = typeNameToId(primaryType);
    const secondaryId = typeNameToId(secondaryType);

    // 进攻端
    const offSuper: { name: string; mult: number }[] = [];
    const offResist: { name: string; mult: number }[] = [];
    const offImmune: { name: string; mult: number }[] = [];

    for (let i = 0; i < TYPE_IDS.length; i++) {
      const defId = TYPE_IDS[i];
      let bestMult = 1;
      if (primaryId) {
        const idx = TYPE_IDS.indexOf(defId);
        if (idx >= 0) bestMult = TYPE_CHART_BY_ID[primaryId][idx];
      }
      if (secondaryId && secondaryId !== primaryId) {
        const idx = TYPE_IDS.indexOf(defId);
        if (idx >= 0) bestMult = Math.max(bestMult, TYPE_CHART_BY_ID[secondaryId][idx]);
      }
      const name = TYPE_OPTIONS[i].nameZh;
      if (bestMult >= 2) offSuper.push({ name, mult: bestMult });
      else if (bestMult > 0 && bestMult < 1) offResist.push({ name, mult: bestMult });
      else if (bestMult === 0) offImmune.push({ name, mult: bestMult });
    }

    // 防守端
    const defWeak: { name: string; mult: number }[] = [];
    const defResist: { name: string; mult: number }[] = [];
    const defImmune: { name: string; mult: number }[] = [];

    for (let i = 0; i < TYPE_IDS.length; i++) {
      const atkId = TYPE_IDS[i];
      const row = TYPE_CHART_BY_ID[atkId];
      let mult = 1;
      if (primaryId) {
        const idx = TYPE_IDS.indexOf(primaryId);
        if (idx >= 0) mult *= row[idx];
      }
      if (secondaryId && secondaryId !== primaryId) {
        const idx = TYPE_IDS.indexOf(secondaryId);
        if (idx >= 0) mult *= row[idx];
      }
      const name = TYPE_OPTIONS[i].nameZh;
      if (mult >= 2) defWeak.push({ name, mult });
      else if (mult > 0 && mult < 1) defResist.push({ name, mult });
      else if (mult === 0) defImmune.push({ name, mult });
    }

    // 按倍率细分：4× 和 2× 分开
    const offSuper4 = offSuper.filter(x => x.mult === 4);
    const offSuper2 = offSuper.filter(x => x.mult === 2);
    const defWeak4 = defWeak.filter(x => x.mult === 4);
    const defWeak2 = defWeak.filter(x => x.mult === 2);
    const defResistQuarter = defResist.filter(x => x.mult === 0.25);
    const defResistHalf = defResist.filter(x => x.mult === 0.5);

    return { offSuper4, offSuper2, offResist, offImmune, defWeak4, defWeak2, defResistQuarter, defResistHalf, defImmune };
  }, [primaryType, secondaryType]);

  if (!primaryType) return null;

  return (
    <div className="type-coverage-summary">
      <h4 className="ov-heading">属性克制</h4>
      <div className="tcs-grid">
        {/* 进攻端 */}
        <div className="tcs-row">
          <span className="tcs-row-label">进攻端</span>
          <div className="tcs-groups">
            {coverage.offSuper4.length > 0 && (
              <div className="tcs-group tcs-bg-super">
                <span className="tcs-group-label tcs-col-super">4×</span>
                <TypeChips items={coverage.offSuper4} />
              </div>
            )}
            {coverage.offSuper2.length > 0 && (
              <div className="tcs-group tcs-bg-super">
                <span className="tcs-group-label tcs-col-super">2×</span>
                <TypeChips items={coverage.offSuper2} />
              </div>
            )}
            {coverage.offResist.length > 0 && (
              <div className="tcs-group tcs-bg-resist">
                <span className="tcs-group-label tcs-col-resist">½×</span>
                <TypeChips items={coverage.offResist} />
              </div>
            )}
            {coverage.offImmune.length > 0 && (
              <div className="tcs-group tcs-bg-immune">
                <span className="tcs-group-label tcs-col-immune">0×</span>
                <TypeChips items={coverage.offImmune} />
              </div>
            )}
          </div>
        </div>

        {/* 防守端 */}
        <div className="tcs-row">
          <span className="tcs-row-label">防守端</span>
          <div className="tcs-groups">
            {coverage.defWeak4.length > 0 && (
              <div className="tcs-group tcs-bg-super">
                <span className="tcs-group-label tcs-col-super">4×</span>
                <TypeChips items={coverage.defWeak4} />
              </div>
            )}
            {coverage.defWeak2.length > 0 && (
              <div className="tcs-group tcs-bg-super">
                <span className="tcs-group-label tcs-col-super">2×</span>
                <TypeChips items={coverage.defWeak2} />
              </div>
            )}
            {coverage.defResistHalf.length > 0 && (
              <div className="tcs-group tcs-bg-resist">
                <span className="tcs-group-label tcs-col-resist">½×</span>
                <TypeChips items={coverage.defResistHalf} />
              </div>
            )}
            {coverage.defResistQuarter.length > 0 && (
              <div className="tcs-group tcs-bg-resist">
                <span className="tcs-group-label tcs-col-resist">¼×</span>
                <TypeChips items={coverage.defResistQuarter} />
              </div>
            )}
            {coverage.defImmune.length > 0 && (
              <div className="tcs-group tcs-bg-immune">
                <span className="tcs-group-label tcs-col-immune">0×</span>
                <TypeChips items={coverage.defImmune} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TypeChips({ items }: { items: { name: string; mult: number }[] }) {
  if (items.length === 0) return <span className="tcs-none">—</span>;
  return (
    <div className="tcs-chips">
      {items.map(({ name }) => (
        <span key={name} className={`type-chip type-${name}`}>
          <img
            className="type-chip-icon"
            src={`${import.meta.env.BASE_URL}assets/type-icons/type-${name}@sm.png`}
            alt=""
          />
          {name}
        </span>
      ))}
    </div>
  );
}

/* ─── Stats Tab ─── */
export default function StatsTab({ detail, display, onDetailGenerationChange, applyPreset }: StatsTabProps) {
  const toast = useToast();
  const stats = display.stats || {};
  const [calcValues, setCalcValues] = useState<CalcValues | null>(null);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [addFeedback, setAddFeedback] = useState<"box" | "team" | "">("");
  const [statMode, setStatMode] = useState<"classic" | "champions">("classic");
  const [controlsNode, setControlsNode] = useState<HTMLDivElement | null>(null);

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
      moves: [] as string[],
      itemId: "",
      itemImageUrl: "",
      abilityId: "",
      imageUrl: img?.url || "",
      shinyImageUrl: display.images?.shinyOfficial?.url || display.images?.shinySprite?.url || "",
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

  const handleAddToTeam = useCallback((team: { members?: Array<{ pokemonId: string; nameZh?: string; slot?: number; [k: string]: unknown }>; [k: string]: unknown }) => {
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
  }, [buildConfig, toast]);

  // 获取当前形态的 statVariants
  const statVariants = display.form?.statVariants || [];
  const hasStatVariants = statVariants.length > 1;

  // 构建世代段切换选项
  const variantButtons = useMemo(() => {
    if (!hasStatVariants) return [];
    return statVariants.map((v, i) => {
      const gs = v.generationStart;
      const ge = v.generationEnd;
      let label: string;
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
    if (gen === undefined) return statVariants.length - 1;
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

  // 点击 variant 按钮时切换世代
  const handleVariantClick = useCallback((variant: { generationStart?: number; generationEnd?: number }) => {
    const targetGen = variant.generationStart || variant.generationEnd || 9;
    onDetailGenerationChange(String(targetGen));
  }, [onDetailGenerationChange]);

  // 计算与另一个 variant 的差异
  const diffStats = useMemo(() => {
    if (!hasStatVariants || activeVariantIndex < 0) return null;
    const otherIndex = activeVariantIndex === statVariants.length - 1
      ? activeVariantIndex - 1
      : activeVariantIndex + 1;
    if (otherIndex < 0 || otherIndex >= statVariants.length) return null;
    const current = statVariants[activeVariantIndex]?.baseStats;
    const other = statVariants[otherIndex]?.baseStats;
    if (!current || !other) return null;
    const diff: Record<string, number> = {};
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

      {/* Heading row: 标题 + 控件全部在一行 */}
      <div className="ov-section">
        <div className="isc-heading-row">
          <h4 className="ov-heading">种族值</h4>
          <div className="isc-mode-toggle">
            <button
              className={`isc-mode-btn ${statMode === "classic" ? "isc-mode-active" : ""}`}
              onClick={statMode === "champions" ? () => setStatMode("classic") : undefined}
            >
              经典
            </button>
            <button
              className={`isc-mode-btn ${statMode === "champions" ? "isc-mode-active" : ""}`}
              onClick={statMode === "classic" ? () => setStatMode("champions") : undefined}
            >
              Champions
            </button>
          </div>
          {/* 性格/等级/预设控件挂载到这里 */}
          <div ref={setControlsNode} className="isc-heading-controls" />
        </div>
        <InlineStatCalculator baseStats={stats} diff={diffStats} mode={statMode} onChange={setCalcValues} controlsPortal={controlsNode} applyPreset={applyPreset} />
      </div>

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

      {/* 属性克制总览 */}
      <TypeCoverageSummary primaryType={display.primaryType || null} secondaryType={display.secondaryType || null} />

      {/* 队伍选择弹窗 */}
      {showTeamPicker && <TeamPickerModal onSelect={handleAddToTeam} onClose={() => setShowTeamPicker(false)} />}
    </div>
  );
}
