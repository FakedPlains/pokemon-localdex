import { useCallback, useMemo, useState } from "react";
import { STAT_KEYS } from "@pokemon-localdex/store-types/constants";
import type { PokemonEntry, StatBlock, FormStatVariant, ImageAsset } from "@pokemon-localdex/store-types";
import type { PokemonDisplayVariant, ResolvedForm } from "../../utils/helpers";
import { getPokemonPreviewImage } from "../../utils/helpers";
import { saveBoxConfig, saveTeam, isTeamMemberRef } from "../../utils/teamStorage";
import type { Team, PokemonConfig, TeamMemberInline } from "../../utils/teamStorage";
import { useToast } from "../Toast";
import StatCalculator from "../StatCalculator";
import BaseStatBars from "./BaseStatBars";
import TeamPickerModal from "./TeamPickerModal";

export interface StatsTabProps {
  detail: PokemonEntry;
  display: PokemonDisplayVariant;
  detailGeneration: number | string;
  onDetailGenerationChange: (gen: string) => void;
}

interface CalcValues {
  level?: number;
  nature?: string;
  ivs?: Partial<StatBlock>;
  evs?: Partial<StatBlock>;
  statMode?: string;
  sps?: Partial<StatBlock>;
  champNature?: string;
}

/* ─── Stats Tab ─── */
export default function StatsTab({ detail, display, detailGeneration: _detailGeneration, onDetailGenerationChange }: StatsTabProps) {
  const toast = useToast();
  const stats = display.stats || {};
  const [calcValues, setCalcValues] = useState<CalcValues | null>(null);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [addFeedback, setAddFeedback] = useState<string>(""); // "box" | "team" | ""

  // 构建当前宝可梦配置数据
  const buildConfig = useCallback(() => {
    const img = getPokemonPreviewImage(detail as Parameters<typeof getPokemonPreviewImage>[0]);
    const imageSrc = typeof img === "string" ? img : undefined;
    const resolveImageUrl = (val: ImageAsset | string | undefined): string => {
      if (!val) return "";
      if (typeof val === "string") return val;
      return val.url || "";
    };
    const defaultIvs: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
    const defaultEvs: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    const defaultSps: Partial<StatBlock> = {};
    return {
      configId: "",
      pokemonId: String(detail.id),
      nameZh: display.form?.nameZh || detail.nameZh || "",
      level: calcValues?.level || 50,
      nature: calcValues?.nature || "认真",
      ivs: calcValues?.ivs ? { ...defaultIvs, ...calcValues.ivs } : defaultIvs,
      evs: calcValues?.evs ? { ...defaultEvs, ...calcValues.evs } : defaultEvs,
      statMode: calcValues?.statMode || "classic",
      sps: calcValues?.sps || defaultSps,
      champNature: calcValues?.champNature || "认真",
      moves: ["", "", "", ""] as [string, string, string, string],
      itemId: "",
      itemName: "",
      itemImageUrl: "",
      abilityId: "",
      abilityName: "",
      imageUrl: imageSrc || "",
      shinyImageUrl: resolveImageUrl(display.images?.shinyOfficial) || resolveImageUrl(display.images?.shinySprite),
      isShiny: false,
      primaryType: display.primaryType || "",
      secondaryType: display.secondaryType || "",
      baseStats: stats as StatBlock,
      createdAt: 0,
      updatedAt: 0,
    } satisfies PokemonConfig;
  }, [detail, display, stats, calcValues]);

  const handleAddToBox = useCallback(() => {
    const config = buildConfig();
    saveBoxConfig(config);
    setAddFeedback("box");
    setTimeout(() => setAddFeedback(""), 2000);
  }, [buildConfig]);

  const handleAddToTeam = useCallback((team: Team) => {
    const config = buildConfig();
    const members = [...(team.members || [])];
    if (members.length >= 6) {
      toast.error("该队伍已有 6 只宝可梦，无法继续添加。");
      return;
    }
    const duplicate = members.find((m) => !isTeamMemberRef(m) && m.pokemonId === config.pokemonId);
    if (duplicate) {
      toast.error(`该队伍中已存在「${config.nameZh || config.pokemonId}」，不能重复添加同一宝可梦。`);
      return;
    }
    const slot = members.length + 1;
    const member: TeamMemberInline = { ...config, slot };
    members.push(member);
    saveTeam({ ...team, members });
    setShowTeamPicker(false);
    setAddFeedback("team");
    setTimeout(() => setAddFeedback(""), 2000);
  }, [buildConfig, toast]);

  // 获取当前形态的 statVariants
  const currentForm: ResolvedForm & { statVariants?: FormStatVariant[] } = display.form || {};
  const statVariants = (currentForm.statVariants || []) as FormStatVariant[];
  const hasStatVariants = statVariants.length > 1;

  // 构建世代段切换选项：每个 variant 对应一个按钮
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
    for (let i = 0; i < statVariants.length; i++) {
      const v = statVariants[i]!;
      const gs = v.generationStart;
      const ge = v.generationEnd;
      if (gs && ge && gen !== undefined && gen >= gs && gen <= ge) return i;
      if (gs && !ge && gen !== undefined && gen >= gs) return i;
      if (!gs && ge && gen !== undefined && gen <= ge) return i;
      if (!gs && !ge) return i;
    }
    return statVariants.length - 1;
  }, [statVariants, hasStatVariants, display.generation]);

  // 点击 variant 按钮时，设置一个属于该范围的世代
  const handleVariantClick = useCallback((variant: FormStatVariant) => {
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
    const diff: Partial<StatBlock> = {};
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
        <StatCalculator baseStats={stats as StatBlock} onChange={setCalcValues as (v: CalcValues | null) => void} />

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
