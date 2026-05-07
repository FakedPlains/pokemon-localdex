import { STAT_KEYS } from "../utils/constants.js";

/**
 * 公共能力值展示组件
 *
 * 支持两种展示模式：
 * - "table"：网格表格，展示 SP/个体值/努力值 + 最终能力值（用于盒子卡片、队伍成员卡片）
 * - "bar"：进度条，只展示最终能力值（用于配置编辑器侧栏）
 *
 * Props:
 *   mode        - "table" | "bar"（默认 "table"）
 *   finalStats  - { HP, 攻击, 防御, 特攻, 特防, 速度 } 最终能力值
 *   statTotal   - 能力值合计（bar 模式使用）
 *   statMode    - "classic" | "champions"
 *   ivs         - 个体值对象（table 模式，classic 下使用）
 *   evs         - 努力值对象（table 模式，classic 下使用）
 *   sps         - SP 值对象（table 模式，champions 下使用）
 */
export default function StatsDisplay({ mode = "table", finalStats, statTotal, statMode, ivs, evs, sps }) {
  if (!finalStats) return null;

  const isChampions = statMode === "champions";
  const total = statTotal ?? STAT_KEYS.reduce((sum, key) => sum + (finalStats[key] || 0), 0);

  // ── 进度条模式 ──
  if (mode === "bar") {
    return (
      <div className="cfg-stats-mini">
        {STAT_KEYS.map((key) => (
          <div key={key} className="cfg-stat-row">
            <span className="cfg-stat-name">{key}</span>
            <div className="cfg-stat-bar">
              <div className="cfg-stat-fill" style={{ width: `${Math.min(100, (finalStats[key] || 0) / 2.55)}%` }} />
            </div>
            <span className="cfg-stat-val">{finalStats[key]}</span>
          </div>
        ))}
        <div className="cfg-stat-total">合计 {total}</div>
      </div>
    );
  }

  // ── 表格模式 ──
  return (
    <div className="box-card-stats">
      <div className="box-card-stats-header">
        <span></span>
        <span>HP</span><span>攻击</span><span>防御</span><span>特攻</span><span>特防</span><span>速度</span>
      </div>
      {isChampions ? (
        <div className="box-card-stats-row">
          <span className="box-card-stats-tag box-card-stats-tag-sp">SP</span>
          {STAT_KEYS.map((k) => (
            <span key={k} className="box-card-stats-num">{sps?.[k] || 0}</span>
          ))}
        </div>
      ) : (
        <>
          <div className="box-card-stats-row">
            <span className="box-card-stats-tag box-card-stats-tag-iv">个体</span>
            {STAT_KEYS.map((k) => (
              <span key={k} className="box-card-stats-num">{ivs?.[k] ?? 31}</span>
            ))}
          </div>
          <div className="box-card-stats-row">
            <span className="box-card-stats-tag box-card-stats-tag-ev">努力</span>
            {STAT_KEYS.map((k) => (
              <span key={k} className="box-card-stats-num">{evs?.[k] || 0}</span>
            ))}
          </div>
        </>
      )}
      <div className="box-card-stats-row">
        <span className="box-card-stats-tag">能力</span>
        {STAT_KEYS.map((k) => (
          <span key={k} className="box-card-stats-num has-val">{finalStats[k]}</span>
        ))}
      </div>
    </div>
  );
}
