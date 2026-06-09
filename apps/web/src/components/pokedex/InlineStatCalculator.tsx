import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  STAT_KEYS,
  STAT_COLORS,
  STAT_LABELS_BY_ID,
  STAT_LABELS_SHORT,
  NATURES,
  NATURE_EFFECTS_BY_ID,
  natureNameToId,
} from "@pokemon-localdex/store-types/constants";
import {
  EV_MAX, EV_TOTAL_MAX, SP_MAX, SP_TOTAL_MAX,
  clamp, calcClassicStat, calcChampionsStat,
  getNatureMultiplier, convertEvsToSps, convertSpsToEvs,
} from "../../utils/statCalcModel";
import SearchSelect from "../SearchSelect.jsx";

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

interface ApplyPreset {
  nature?: string;
  sps?: Record<string, number>;
}

interface InlineStatCalculatorProps {
  baseStats: Record<string, number>;
  diff?: Record<string, number> | null;
  mode: "classic" | "champions";
  onChange?: (values: CalcValues) => void;
  controlsPortal?: HTMLElement | null;
  /** 从对战 Tab 联动注入的性格/EV 预设，消费后由父组件清空 */
  applyPreset?: ApplyPreset | null;
}

/* ── Constants ── */
const NATURE_SELECT_OPTIONS = NATURES.map((nature) => {
  const eff = NATURE_EFFECTS_BY_ID[nature.id];
  return {
    id: nature.id,
    value: nature.nameZh,
    label: nature.nameZh,
    sublabel: eff ? `+${STAT_LABELS_BY_ID[eff.up]} -${STAT_LABELS_BY_ID[eff.down]}` : "无修正",
  };
});


/* ══════════════════════════════════════════════════════════════════
   InlineStatCalculator — 左右平分布局
   左侧: 能力名 + 种族值 + 进度条
   右侧: IV(经典) + EV/SP + 性格 + 实际值
   ══════════════════════════════════════════════════════════════════ */
export default function InlineStatCalculator({ baseStats, diff, mode, onChange, controlsPortal, applyPreset }: InlineStatCalculatorProps) {
  /* Classic state */
  const [level, setLevel] = useState(50);
  const [nature, setNature] = useState("认真");
  const [ivs, setIvs] = useState<Record<string, number>>(() =>
    Object.fromEntries(STAT_KEYS.map((k) => [k, 31]))
  );
  const [evs, setEvs] = useState<Record<string, number>>(() =>
    Object.fromEntries(STAT_KEYS.map((k) => [k, 0]))
  );

  /* Champions state */
  const [champNature, setChampNature] = useState("认真");
  const [sps, setSps] = useState<Record<string, number>>(() =>
    Object.fromEntries(STAT_KEYS.map((k) => [k, 0]))
  );

  /* ── Mode switch conversion ── */
  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;
    // 如果有 applyPreset 正在注入，跳过自动转换，由 applyPreset effect 负责填充
    if (applyPreset) return;
    if (mode === "champions") {
      setSps(convertEvsToSps(evs));
      setChampNature(nature);
    } else {
      setEvs(convertSpsToEvs(sps));
      setIvs(Object.fromEntries(STAT_KEYS.map((k) => [k, 31])));
      setLevel(50);
      setNature(champNature);
    }
  }, [mode, applyPreset]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Apply preset from BattleTab linkage（直接填充 SP 值，不做转换） ── */
  useEffect(() => {
    if (!applyPreset) return;
    if (applyPreset.nature) {
      setChampNature(applyPreset.nature);
    }
    if (applyPreset.sps && Object.keys(applyPreset.sps).length > 0) {
      setSps(applyPreset.sps);
    }
  }, [applyPreset]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── onChange callback ── */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (onChangeRef.current) {
      onChangeRef.current({
        level,
        nature: mode === "champions" ? champNature : nature,
        ivs,
        evs,
        statMode: mode,
        sps,
        champNature,
      });
    }
  }, [level, nature, ivs, evs, mode, sps, champNature]);

  /* ── Computed finals ── */
  const currentNature = mode === "champions" ? champNature : nature;
  const finals = useMemo(() => {
    if (mode === "champions") {
      return Object.fromEntries(
        STAT_KEYS.map((k) => [k, calcChampionsStat(baseStats[k] || 0, sps[k], champNature, k)])
      );
    }
    return Object.fromEntries(
      STAT_KEYS.map((k) => [k, calcClassicStat(baseStats[k] || 0, ivs[k], evs[k], level, nature, k)])
    );
  }, [mode, baseStats, ivs, evs, level, nature, sps, champNature]);

  const baseTotal = useMemo(() => STAT_KEYS.reduce((s, k) => s + (baseStats[k] || 0), 0), [baseStats]);
  const finalTotal = useMemo(() => STAT_KEYS.reduce((s, k) => s + finals[k], 0), [finals]);

  /* ── Stat range (min ~ max) ── */
  const ranges = useMemo(() => {
    return Object.fromEntries(
      STAT_KEYS.map((k) => {
        const base = baseStats[k] || 0;
        if (mode === "champions") {
          // Champions: min = SP=0 + 减益性格(0.9), max = SP=32 + 增益性格(1.1)
          const min = k === "hp"
            ? base + 0 + 75
            : Math.floor((base + 0 + 20) * 0.9);
          const max = k === "hp"
            ? base + SP_MAX + 75
            : Math.floor((base + SP_MAX + 20) * 1.1);
          return [k, { min, max }];
        }
        // Classic: min = IV=0, EV=0, 减益性格; max = IV=31, EV=252, 增益性格
        const minRaw = k === "hp"
          ? Math.floor(((2 * base + 0 + 0) * level) / 100) + level + 10
          : Math.floor((Math.floor(((2 * base + 0 + 0) * level) / 100) + 5) * 0.9);
        const maxRaw = k === "hp"
          ? Math.floor(((2 * base + 31 + Math.floor(252 / 4)) * level) / 100) + level + 10
          : Math.floor((Math.floor(((2 * base + 31 + Math.floor(252 / 4)) * level) / 100) + 5) * 1.1);
        return [k, { min: minRaw, max: maxRaw }];
      })
    ) as Record<string, { min: number; max: number }>;
  }, [baseStats, mode, level]);

  /* ── EV/SP helpers ── */
  const evTotal = useMemo(() => STAT_KEYS.reduce((s, k) => s + (evs[k] || 0), 0), [evs]);
  const spTotal = useMemo(() => STAT_KEYS.reduce((s, k) => s + (sps[k] || 0), 0), [sps]);

  const setEv = useCallback((key: string, val: number) => {
    const num = clamp(val, 0, EV_MAX);
    setEvs((prev) => {
      const next = { ...prev, [key]: num };
      const total = STAT_KEYS.reduce((s, k) => s + next[k], 0);
      if (total > EV_TOTAL_MAX) next[key] = Math.max(0, num - (total - EV_TOTAL_MAX));
      return next;
    });
  }, []);

  const setSpVal = useCallback((key: string, val: number) => {
    const num = clamp(val, 0, SP_MAX);
    setSps((prev) => {
      const next = { ...prev, [key]: num };
      const total = STAT_KEYS.reduce((s, k) => s + next[k], 0);
      if (total > SP_TOTAL_MAX) next[key] = Math.max(0, num - (total - SP_TOTAL_MAX));
      return next;
    });
  }, []);

  const setIv = useCallback((key: string, val: number) => {
    setIvs((prev) => ({ ...prev, [key]: clamp(val, 0, 31) }));
  }, []);

  /* ── Reset ── */
  const reset = useCallback(() => {
    if (mode === "classic") {
      setLevel(50);
      setNature("认真");
      setIvs(Object.fromEntries(STAT_KEYS.map((k) => [k, 31])));
      setEvs(Object.fromEntries(STAT_KEYS.map((k) => [k, 0])));
    } else {
      setChampNature("认真");
      setSps(Object.fromEntries(STAT_KEYS.map((k) => [k, 0])));
    }
  }, [mode]);

  /* ── EV/SP max helpers ── */
  const applyEvMax = useCallback((key: string) => {
    setEvs((prev) => {
      const next = { ...prev };
      const othersTotal = STAT_KEYS.reduce((s, k) => s + (k === key ? 0 : next[k]), 0);
      next[key] = Math.min(EV_MAX, EV_TOTAL_MAX - othersTotal);
      return next;
    });
  }, []);

  const applySpMax = useCallback((key: string) => {
    setSps((prev) => {
      const next = { ...prev };
      const othersTotal = STAT_KEYS.reduce((s, k) => s + (k === key ? 0 : next[k]), 0);
      next[key] = Math.min(SP_MAX, SP_TOTAL_MAX - othersTotal);
      return next;
    });
  }, []);

  const natureEffect = NATURE_EFFECTS_BY_ID[natureNameToId(currentNature) as number];

  if (!baseStats) {
    return <div className="isc-empty">暂无种族值数据</div>;
  }

  const totalMax = mode === "champions" ? SP_TOTAL_MAX : EV_TOTAL_MAX;
  const currentTotal = mode === "champions" ? spTotal : evTotal;

  /* ── Controls JSX ── */
  const controlsJsx = (
    <div className="isc-controls">
      <div className="isc-nature-select">
        <SearchSelect
          value={currentNature}
          options={NATURE_SELECT_OPTIONS}
          onChange={(v: string) => mode === "champions" ? setChampNature(v) : setNature(v)}
          placeholder="性格"
        />
      </div>

      {mode === "classic" && (
        <div className="isc-level-group">
          <span className="isc-level-label">Lv.</span>
          <input
            type="number"
            min={1}
            max={100}
            value={level}
            className="isc-level-input"
            onChange={(e) => setLevel(clamp(Number(e.target.value) || 1, 1, 100))}
          />
        </div>
      )}

      <span className={`isc-budget ${currentTotal >= totalMax ? "isc-budget-full" : ""}`}>
        {mode === "champions" ? "SP" : "EV"}: {currentTotal}/{totalMax}
      </span>

      {natureEffect && (
        <span className="isc-nature-hint">
          <span className="isc-nature-up">{STAT_LABELS_BY_ID[natureEffect.up]}↑</span>
          <span className="isc-nature-down">{STAT_LABELS_BY_ID[natureEffect.down]}↓</span>
        </span>
      )}

      <button className="isc-reset-btn" onClick={reset} title="重置">↺</button>
    </div>
  );

  return (
    <div className="isc-root">
      {/* Controls: portal 到外部容器 */}
      {controlsPortal && createPortal(controlsJsx, controlsPortal)}

      {/* ── Stat rows: 左右平分布局 ── */}
      {/* Header */}
      <div className="isc-grid-header">
        <div className={`isc-hdr-left ${diff ? "" : "isc-hdr-left--no-diff"}`}>
          <span>种族值</span>
          <span className="isc-hdr-range">范围</span>
        </div>
        <div className={`isc-hdr-right ${mode === "champions" ? "isc-hdr-right--champ" : ""}`}>
          {mode === "classic" && <span>IV</span>}
          <span></span>{/* slider 列占位 */}
          <span className="isc-hdr-ev">{mode === "champions" ? "SP" : "EV"}</span>
          <span></span>{/* MAX 列占位 */}
          <span></span>{/* 性格列占位 */}
          <span className="isc-hdr-final">实际</span>
        </div>
      </div>

      <div className="isc-grid">
        {STAT_KEYS.map((key) => {
          const base = baseStats[key] || 0;
          const pct = Math.min((base / 200) * 100, 100);
          const d = diff ? diff[key] || 0 : 0;
          const mult = key === "hp" ? 1 : getNatureMultiplier(currentNature, key);
          const natureClass = mult > 1 ? "isc-nat-up" : mult < 1 ? "isc-nat-down" : "";
          const final = finals[key];

          return (
            <div key={key} className={`isc-row ${natureClass}`}>
              {/* ── Left half: label + base + bar + [diff] + range ── */}
              <div className={`isc-left ${diff ? "" : "isc-left--no-diff"}`}>
                <span className="isc-stat-label" style={{ color: STAT_COLORS[key] }}>
                  {STAT_LABELS_SHORT[key]}
                </span>
                <span className="isc-base-val">{base}</span>
                <div className="isc-bar-track">
                  <motion.div
                    className="isc-bar-fill"
                    style={{ background: STAT_COLORS[key] }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
                {diff && (
                  <span className={`isc-diff ${d > 0 ? "isc-diff-up" : d < 0 ? "isc-diff-down" : ""}`}>
                    {d !== 0 ? (d > 0 ? `+${d}` : d) : ""}
                  </span>
                )}
                <span className="isc-range">{ranges[key].min}–{ranges[key].max}</span>
              </div>

              {/* ── Right half: IV + EV/SP slider + nature + final + range ── */}
              <div className={`isc-right ${mode === "champions" ? "isc-right--champ" : ""}`}>
                {/* IV (classic only) */}
                {mode === "classic" && (
                  <input
                    type="number"
                    min={0}
                    max={31}
                    value={ivs[key]}
                    className="isc-iv-input"
                    onChange={(e) => setIv(key, Number(e.target.value) || 0)}
                  />
                )}

                {/* EV/SP slider + number */}
                <input
                  type="range"
                  min={0}
                  max={mode === "champions" ? SP_MAX : EV_MAX}
                  step={mode === "champions" ? 1 : 4}
                  value={mode === "champions" ? sps[key] : evs[key]}
                  className="isc-slider"
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    mode === "champions" ? setSpVal(key, v) : setEv(key, v);
                  }}
                />
                <input
                  type="number"
                  min={0}
                  max={mode === "champions" ? SP_MAX : EV_MAX}
                  step={mode === "champions" ? 1 : 4}
                  value={mode === "champions" ? sps[key] : evs[key]}
                  className="isc-ev-input"
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0;
                    mode === "champions" ? setSpVal(key, v) : setEv(key, v);
                  }}
                />
                <button
                  className="isc-max-btn"
                  onClick={() => mode === "champions" ? applySpMax(key) : applyEvMax(key)}
                >M</button>

                {/* Nature */}
                <span className="isc-nature-ind">
                  {mult > 1 ? "↑" : mult < 1 ? "↓" : "—"}
                </span>

                {/* Final */}
                <span className="isc-final">{final}</span>
              </div>
            </div>
          );
        })}

        {/* Total row */}
        <div className="isc-row isc-total-row">
          <div className={`isc-left ${diff ? "" : "isc-left--no-diff"}`}>
            <span className="isc-stat-label">合计</span>
            <span className="isc-base-val">{baseTotal}</span>
            <div className="isc-bar-track" />
            {diff && <span className="isc-diff" />}
            <span className="isc-range" />
          </div>
          <div className={`isc-right ${mode === "champions" ? "isc-right--champ" : ""}`}>
            {mode === "classic" && <span />}{/* IV 列占位 */}
            <div className="isc-ev-total-bar">
              <div
                className="isc-ev-total-fill"
                style={{ width: `${(currentTotal / totalMax) * 100}%` }}
              />
            </div>
            <span />{/* EV num 列占位 */}
            <span />{/* MAX 列占位 */}
            <span className="isc-nature-ind" />
            <span className="isc-final">{finalTotal}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
