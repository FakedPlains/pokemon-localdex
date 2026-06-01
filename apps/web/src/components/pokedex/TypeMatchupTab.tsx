import { useMemo } from "react";
import {
  TYPE_OPTIONS,
  TYPE_CHART_BY_ID,
  TYPE_IDS,
  typeNameToId,
} from "@pokemon-localdex/store-types/constants";
import type { TypeOption } from "@pokemon-localdex/store-types/constants";

// ─── Types ───

interface MatchupEntry {
  type: TypeOption;
  mult: number;
}

interface DisplayProp {
  primaryType: string | null;
  secondaryType: string | null;
}

interface TypeMatchupTabProps {
  display: DisplayProp;
}

interface MatchupSectionProps {
  title: string;
  matchups: MatchupEntry[];
  isOffensive: boolean;
  sortedMults: number[];
}

// ─── Matchup Calculation ───

/**
 * 计算攻击面：当前宝可梦拥有的属性作为攻击属性时，对各防守属性的最佳倍率。
 * 对于双属性宝可梦，取两个属性中较高的倍率作为最终进攻效果。
 */
function calcOffensiveMatchups(
  primaryType: string | null,
  secondaryType: string | null
): MatchupEntry[] {
  const primaryId = typeNameToId(primaryType);
  const secondaryId = typeNameToId(secondaryType);

  const results: MatchupEntry[] = [];

  for (let i = 0; i < TYPE_IDS.length; i++) {
    const defId = TYPE_IDS[i];
    const defOption = TYPE_OPTIONS[i];

    let bestMult = 1;
    if (primaryId) {
      const row = TYPE_CHART_BY_ID[primaryId];
      const idx = TYPE_IDS.indexOf(defId);
      if (idx >= 0) bestMult = row[idx];
    }
    if (secondaryId && secondaryId !== primaryId) {
      const row = TYPE_CHART_BY_ID[secondaryId];
      const idx = TYPE_IDS.indexOf(defId);
      if (idx >= 0) bestMult = Math.max(bestMult, row[idx]);
    }

    results.push({ type: defOption, mult: bestMult });
  }

  return results;
}

/**
 * 计算防御面：各攻击属性对当前宝可梦（考虑双属性）的倍率。
 * 双属性时倍率相乘（如 4x、0.25x）。
 */
function calcDefensiveMatchups(
  primaryType: string | null,
  secondaryType: string | null
): MatchupEntry[] {
  const primaryId = typeNameToId(primaryType);
  const secondaryId = typeNameToId(secondaryType);

  const results: MatchupEntry[] = [];

  for (let i = 0; i < TYPE_IDS.length; i++) {
    const atkId = TYPE_IDS[i];
    const atkOption = TYPE_OPTIONS[i];
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

    results.push({ type: atkOption, mult });
  }

  return results;
}

// ─── Helpers ───

function groupByMult(matchups: MatchupEntry[]): Record<number, TypeOption[]> {
  const groups: Record<number, TypeOption[]> = {};
  for (const item of matchups) {
    const key = item.mult;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item.type);
  }
  return groups;
}

function multLabel(mult: number): string {
  if (mult === 4) return "4×";
  if (mult === 2) return "2×";
  if (mult === 1) return "1×";
  if (mult === 0.5) return "½×";
  if (mult === 0.25) return "¼×";
  if (mult === 0) return "0×";
  return `${mult}×`;
}

function multSemanticClass(mult: number, isOffensive: boolean): string {
  if (isOffensive) {
    if (mult >= 2) return "matchup-super";
    if (mult < 1 && mult > 0) return "matchup-resist";
    if (mult === 0) return "matchup-immune";
    return "";
  }
  // 防御面：倍率高=弱点
  if (mult >= 2) return "matchup-weak";
  if (mult < 1 && mult > 0) return "matchup-resist";
  if (mult === 0) return "matchup-immune";
  return "";
}

// ─── Sub-components ───

function MatchupSection({ title, matchups, isOffensive, sortedMults }: MatchupSectionProps) {
  const grouped = useMemo(() => groupByMult(matchups), [matchups]);

  // 过滤掉 1x 的（普通效果）
  const significantMults = sortedMults.filter((m) => m !== 1 && grouped[m]);

  if (significantMults.length === 0) {
    return (
      <div className="matchup-section">
        <h4 className="matchup-section-title">{title}</h4>
        <p className="matchup-empty">无特殊克制关系</p>
      </div>
    );
  }

  return (
    <div className="matchup-section">
      <h4 className="matchup-section-title">{title}</h4>
      <div className="matchup-groups">
        {significantMults.map((mult) => {
          const types = grouped[mult];
          if (!types || types.length === 0) return null;
          return (
            <div key={mult} className={`matchup-group ${multSemanticClass(mult, isOffensive)}`}>
              <span className="matchup-mult-label">{multLabel(mult)}</span>
              <div className="matchup-type-list">
                {types.map((t) => (
                  <span key={t.id} className={`type-chip type-${t.nameZh}`}>
                    <img
                      className="type-chip-icon"
                      src={`${import.meta.env.BASE_URL}assets/type-icons/type-${t.nameZh}@sm.png`}
                      alt=""
                    />
                    {t.nameZh}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───

export default function TypeMatchupTab({ display }: TypeMatchupTabProps) {
  const primaryType = display.primaryType;
  const secondaryType = display.secondaryType;

  const offensiveMatchups = useMemo(
    () => calcOffensiveMatchups(primaryType, secondaryType),
    [primaryType, secondaryType]
  );

  const defensiveMatchups = useMemo(
    () => calcDefensiveMatchups(primaryType, secondaryType),
    [primaryType, secondaryType]
  );

  const offensiveMults = useMemo(() => {
    const set = new Set(offensiveMatchups.map((m) => m.mult));
    return [...set].sort((a, b) => b - a);
  }, [offensiveMatchups]);

  const defensiveMults = useMemo(() => {
    const set = new Set(defensiveMatchups.map((m) => m.mult));
    return [...set].sort((a, b) => b - a);
  }, [defensiveMatchups]);

  return (
    <div className="tab-matchup">
      <MatchupSection
        title="攻击面（使用本属性招式攻击）"
        matchups={offensiveMatchups}
        isOffensive={true}
        sortedMults={offensiveMults}
      />
      <MatchupSection
        title="防御面（被对方招式攻击）"
        matchups={defensiveMatchups}
        isOffensive={false}
        sortedMults={defensiveMults}
      />
    </div>
  );
}
