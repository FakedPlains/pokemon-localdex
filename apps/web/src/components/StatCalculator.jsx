import { useState, useMemo, useCallback } from "react";
import { STAT_KEYS, NATURE_OPTIONS, NATURE_EFFECTS } from "../utils/constants.js";
import { getNatureMultiplier } from "../utils/helpers.js";

const STAT_LABELS = { hp: "HP", atk: "攻击", def: "防御", spa: "特攻", spd: "特防", spe: "速度" };
const STAT_LABELS_SHORT = { hp: "HP", atk: "攻", def: "防", spa: "特攻", spd: "特防", spe: "速" };
const STAT_COLORS = {
  hp: "#ff5959", atk: "#f5ac78", def: "#fae078",
  spa: "#9db7f5", spd: "#a7db8d", spe: "#fa92b2"
};

const LEVEL_PRESETS = [50, 100];
const IV_PRESETS = [
  { label: "6V", desc: "全 31", values: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } },
  { label: "5V0攻", desc: "攻击 0", values: { hp: 31, atk: 0, def: 31, spa: 31, spd: 31, spe: 31 } },
  { label: "5V0速", desc: "速度 0", values: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 0 } },
  { label: "4V0攻0速", desc: "攻击·速度 0", values: { hp: 31, atk: 0, def: 31, spa: 31, spd: 31, spe: 0 } },
];

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function calcFinalStat(base, iv, ev, level, nature, key) {
  if (base === undefined || base === null) return 0;
  if (key === "hp") {
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }
  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(raw * getNatureMultiplier(nature, key));
}

function totalEv(evs) {
  return STAT_KEYS.reduce((sum, k) => sum + (evs[k] || 0), 0);
}

export default function StatCalculator({ baseStats }) {
  const [level, setLevel] = useState(50);
  const [nature, setNature] = useState("认真");
  const [ivs, setIvs] = useState(() => Object.fromEntries(STAT_KEYS.map((k) => [k, 31])));
  const [evs, setEvs] = useState(() => Object.fromEntries(STAT_KEYS.map((k) => [k, 0])));

  const evTotal = useMemo(() => totalEv(evs), [evs]);
  const evRemaining = 510 - evTotal;

  const setIv = useCallback((key, val) => {
    setIvs((prev) => ({ ...prev, [key]: clamp(Number(val) || 0, 0, 31) }));
  }, []);

  const setEv = useCallback((key, val) => {
    const num = clamp(Number(val) || 0, 0, 252);
    setEvs((prev) => {
      const next = { ...prev, [key]: num };
      const newTotal = totalEv(next);
      if (newTotal > 510) next[key] = Math.max(0, num - (newTotal - 510));
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setLevel(50);
    setNature("认真");
    setIvs(Object.fromEntries(STAT_KEYS.map((k) => [k, 31])));
    setEvs(Object.fromEntries(STAT_KEYS.map((k) => [k, 0])));
  }, []);

  const applyIvPreset = useCallback((preset) => {
    setIvs({ ...preset.values });
  }, []);

  const applyEvMax = useCallback((key) => {
    setEvs((prev) => {
      const next = { ...prev };
      const othersTotal = STAT_KEYS.reduce((s, k) => s + (k === key ? 0 : (next[k] || 0)), 0);
      next[key] = Math.min(252, 510 - othersTotal);
      return next;
    });
  }, []);

  const finals = useMemo(() => {
    return Object.fromEntries(
      STAT_KEYS.map((k) => [k, calcFinalStat(baseStats?.[k], ivs[k], evs[k], level, nature, k)])
    );
  }, [baseStats, ivs, evs, level, nature]);

  const finalTotal = useMemo(() => STAT_KEYS.reduce((s, k) => s + finals[k], 0), [finals]);
  const baseTotal = useMemo(
    () => STAT_KEYS.reduce((s, k) => s + (baseStats?.[k] || 0), 0),
    [baseStats]
  );

  const natureEffect = NATURE_EFFECTS[nature];

  if (!baseStats) {
    return <div className="sc-empty">暂无种族值数据，无法计算能力值。</div>;
  }

  return (
    <div className="sc-root">
      {/* Preset bar */}
      <div className="sc-presets">
        {/* Level presets */}
        <div className="sc-preset-group">
          <span className="sc-preset-label">等级</span>
          <div className="sc-preset-chips">
            {LEVEL_PRESETS.map((lv) => (
              <button
                key={lv}
                className={`sc-chip ${level === lv ? "sc-chip-active" : ""}`}
                onClick={() => setLevel(lv)}
              >
                Lv.{lv}
              </button>
            ))}
            <input
              type="number" min={1} max={100} value={level}
              className="sc-chip-input"
              onChange={(e) => setLevel(clamp(Number(e.target.value) || 1, 1, 100))}
            />
          </div>
        </div>

        {/* Nature */}
        <div className="sc-preset-group sc-preset-nature">
          <span className="sc-preset-label">性格</span>
          <select value={nature} onChange={(e) => setNature(e.target.value)}>
            {NATURE_OPTIONS.map((n) => {
              const eff = NATURE_EFFECTS[n];
              const hint = eff
                ? `${n} (+${STAT_LABELS[eff.up]} -${STAT_LABELS[eff.down]})`
                : `${n} (无修正)`;
              return <option key={n} value={n}>{hint}</option>;
            })}
          </select>
        </div>

        {/* IV presets */}
        <div className="sc-preset-group">
          <span className="sc-preset-label">个体值</span>
          <div className="sc-preset-chips">
            {IV_PRESETS.map((p) => {
              const isActive = STAT_KEYS.every((k) => ivs[k] === p.values[k]);
              return (
                <button
                  key={p.label}
                  className={`sc-chip ${isActive ? "sc-chip-active" : ""}`}
                  onClick={() => applyIvPreset(p)}
                  title={p.desc}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* EV budget + actions */}
        <div className="sc-preset-group">
          <span className="sc-preset-label">努力值余量</span>
          <div className="sc-preset-chips">
            <span className={`sc-ev-budget ${evRemaining < 0 ? "sc-ev-over" : evRemaining === 0 ? "sc-ev-full" : ""}`}>
              {evRemaining} / 510
            </span>
            <button className="sc-chip sc-chip-reset" onClick={resetAll}>重置全部</button>
          </div>
        </div>
      </div>

      {/* Stat table */}
      <div className="sc-table">
        <div className="sc-row sc-header">
          <span className="sc-cell sc-label-cell">能力</span>
          <span className="sc-cell sc-num-cell">种族值</span>
          <span className="sc-cell sc-input-cell">个体值 (IV)</span>
          <span className="sc-cell sc-slider-cell">努力值 (EV)</span>
          <span className="sc-cell sc-num-cell">性格</span>
          <span className="sc-cell sc-final-cell">能力值</span>
          <span className="sc-cell sc-bar-cell">分布</span>
        </div>
        {STAT_KEYS.map((key) => {
          const base = baseStats[key] || 0;
          const mult = getNatureMultiplier(nature, key);
          const multLabel = mult > 1 ? "↑1.1" : mult < 1 ? "↓0.9" : "—";
          const multClass = mult > 1 ? "sc-nature-up" : mult < 1 ? "sc-nature-down" : "sc-nature-neutral";
          const final = finals[key];
          const barPct = Math.min((final / 500) * 100, 100);

          return (
            <div key={key} className="sc-row">
              <span className="sc-cell sc-label-cell" style={{ color: STAT_COLORS[key] }}>
                {STAT_LABELS[key]}
              </span>
              <span className="sc-cell sc-num-cell sc-base-val">{base}</span>
              <span className="sc-cell sc-input-cell">
                <input
                  type="number" min={0} max={31} value={ivs[key]}
                  onChange={(e) => setIv(key, e.target.value)}
                />
              </span>
              <span className="sc-cell sc-slider-cell">
                <input
                  type="range" min={0} max={252} step={4} value={evs[key]}
                  onChange={(e) => setEv(key, e.target.value)}
                  style={{ "--fill": STAT_COLORS[key] }}
                />
                <input
                  type="number" min={0} max={252} step={4} value={evs[key]}
                  className="sc-ev-num"
                  onChange={(e) => setEv(key, e.target.value)}
                />
                <button
                  className="sc-ev-max-btn"
                  onClick={() => applyEvMax(key)}
                  title={`${STAT_LABELS_SHORT[key]} 拉满`}
                >
                  MAX
                </button>
              </span>
              <span className={`sc-cell sc-num-cell ${multClass}`}>{multLabel}</span>
              <span className="sc-cell sc-final-cell">{final}</span>
              <span className="sc-cell sc-bar-cell">
                <div className="sc-bar-track">
                  <div
                    className="sc-bar-fill"
                    style={{ width: `${barPct}%`, background: STAT_COLORS[key] }}
                  />
                </div>
              </span>
            </div>
          );
        })}
        <div className="sc-row sc-total-row">
          <span className="sc-cell sc-label-cell">合计</span>
          <span className="sc-cell sc-num-cell sc-base-val">{baseTotal}</span>
          <span className="sc-cell sc-input-cell" />
          <span className="sc-cell sc-slider-cell">
            <div className="sc-ev-total-bar">
              <div className="sc-ev-total-fill" style={{ width: `${(evTotal / 510) * 100}%` }} />
            </div>
            <span className="sc-ev-num sc-ev-total-label">{evTotal}</span>
          </span>
          <span className="sc-cell sc-num-cell" />
          <span className="sc-cell sc-final-cell">{finalTotal}</span>
          <span className="sc-cell sc-bar-cell" />
        </div>
      </div>

      {/* Nature hint */}
      {natureEffect && (
        <div className="sc-nature-hint">
          {nature}性格：
          <span className="sc-nature-up">{STAT_LABELS[natureEffect.up]} ×1.1</span>
          {" / "}
          <span className="sc-nature-down">{STAT_LABELS[natureEffect.down]} ×0.9</span>
        </div>
      )}
    </div>
  );
}
