import { STAT_KEYS } from "../utils/constants.js";

export default function StatBar({ stats, maxValue = 180 }) {
  return (
    <div className="stat-grid">
      {STAT_KEYS.map((key) => (
        <div key={key} className="stat-row">
          <span>{key.toUpperCase()}</span>
          <div className="stat-bar">
            <div
              className="stat-fill"
              style={{ width: `${Math.min(((stats[key] || 0) / maxValue) * 100, 100)}%` }}
            />
          </div>
          <strong>{stats[key] || "-"}</strong>
        </div>
      ))}
    </div>
  );
}
