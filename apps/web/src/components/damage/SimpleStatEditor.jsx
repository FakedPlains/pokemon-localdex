import { useMemo } from "react";
import { STAT_KEYS, STAT_LABELS } from "@pokemon-localdex/store-types/constants";
import { calculateFinalStat, getNatureMultiplier } from "../../utils/helpers.js";
import { BOOST_STATS, DEFAULT_BOOSTS, EV_MAX, EV_TOTAL_MAX, IV_MAX, SP_MAX, SP_TOTAL_MAX } from "./damageConstants.js";

//  子组件：简化能力值编辑器（含性格指示 + 努力值上限）
// ══════════════════════════════════════════════════════════════

export default function SimpleStatEditor({ member, detail, isChampions, onChange, boosts, onBoostChange, level }) {
  const baseStats = detail?.baseStats || {};
  // 使用共享等级覆盖 member.level
  const memberWithLevel = useMemo(() => ({ ...member, level: level || member.level || 50 }), [member, level]);

  const nature = isChampions ? (member.champNature || member.nature || "认真") : (member.nature || "认真");

  const handleStatChange = (key, value) => {
    if (isChampions) {
      const raw = Math.max(0, Math.min(SP_MAX, Number(value) || 0));
      const oldSps = member.sps || {};
      const othersTotal = STAT_KEYS.reduce((s, k) => s + (k === key ? 0 : (oldSps[k] || 0)), 0);
      // clamp: 单项不超 SP_MAX，总量不超 SP_TOTAL_MAX
      const clamped = Math.min(raw, SP_TOTAL_MAX - othersTotal);
      const sps = { ...oldSps, [key]: Math.max(0, clamped) };
      onChange({ ...member, sps });
    } else {
      const raw = Math.max(0, Math.min(EV_MAX, Number(value) || 0));
      const oldEvs = member.evs || {};
      const othersTotal = STAT_KEYS.reduce((s, k) => s + (k === key ? 0 : (oldEvs[k] || 0)), 0);
      // clamp: 单项不超 252，总量不超 510
      const clamped = Math.min(raw, EV_TOTAL_MAX - othersTotal);
      const evs = { ...oldEvs, [key]: Math.max(0, clamped) };
      onChange({ ...member, evs });
    }
  };

  const handleIvChange = (key, value) => {
    const ivs = { ...(member.ivs || {}), [key]: Math.max(0, Math.min(IV_MAX, Number(value) || 0)) };
    onChange({ ...member, ivs });
  };

  const evTotal = isChampions
    ? STAT_KEYS.reduce((s, k) => s + (member.sps?.[k] || 0), 0)
    : STAT_KEYS.reduce((s, k) => s + (member.evs?.[k] || 0), 0);
  const totalMax = isChampions ? SP_TOTAL_MAX : EV_TOTAL_MAX;

  return (
    <div className={"dc-stat-editor" + (isChampions ? " dc-stat-champions" : "")}>
      <div className="dc-stat-header-row">
        <span className="dc-stat-col-label">能力</span>
        <span className="dc-stat-col-base">种族</span>
        {!isChampions && <span className="dc-stat-col-iv">个体</span>}
        <span className="dc-stat-col-ev">{isChampions ? "SP" : "努力"}</span>
        <span className="dc-stat-col-nature">性格</span>
        <span className="dc-stat-col-final">实际</span>
        <span className="dc-stat-col-boost">等级</span>
      </div>
      {STAT_KEYS.map((key) => {
        const base = baseStats[key] || 0;
        const iv = member.ivs?.[key] ?? 31;
        const sp = member.sps?.[key] || 0;
        const ev = member.evs?.[key] || 0;
        const final = calculateFinalStat(memberWithLevel, detail, key);
        const isBoostable = BOOST_STATS.includes(key);

        // 性格加成指示
        const mult = key === "hp" ? 1 : getNatureMultiplier(nature, key);
        const natureLabel = mult > 1 ? "↑1.1" : mult < 1 ? "↓0.9" : "—";
        const natureClass = mult > 1 ? "dc-nature-up" : mult < 1 ? "dc-nature-down" : "dc-nature-neutral";

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
                onChange={(e) => handleIvChange(key, e.target.value)}
              />
            )}
            <input
              className="dc-stat-input dc-stat-col-ev"
              type="number"
              min={0}
              max={isChampions ? SP_MAX : EV_MAX}
              value={isChampions ? sp : ev}
              onChange={(e) => handleStatChange(key, e.target.value)}
            />
            <span className={`dc-stat-col-nature ${natureClass}`}>{natureLabel}</span>
            <span className={"dc-stat-col-final" + (final ? "" : " dc-stat-na")}>{final ?? "—"}</span>
            {/* 能力等级：HP 无增减，显示占位 */}
            {isBoostable ? (
              <span className="dc-stat-col-boost dc-boost-inline">
                <button
                  className="dc-boost-btn-sm"
                  disabled={(boosts?.[key] || 0) <= -6}
                  onClick={() => onBoostChange(key, (boosts?.[key] || 0) - 1)}
                >−</button>
                <span className={"dc-boost-val" + ((boosts?.[key] || 0) > 0 ? " dc-boost-pos" : (boosts?.[key] || 0) < 0 ? " dc-boost-neg" : "")}>
                  {(boosts?.[key] || 0) > 0 ? "+" : ""}{boosts?.[key] || 0}
                </span>
                <button
                  className="dc-boost-btn-sm"
                  disabled={(boosts?.[key] || 0) >= 6}
                  onClick={() => onBoostChange(key, (boosts?.[key] || 0) + 1)}
                >+</button>
              </span>
            ) : (
              <span className="dc-stat-col-boost dc-boost-inline dc-boost-placeholder">—</span>
            )}
          </div>
        );
      })}
      <div className="dc-stat-total">
        {isChampions ? "SP" : "努力值"}合计: <strong>{evTotal}</strong> / {totalMax}
        {evTotal >= totalMax && <span className="dc-stat-full"> (已满)</span>}
      </div>
      {Object.values(boosts || DEFAULT_BOOSTS).some((v) => v !== 0) && (
        <button className="dc-boost-reset" onClick={() => { BOOST_STATS.forEach((k) => onBoostChange(k, 0)); }}>重置等级</button>
      )}
    </div>
  );
}
