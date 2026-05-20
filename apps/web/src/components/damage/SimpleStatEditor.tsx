import { useMemo } from "react";
import { STAT_KEYS, STAT_LABELS } from "@pokemon-localdex/store-types/constants";
import type { StatKey, StatBlock, PokemonEntry } from "@pokemon-localdex/store-types";
import { getStatValue } from "@pokemon-localdex/store-types";
import type { PokemonConfigDraft } from "../../utils/teamStorage.js";
import { calculateFinalStat } from "../../utils/helpers.js";
import { BOOST_STATS, DEFAULT_BOOSTS, EV_MAX, EV_TOTAL_MAX, IV_MAX, SP_MAX } from "./damageConstants.js";
import type { BoostKey } from "./damageConstants.js";

//  子组件：简化能力值编辑器（无进度条）
// ══════════════════════════════════════════════════════════════

export interface SimpleStatEditorProps {
  member: PokemonConfigDraft;
  detail: PokemonEntry | null;
  isChampions: boolean;
  onChange: (member: PokemonConfigDraft) => void;
  boosts: Record<string, number>;
  onBoostChange: (key: BoostKey, value: number) => void;
  level: number;
}

export default function SimpleStatEditor({ member, detail, isChampions, onChange, boosts, onBoostChange, level }: SimpleStatEditorProps) {
  const baseStats = detail?.baseStats;
  // 使用共享等级覆盖 member.level
  const memberWithLevel = useMemo<PokemonConfigDraft>(() => ({ ...member, level: level || member.level || 50 }), [member, level]);

  const handleStatChange = (key: StatKey, value: string) => {
    if (isChampions) {
      const sps: Partial<StatBlock> = { ...(member.sps || {}), [key]: Math.max(0, Math.min(SP_MAX, Number(value) || 0)) };
      onChange({ ...member, sps });
    } else {
      const evs: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...member.evs, [key]: Math.max(0, Math.min(EV_MAX, Number(value) || 0)) };
      onChange({ ...member, evs });
    }
  };

  const handleIvChange = (key: StatKey, value: string) => {
    const ivs: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, ...member.ivs, [key]: Math.max(0, Math.min(IV_MAX, Number(value) || 0)) };
    onChange({ ...member, ivs });
  };

  const evTotal = isChampions ? 0 : STAT_KEYS.reduce((s: number, k) => s + getStatValue(member.evs, k), 0);

  return (
    <div className={"dc-stat-editor" + (isChampions ? " dc-stat-champions" : "")}>
      <div className="dc-stat-header-row">
        <span className="dc-stat-col-label">能力</span>
        <span className="dc-stat-col-base">种族</span>
        {!isChampions && <span className="dc-stat-col-iv">个体</span>}
        <span className="dc-stat-col-ev">{isChampions ? "SP" : "努力"}</span>
        <span className="dc-stat-col-final">实际</span>
        <span className="dc-stat-col-boost">等级</span>
      </div>
      {STAT_KEYS.map((key) => {
        const k = key;
        const base = getStatValue(baseStats, k);
        const iv = getStatValue(member.ivs, k) || 31;
        const sp = getStatValue(member.sps, k);
        const ev = getStatValue(member.evs, k);
        const final = calculateFinalStat(memberWithLevel, detail ?? undefined, k);
        const isBoostable = (BOOST_STATS as readonly string[]).includes(key);
        return (
          <div key={key} className="dc-stat-row">
            <span className="dc-stat-col-label">{STAT_LABELS[key]}</span>
            <span className="dc-stat-col-base">{base}</span>
            {!isChampions && (
              <input
                className="dc-stat-input dc-stat-col-iv"
                type="number"
                min={0}
                max={IV_MAX}
                value={iv}
                onChange={(e) => handleIvChange(k, e.target.value)}
              />
            )}
            <input
              className="dc-stat-input dc-stat-col-ev"
              type="number"
              min={0}
              max={isChampions ? SP_MAX : EV_MAX}
              value={isChampions ? sp : ev}
              onChange={(e) => handleStatChange(k, e.target.value)}
            />
            <span className={"dc-stat-col-final" + (final ? "" : " dc-stat-na")}>{final ?? "—"}</span>
            {/* 能力等级：HP 无增减，显示占位 */}
            {isBoostable ? (
              <span className="dc-stat-col-boost dc-boost-inline">
                <button
                  className="dc-boost-btn-sm"
                  disabled={(boosts?.[key] || 0) <= -6}
                  onClick={() => onBoostChange(k as BoostKey, (boosts?.[key] || 0) - 1)}
                >−</button>
                <span className={"dc-boost-val" + ((boosts?.[key] || 0) > 0 ? " dc-boost-pos" : (boosts?.[key] || 0) < 0 ? " dc-boost-neg" : "")}>
                  {(boosts?.[key] || 0) > 0 ? "+" : ""}{boosts?.[key] || 0}
                </span>
                <button
                  className="dc-boost-btn-sm"
                  disabled={(boosts?.[key] || 0) >= 6}
                  onClick={() => onBoostChange(k as BoostKey, (boosts?.[key] || 0) + 1)}
                >+</button>
              </span>
            ) : (
              <span className="dc-stat-col-boost dc-boost-inline dc-boost-placeholder">—</span>
            )}
          </div>
        );
      })}
      {!isChampions && (
        <div className="dc-stat-total">
          努力值合计: <strong>{evTotal}</strong> / {EV_TOTAL_MAX}
          {evTotal > EV_TOTAL_MAX && <span className="dc-stat-over"> (超出!)</span>}
        </div>
      )}
      {Object.values(boosts || DEFAULT_BOOSTS).some((v) => v !== 0) && (
        <button className="dc-boost-reset" onClick={() => { BOOST_STATS.forEach((k) => onBoostChange(k, 0)); }}>重置等级</button>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
