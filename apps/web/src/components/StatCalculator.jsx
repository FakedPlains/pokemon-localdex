import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { STAT_KEYS, NATURE_OPTIONS, NATURE_EFFECTS } from "../utils/constants.js";
import { getNatureMultiplier } from "../utils/helpers.js";
import SearchSelect from "./SearchSelect.jsx";

const STAT_LABELS = { hp: "HP", atk: "攻击", def: "防御", spa: "特攻", spd: "特防", spe: "速度" };
const STAT_LABELS_SHORT = { hp: "HP", atk: "攻", def: "防", spa: "特攻", spd: "特防", spe: "速" };
const STAT_COLORS = {
  hp: "#8AC654", atk: "#F8CB3C", def: "#D98837",
  spa: "#59C3D0", spd: "#5890CD", spe: "#A456D0"
};

const NATURE_SELECT_OPTIONS = NATURE_OPTIONS.map((n) => {
  const eff = NATURE_EFFECTS[n];
  return {
    value: n,
    label: n,
    sublabel: eff ? `+${STAT_LABELS[eff.up]} -${STAT_LABELS[eff.down]}` : "无修正",
  };
});

/* ── Classic mode constants ── */
const LEVEL_PRESETS = [50, 100];
const IV_PRESETS = [
  { label: "6V", desc: "全 31", values: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } },
  { label: "5V0攻", desc: "攻击 0", values: { hp: 31, atk: 0, def: 31, spa: 31, spd: 31, spe: 31 } },
  { label: "5V0速", desc: "速度 0", values: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 0 } },
  { label: "4V0攻0速", desc: "攻击·速度 0", values: { hp: 31, atk: 0, def: 31, spa: 31, spd: 31, spe: 0 } },
];

/* ── Champions mode constants ── */
const SP_MAX_PER_STAT = 32;
const SP_TOTAL_MAX = 66;
const CHAMPIONS_LEVEL = 50;
const CHAMPIONS_IV = 31;

const SP_PRESETS = [
  { label: "极攻极速", desc: "攻击32 速度32 HP2", values: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 } },
  { label: "极特攻极速", desc: "特攻32 速度32 HP2", values: { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 } },
  { label: "满HP满物耐", desc: "HP32 防御32 特防2", values: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 } },
  { label: "满HP满特耐", desc: "HP32 特防32 防御2", values: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 } },
  { label: "均衡", desc: "每项11", values: { hp: 11, atk: 11, def: 11, spa: 11, spd: 11, spe: 11 } },
];

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/* ── Classic stat formula (any level, any IV, any EV) ── */
function calcClassicStat(base, iv, ev, level, nature, key) {
  if (base === undefined || base === null) return 0;
  if (key === "hp") {
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }
  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(raw * getNatureMultiplier(nature, key));
}

/* ── Champions simplified formula (Lv.50, IV=31 fixed) ── */
function calcChampionsStat(base, sp, nature, key) {
  if (base === undefined || base === null) return 0;
  if (key === "hp") {
    // HP = 种族值 + SP + 75
    return base + sp + 75;
  }
  // 其他 = floor((种族值 + SP + 20) × 性格修正)
  return Math.floor((base + sp + 20) * getNatureMultiplier(nature, key));
}

/* ── Conversion: EV ↔ SP ── */
/*
 * 经典模式 Lv.50 时，EV 的实际能力值增量 = ceil(floor(EV/4) / 2)
 *   - 首个 4 EV 就贡献 1 点能力值（因为 2*base+31 是奇数）
 *   - 之后每 8 EV 贡献 1 点
 * Champions 的 SP 直接就是能力值加成，所以 SP = 该增量
 *
 * 反向：SP → 最小 EV = (2*SP - 1) * 4 = 8*SP - 4（SP>0 时）
 *   - SP=1 → 4, SP=2 → 12, SP=32 → 252
 */
function evToSp(ev) {
  if (ev <= 0) return 0;
  const evEffect = Math.floor(ev / 4);           // EV 在公式中的实际贡献
  return clamp(Math.ceil(evEffect / 2), 0, SP_MAX_PER_STAT);
}

function spToEv(sp) {
  if (sp <= 0) return 0;
  // 首个 4 EV = 1 SP，之后每 8 EV = 1 SP
  // SP=1 → 4, SP=2 → 12, SP=32 → 252
  return clamp(4 + (sp - 1) * 8, 0, 252);
}

function totalEv(evs) {
  return STAT_KEYS.reduce((sum, k) => sum + (evs[k] || 0), 0);
}

function totalSp(sps) {
  return STAT_KEYS.reduce((sum, k) => sum + (sps[k] || 0), 0);
}

/**
 * @param {Object} props
 * @param {Object} props.baseStats - 种族值
 * @param {Object} [props.initialValues] - 可选初始值 { level, nature, ivs, evs }
 * @param {Function} [props.onChange] - 可选回调 ({ level, nature, ivs, evs }) => void
 */
export default function StatCalculator({ baseStats, initialValues, onChange }) {
  const [mode, setMode] = useState("classic"); // "classic" | "champions"

  /* ── Classic state ── */
  const [level, setLevelRaw] = useState(initialValues?.level || 50);
  const [nature, setNatureRaw] = useState(initialValues?.nature || "认真");
  const [ivs, setIvsRaw] = useState(() => ({
    ...Object.fromEntries(STAT_KEYS.map((k) => [k, 31])),
    ...(initialValues?.ivs || {})
  }));
  const [evs, setEvsRaw] = useState(() => ({
    ...Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
    ...(initialValues?.evs || {})
  }));

  /* ── Champions state ── */
  const [champNature, setChampNature] = useState(initialValues?.nature || "认真");
  const [sps, setSps] = useState(() => Object.fromEntries(STAT_KEYS.map((k) => [k, 0])));

  /* ── Alias raw setters so the rest of the component code stays unchanged ── */
  const setLevel = setLevelRaw;
  const setNature = setNatureRaw;
  const setIvs = setIvsRaw;
  const setEvs = setEvsRaw;


  // Fire onChange whenever classic state changes
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (onChangeRef.current && mode === "classic") {
      onChangeRef.current({ level, nature, ivs, evs });
    }
  }, [level, nature, ivs, evs, mode]);

  /* ── Classic helpers ── */
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

  /* ── Champions helpers ── */
  const spTotal = useMemo(() => totalSp(sps), [sps]);
  const spRemaining = SP_TOTAL_MAX - spTotal;

  const setSp = useCallback((key, val) => {
    const num = clamp(Number(val) || 0, 0, SP_MAX_PER_STAT);
    setSps((prev) => {
      const next = { ...prev, [key]: num };
      const newTotal = totalSp(next);
      if (newTotal > SP_TOTAL_MAX) next[key] = Math.max(0, num - (newTotal - SP_TOTAL_MAX));
      return next;
    });
  }, []);

  const applySpPreset = useCallback((preset) => {
    setSps({ ...preset.values });
  }, []);

  const applySpMax = useCallback((key) => {
    setSps((prev) => {
      const next = { ...prev };
      const othersTotal = STAT_KEYS.reduce((s, k) => s + (k === key ? 0 : (next[k] || 0)), 0);
      next[key] = Math.min(SP_MAX_PER_STAT, SP_TOTAL_MAX - othersTotal);
      return next;
    });
  }, []);

  /* ── Mode switch with conversion ── */
  const switchToChampions = useCallback(() => {
    // Convert current classic EV → SP, carry nature
    const converted = {};
    for (const k of STAT_KEYS) {
      converted[k] = evToSp(evs[k]);
    }
    // Clamp total to 66
    let t = totalSp(converted);
    if (t > SP_TOTAL_MAX) {
      // Proportionally reduce
      const scale = SP_TOTAL_MAX / t;
      for (const k of STAT_KEYS) {
        converted[k] = Math.floor(converted[k] * scale);
      }
    }
    setSps(converted);
    setChampNature(nature);
    setMode("champions");
  }, [evs, nature]);

  const switchToClassic = useCallback(() => {
    // Convert current SP → EV, carry nature
    // 按 SP 值从大到小排序，优先满足 SP 高的属性；
    // 预算不够时把剩余 EV 全部给当前属性，后续属性归零
    const converted = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
    const sorted = [...STAT_KEYS]
      .filter((k) => sps[k] > 0)
      .sort((a, b) => sps[b] - sps[a]);
    let budget = 510;
    for (const k of sorted) {
      const ideal = spToEv(sps[k]);
      if (ideal <= budget) {
        converted[k] = ideal;
        budget -= ideal;
      } else {
        // 预算不够，把剩余全给这个属性（对齐到 4 的倍数，且不超过 252）
        converted[k] = Math.min(252, Math.floor(budget / 4) * 4);
        budget -= converted[k];
      }
    }
    setEvs(converted);
    setIvs(Object.fromEntries(STAT_KEYS.map((k) => [k, 31])));
    setLevel(50);
    setNature(champNature);
    setMode("classic");
  }, [sps, champNature]);

  /* ── Reset ── */
  const resetClassic = useCallback(() => {
    setLevel(50);
    setNature("认真");
    setIvs(Object.fromEntries(STAT_KEYS.map((k) => [k, 31])));
    setEvs(Object.fromEntries(STAT_KEYS.map((k) => [k, 0])));
  }, []);

  const resetChampions = useCallback(() => {
    setChampNature("认真");
    setSps(Object.fromEntries(STAT_KEYS.map((k) => [k, 0])));
  }, []);

  /* ── Computed final stats ── */
  const finals = useMemo(() => {
    if (mode === "champions") {
      return Object.fromEntries(
        STAT_KEYS.map((k) => [k, calcChampionsStat(baseStats?.[k], sps[k], champNature, k)])
      );
    }
    return Object.fromEntries(
      STAT_KEYS.map((k) => [k, calcClassicStat(baseStats?.[k], ivs[k], evs[k], level, nature, k)])
    );
  }, [mode, baseStats, ivs, evs, level, nature, sps, champNature]);

  const finalTotal = useMemo(() => STAT_KEYS.reduce((s, k) => s + finals[k], 0), [finals]);
  const baseTotal = useMemo(
    () => STAT_KEYS.reduce((s, k) => s + (baseStats?.[k] || 0), 0),
    [baseStats]
  );

  const currentNature = mode === "champions" ? champNature : nature;
  const natureEffect = NATURE_EFFECTS[currentNature];

  if (!baseStats) {
    return <div className="sc-empty">暂无种族值数据，无法计算能力值。</div>;
  }

  return (
    <div className="sc-root">
      {/* Mode toggle */}
      <div className="sc-mode-toggle">
        <button
          className={`sc-mode-btn ${mode === "classic" ? "sc-mode-btn-active" : ""}`}
          onClick={mode === "champions" ? switchToClassic : undefined}
        >
          <span className="sc-mode-icon">📊</span>
          经典模式
          <span className="sc-mode-desc">IV + EV</span>
        </button>
        <button
          className={`sc-mode-btn ${mode === "champions" ? "sc-mode-btn-active" : ""}`}
          onClick={mode === "classic" ? switchToChampions : undefined}
        >
          <span className="sc-mode-icon">🏆</span>
          Champions
          <span className="sc-mode-desc">SP 系统</span>
        </button>
      </div>

      {/* Preset bar */}
      <div className="sc-presets">
        {mode === "classic" ? (
          <>
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
              <SearchSelect
                value={nature}
                options={NATURE_SELECT_OPTIONS}
                onChange={(v) => setNature(v)}
                placeholder="选择性格…"
              />
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

            {/* EV budget */}
            <div className="sc-preset-group">
              <span className="sc-preset-label">努力值余量</span>
              <div className="sc-preset-chips">
                <span className={`sc-ev-budget ${evRemaining < 0 ? "sc-ev-over" : evRemaining === 0 ? "sc-ev-full" : ""}`}>
                  {evRemaining} / 510
                </span>
                <button className="sc-chip sc-chip-reset" onClick={resetClassic}>重置全部</button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Champions: fixed level & IV hint */}
            <div className="sc-preset-group">
              <span className="sc-preset-label">等级 / 个体值</span>
              <div className="sc-preset-chips">
                <span className="sc-chip sc-chip-fixed">Lv.50 固定</span>
                <span className="sc-chip sc-chip-fixed">IV 31 固定</span>
              </div>
            </div>

            {/* Nature */}
            <div className="sc-preset-group sc-preset-nature">
              <span className="sc-preset-label">性格</span>
              <SearchSelect
                value={champNature}
                options={NATURE_SELECT_OPTIONS}
                onChange={(v) => setChampNature(v)}
                placeholder="选择性格…"
              />
            </div>

            {/* SP presets */}
            <div className="sc-preset-group">
              <span className="sc-preset-label">SP 预设</span>
              <div className="sc-preset-chips">
                {SP_PRESETS.map((p) => {
                  const isActive = STAT_KEYS.every((k) => sps[k] === p.values[k]);
                  return (
                    <button
                      key={p.label}
                      className={`sc-chip ${isActive ? "sc-chip-active" : ""}`}
                      onClick={() => applySpPreset(p)}
                      title={p.desc}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SP budget */}
            <div className="sc-preset-group">
              <span className="sc-preset-label">SP 余量</span>
              <div className="sc-preset-chips">
                <span className={`sc-ev-budget ${spRemaining < 0 ? "sc-ev-over" : spRemaining === 0 ? "sc-ev-full" : ""}`}>
                  {spRemaining} / {SP_TOTAL_MAX}
                </span>
                <button className="sc-chip sc-chip-reset" onClick={resetChampions}>重置全部</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Stat table */}
      <div className="sc-table">
        {mode === "classic" ? (
          /* ── Classic table header ── */
          <div className="sc-row sc-header">
            <span className="sc-cell sc-label-cell">能力</span>
            <span className="sc-cell sc-num-cell">种族值</span>
            <span className="sc-cell sc-input-cell">个体值 (IV)</span>
            <span className="sc-cell sc-slider-cell">努力值 (EV)</span>
            <span className="sc-cell sc-num-cell">性格</span>
            <span className="sc-cell sc-final-cell">能力值</span>
            <span className="sc-cell sc-bar-cell">分布</span>
          </div>
        ) : (
          /* ── Champions table header ── */
          <div className="sc-row sc-header sc-row-champ">
            <span className="sc-cell sc-label-cell">能力</span>
            <span className="sc-cell sc-num-cell">种族值</span>
            <span className="sc-cell sc-slider-cell">SP (Stat Points)</span>
            <span className="sc-cell sc-num-cell">性格</span>
            <span className="sc-cell sc-final-cell">能力值</span>
            <span className="sc-cell sc-bar-cell">分布</span>
          </div>
        )}

        {STAT_KEYS.map((key) => {
          const base = baseStats[key] || 0;
          const mult = getNatureMultiplier(currentNature, key);
          const multLabel = mult > 1 ? "↑1.1" : mult < 1 ? "↓0.9" : "—";
          const multClass = mult > 1 ? "sc-nature-up" : mult < 1 ? "sc-nature-down" : "sc-nature-neutral";
          const final = finals[key];
          const barPct = Math.min((final / 500) * 100, 100);

          if (mode === "classic") {
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
          }

          /* Champions row */
          return (
            <div key={key} className="sc-row sc-row-champ">
              <span className="sc-cell sc-label-cell" style={{ color: STAT_COLORS[key] }}>
                {STAT_LABELS[key]}
              </span>
              <span className="sc-cell sc-num-cell sc-base-val">{base}</span>
              <span className="sc-cell sc-slider-cell">
                <input
                  type="range" min={0} max={SP_MAX_PER_STAT} step={1} value={sps[key]}
                  onChange={(e) => setSp(key, e.target.value)}
                  style={{ "--fill": STAT_COLORS[key] }}
                />
                <input
                  type="number" min={0} max={SP_MAX_PER_STAT} value={sps[key]}
                  className="sc-ev-num"
                  onChange={(e) => setSp(key, e.target.value)}
                />
                <button
                  className="sc-ev-max-btn"
                  onClick={() => applySpMax(key)}
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

        {/* Total row */}
        {mode === "classic" ? (
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
        ) : (
          <div className="sc-row sc-total-row sc-row-champ">
            <span className="sc-cell sc-label-cell">合计</span>
            <span className="sc-cell sc-num-cell sc-base-val">{baseTotal}</span>
            <span className="sc-cell sc-slider-cell">
              <div className="sc-ev-total-bar">
                <div className="sc-ev-total-fill" style={{ width: `${(spTotal / SP_TOTAL_MAX) * 100}%` }} />
              </div>
              <span className="sc-ev-num sc-ev-total-label">{spTotal}</span>
            </span>
            <span className="sc-cell sc-num-cell" />
            <span className="sc-cell sc-final-cell">{finalTotal}</span>
            <span className="sc-cell sc-bar-cell" />
          </div>
        )}
      </div>

      {/* Nature hint */}
      {natureEffect && (
        <div className="sc-nature-hint">
          {currentNature}性格：
          <span className="sc-nature-up">{STAT_LABELS[natureEffect.up]} ×1.1</span>
          {" / "}
          <span className="sc-nature-down">{STAT_LABELS[natureEffect.down]} ×0.9</span>
        </div>
      )}

      {/* Champions formula hint */}
      {mode === "champions" && (
        <div className="sc-formula-hint">
          <span className="sc-formula-title">Champions 简化公式</span>
          <span className="sc-formula-text">HP = 种族值 + SP + 75</span>
          <span className="sc-formula-text">其他 = ⌊(种族值 + SP + 20) × 性格修正⌋</span>
          <span className="sc-formula-note">Lv.50 固定 · IV 31 固定 · SP 直接加算 · 总上限 66 SP · 单项上限 32 SP</span>
        </div>
      )}
    </div>
  );
}
