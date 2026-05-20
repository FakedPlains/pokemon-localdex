import { motion } from "framer-motion";
import { STAT_KEYS, STAT_COLORS, STAT_LABELS_SHORT } from "@pokemon-localdex/store-types/constants";
import type { StatBlock } from "@pokemon-localdex/store-types";

export interface BaseStatBarsProps {
  stats: StatBlock | Partial<StatBlock>;
  diff?: StatBlock | Partial<StatBlock> | null;
}

/* ─── Base Stat Bars (visual only) ─── */
export default function BaseStatBars({ stats, diff }: BaseStatBarsProps) {
  const total = STAT_KEYS.reduce((s, k) => s + (stats[k] || 0), 0);
  const totalDiff = diff ? STAT_KEYS.reduce((s, k) => s + (diff[k] || 0), 0) : 0;
  return (
    <div className="bsb-grid">
      {STAT_KEYS.map((key) => {
        const val = stats[key] || 0;
        const pct = Math.min((val / 200) * 100, 100);
        const d = diff ? diff[key] || 0 : 0;
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
            <span className="bsb-val-group">
              <span className="bsb-val">{val}</span>
              {d !== 0 && (
                <span className={`bsb-diff ${d > 0 ? "bsb-diff-up" : "bsb-diff-down"}`}>
                  {d > 0 ? `+${d}` : d}
                </span>
              )}
            </span>
          </div>
        );
      })}
      <div className="bsb-row bsb-total">
        <span className="bsb-label">合计</span>
        <div className="bsb-track" />
        <span className="bsb-val-group">
          <span className="bsb-val">{total}</span>
          {totalDiff !== 0 && (
            <span className={`bsb-diff ${totalDiff > 0 ? "bsb-diff-up" : "bsb-diff-down"}`}>
              {totalDiff > 0 ? `+${totalDiff}` : totalDiff}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
