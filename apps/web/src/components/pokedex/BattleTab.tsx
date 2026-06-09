import { useCallback, useEffect, useMemo, useState } from "react";
import { unifiedApi } from "../../utils/api.js";
import ExternalImage from "../ExternalImage.tsx";
import TypeChip from "../TypeChip.tsx";
import type { PokemonUsageData, PokemonUsageSpread, ChampionsSeasonSummary } from "@pokemon-localdex/store-types";
import { STAT_KEYS, STAT_LABELS_SHORT } from "@pokemon-localdex/store-types/constants";

// ─── Types ───

interface BattleTabProps {
  pokemonId: number;
  formId?: number | null;
  championsSeasonId: string;
  battleFormat: "double" | "single";
  championsSeasons: ChampionsSeasonSummary[];
  onApplyToCalc?: (nature: string, sps: Record<string, number>) => void;
  onSearchMove?: (moveName: string) => void;
  /**
   * 点击队友时的页面内导航回调（优先于 hash 跳转，避免 hash 未变化时 hashchange 不触发）。
   * formId 用于在 usage 形态级列表中精确定位到队友的具体形态卡。
   */
  onSelectPokemon?: (pokemonId: number, formId?: number) => void;
}

interface SeasonOption {
  value: string;
  label: string;
}

// ─── Helpers ───

function formatUsage(usage: number): string {
  return `${usage.toFixed(1)}%`;
}

function formatSeasonLabel(season: ChampionsSeasonSummary): string {
  const parts = [season.seasonCode, season.regulationCode];
  if (season.regulationName && season.regulationName !== season.regulationCode) {
    parts.push(season.regulationName);
  }
  return parts.filter(Boolean).join(" · ");
}

// 饼图颜色（多色系，柔和明亮）
const PIE_COLORS = [
  "#F87171", "#60A5FA", "#6EE7B7", "#FCD34D", "#A78BFA",
  "#F9A8D4", "#67E8F9", "#FDBA74", "#A5B4FC", "#5EEAD4",
  "#FCA5A5", "#BEF264",
];

// ─── Pie Chart (SVG) ───

interface PieSliceData {
  nameZh: string;
  usage: number;
}

function PieChart({ data }: { data: PieSliceData[] }) {
  const total = data.reduce((sum, d) => sum + d.usage, 0);
  if (total === 0) return <div className="btd-pie-empty" />;

  let cumulative = 0;
  const slices: { startAngle: number; endAngle: number; color: string; label: string; usage: number }[] = [];

  for (let i = 0; i < data.length; i++) {
    const fraction = data[i].usage / total;
    const startAngle = cumulative * 360;
    cumulative += fraction;
    const endAngle = cumulative * 360;
    slices.push({
      startAngle, endAngle,
      color: PIE_COLORS[i % PIE_COLORS.length],
      label: data[i].nameZh,
      usage: data[i].usage,
    });
  }

  return (
    <svg className="btd-pie" viewBox="0 0 100 100">
      {slices.map((slice, i) => {
        const tooltip = `${slice.label}  ${slice.usage.toFixed(1)}%`;
        if (slice.endAngle - slice.startAngle >= 359.99) {
          return (
            <circle key={i} cx="50" cy="50" r="45" fill={slice.color}>
              <title>{tooltip}</title>
            </circle>
          );
        }
        const startRad = ((slice.startAngle - 90) * Math.PI) / 180;
        const endRad = ((slice.endAngle - 90) * Math.PI) / 180;
        const x1 = 50 + 45 * Math.cos(startRad);
        const y1 = 50 + 45 * Math.sin(startRad);
        const x2 = 50 + 45 * Math.cos(endRad);
        const y2 = 50 + 45 * Math.sin(endRad);
        const largeArc = slice.endAngle - slice.startAngle > 180 ? 1 : 0;
        const d = `M50,50 L${x1},${y1} A45,45 0 ${largeArc},1 ${x2},${y2} Z`;
        return (
          <path key={i} d={d} fill={slice.color}>
            <title>{tooltip}</title>
          </path>
        );
      })}
    </svg>
  );
}

// ─── Main Component ───

export default function BattleTab({
  pokemonId,
  formId,
  championsSeasonId,
  battleFormat,
  championsSeasons,
  onApplyToCalc,
  onSearchMove,
  onSelectPokemon,
}: BattleTabProps) {
  const [usageData, setUsageData] = useState<PokemonUsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inlineSeasonId, setInlineSeasonId] = useState("");
  const [inlineFormat, setInlineFormat] = useState<"double" | "single">("double");

  const effectiveSeasonId = championsSeasonId || inlineSeasonId;
  const effectiveFormat = championsSeasonId ? battleFormat : inlineFormat;

  const seasonOptions = useMemo<SeasonOption[]>(() => {
    return [
      { value: "", label: "选择赛季…" },
      ...championsSeasons.map((s) => ({
        value: String(s.id),
        label: formatSeasonLabel(s),
      })),
    ];
  }, [championsSeasons]);

  useEffect(() => {
    if (!effectiveSeasonId) {
      setUsageData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ seasonId: effectiveSeasonId, format: effectiveFormat });
    if (formId) params.set("formId", String(formId));
    unifiedApi<PokemonUsageData>(
      `/pokemon/${pokemonId}/usage?${params.toString()}`
    )
      .then((r) => {
        if (!cancelled) { setUsageData(r.data); setLoading(false); }
      })
      .catch((err) => {
        if (!cancelled) { setUsageData(null); setError(err?.message || "暂无对战数据"); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [pokemonId, formId, effectiveSeasonId, effectiveFormat]);

  const handleApplyNature = useCallback((natureName: string) => {
    if (!onApplyToCalc) return;
    onApplyToCalc(natureName, {});
  }, [onApplyToCalc]);

  const handleApplySpread = useCallback((spread: PokemonUsageSpread) => {
    if (!onApplyToCalc) return;
    // pokechamdb 数据本身就是 SP 值（0-32），直接传递
    onApplyToCalc("", {
      hp: spread.hp, atk: spread.atk, def: spread.def,
      spa: spread.spa, spd: spread.spd, spe: spread.spe,
    });
  }, [onApplyToCalc]);

  // ─── Inline Season Selector ───
  const showInlineSelector = !championsSeasonId;

  if (showInlineSelector && !effectiveSeasonId) {
    return (
      <div className="btd-container">
        <div className="btd-season-picker">
          <p className="btd-hint">请选择赛季以查看对战数据</p>
          <div className="btd-inline-controls">
            <select
              className="btd-season-select"
              value={inlineSeasonId}
              onChange={(e) => setInlineSeasonId(e.target.value)}
            >
              {seasonOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="btd-format-toggle">
              <button
                className={`btd-format-btn ${inlineFormat === "double" ? "btd-format-active" : ""}`}
                onClick={() => setInlineFormat("double")}
              >双打</button>
              <button
                className={`btd-format-btn ${inlineFormat === "single" ? "btd-format-active" : ""}`}
                onClick={() => setInlineFormat("single")}
              >单打</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="btd-container"><div className="btd-loading">加载对战数据…</div></div>;
  }

  if (error || !usageData) {
    return (
      <div className="btd-container">
        {showInlineSelector && (
          <div className="btd-inline-controls btd-inline-controls-top">
            <select className="btd-season-select" value={inlineSeasonId} onChange={(e) => setInlineSeasonId(e.target.value)}>
              {seasonOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div className="btd-format-toggle">
              <button className={`btd-format-btn ${inlineFormat === "double" ? "btd-format-active" : ""}`} onClick={() => setInlineFormat("double")}>双打</button>
              <button className={`btd-format-btn ${inlineFormat === "single" ? "btd-format-active" : ""}`} onClick={() => setInlineFormat("single")}>单打</button>
            </div>
          </div>
        )}
        <div className="btd-empty">{error || "该宝可梦在当前赛季暂无对战数据"}</div>
      </div>
    );
  }

  return (
    <div className="btd-container">
      {/* 顶部信息栏 */}
      <div className="btd-header">
        <span className="btd-rank">使用率排名 #{usageData.rank}</span>
        <span className="btd-season-info">
          {usageData.seasonCode} · {usageData.regulationCode} · {usageData.format === "double" ? "双打" : "单打"}
        </span>
        {showInlineSelector && (
          <div className="btd-inline-controls btd-inline-controls-compact">
            <select className="btd-season-select btd-season-select-sm" value={inlineSeasonId} onChange={(e) => setInlineSeasonId(e.target.value)}>
              {seasonOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div className="btd-format-toggle">
              <button className={`btd-format-btn btd-format-btn-sm ${inlineFormat === "double" ? "btd-format-active" : ""}`} onClick={() => setInlineFormat("double")}>双打</button>
              <button className={`btd-format-btn btd-format-btn-sm ${inlineFormat === "single" ? "btd-format-active" : ""}`} onClick={() => setInlineFormat("single")}>单打</button>
            </div>
          </div>
        )}
      </div>

      {/* 卡片网格（4列） */}
      <div className="btd-cards">
        {/* 第一行：招式、道具、特性、性格（各占 1 格） */}
        {usageData.moves.length > 0 && (
          <div className="btd-card">
            <div className="btd-card-header">
              <span className="btd-card-label">MOVES</span>
              <span className="btd-card-title">招式</span>
            </div>
            <PieChart data={usageData.moves} />
            <ul className="btd-card-list">
              {usageData.moves.map((move, i) => (
                <li key={move.rank} className="btd-card-item">
                  {move.type && <TypeChip type={move.type} iconOnly />}
                  <span
                    className={`btd-card-item-name ${onSearchMove ? "btd-link" : ""}`}
                    onClick={onSearchMove ? () => onSearchMove(move.nameZh) : undefined}
                  >
                    {move.nameZh}
                  </span>
                  <span className="btd-card-item-usage">{formatUsage(move.usage)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {usageData.items.length > 0 && (
          <div className="btd-card">
            <div className="btd-card-header">
              <span className="btd-card-label">ITEMS</span>
              <span className="btd-card-title">道具</span>
            </div>
            <PieChart data={usageData.items} />
            <ul className="btd-card-list">
              {usageData.items.map((item, i) => (
                <li key={item.rank} className="btd-card-item">
                  <ExternalImage className="btd-item-icon" src={item.imageUrl} alt={item.nameZh} loading="lazy" />
                  <a
                    className="btd-card-item-name btd-link"
                    href={item.id ? `#/items?expand=${item.id}` : "#/items"}
                    title={item.nameZh}
                  >
                    {item.nameZh}
                  </a>
                  <span className="btd-card-item-usage">{formatUsage(item.usage)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {usageData.abilities.length > 0 && (
          <div className="btd-card">
            <div className="btd-card-header">
              <span className="btd-card-label">ABILITY</span>
              <span className="btd-card-title">特性</span>
            </div>
            <PieChart data={usageData.abilities} />
            <ul className="btd-card-list">
              {usageData.abilities.map((ab, i) => (
                <li key={ab.rank} className="btd-card-item">
                  <span className="btd-color-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="btd-card-item-name">{ab.nameZh}</span>
                  <span className="btd-card-item-usage">{formatUsage(ab.usage)}</span>
                </li>
              ))}
              {/* 虚拟占位元素，使间距与 10 条数据的卡片一致 */}
              {Array.from({ length: 10 - usageData.abilities.length }, (_, i) => (
                <li key={`placeholder-${i}`} className="btd-card-item btd-card-item-placeholder" aria-hidden="true" />
              ))}
            </ul>
          </div>
        )}

        {usageData.natures.length > 0 && (
          <div className="btd-card">
            <div className="btd-card-header">
              <span className="btd-card-label">NATURE</span>
              <span className="btd-card-title">性格</span>
            </div>
            <PieChart data={usageData.natures} />
            <ul className="btd-card-list">
              {usageData.natures.map((nat, i) => (
                <li key={nat.rank} className="btd-card-item btd-card-item-nature">
                  <span className="btd-color-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="btd-card-item-name">
                    {nat.nameZh}
                  </span>
                  <span className="btd-card-item-usage">{formatUsage(nat.usage)}</span>
                  {onApplyToCalc && (
                    <button className="btd-apply-btn" onClick={() => handleApplyNature(nat.nameZh)} title="应用到能力值计算">
                      应用
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 第二行：队友占 1 格 + 能力点分配占 3 格 */}
        {usageData.teammates.length > 0 && (
          <div className="btd-card">
            <div className="btd-card-header">
              <span className="btd-card-label">PARTNER</span>
              <span className="btd-card-title">队友</span>
            </div>
            <ul className="btd-card-list btd-partner-list">
              {usageData.teammates.map((tm) => (
                <li key={tm.rank} className="btd-card-item btd-partner-item">
                  <ExternalImage className="btd-partner-icon" src={tm.iconUrl} alt={tm.nameZh} loading="lazy" />
                  <a
                    className="btd-card-item-name btd-link"
                    href={tm.pokemonId ? `#/pokemon?id=${tm.pokemonId}` : "#/pokedex"}
                    title={tm.nameZh}
                    onClick={(e) => {
                      if (tm.pokemonId && onSelectPokemon) {
                        e.preventDefault();
                        onSelectPokemon(tm.pokemonId, tm.formId ?? undefined);
                      }
                    }}
                  >
                    {tm.nameZh}
                  </a>
                  <span className="btd-partner-rank">#{tm.rank}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 努力值分配（占 3 格） */}
        {usageData.spreads.length > 0 && (
          <div className="btd-card btd-card-spreads btd-card-wide">
            <div className="btd-card-header">
              <span className="btd-card-label">SP SPREADS</span>
              <span className="btd-card-title">能力点分配</span>
            </div>
            <div className="btd-spreads-list">
              {usageData.spreads.map((spread) => (
                <div key={spread.rank} className="btd-spread-row">
                  <div className="btd-spread-stats">
                    {STAT_KEYS.map((key) => (
                      <span key={key} className={`btd-spread-stat ${(spread[key as keyof PokemonUsageSpread] as number) > 0 ? "btd-spread-stat-active" : ""}`}>
                        <span className="btd-spread-label">{STAT_LABELS_SHORT[key]}</span>
                        <span className="btd-spread-value">{spread[key as keyof PokemonUsageSpread] as number}</span>
                      </span>
                    ))}
                  </div>
                  <span className="btd-spread-usage">{formatUsage(spread.usage)}</span>
                  {onApplyToCalc && (
                    <button className="btd-apply-btn" onClick={() => handleApplySpread(spread)} title="应用到能力值计算">
                      应用
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
