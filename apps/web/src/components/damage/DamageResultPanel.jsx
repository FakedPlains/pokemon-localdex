import TypeChip from "../TypeChip.jsx";

export default function DamageResultPanel({ result, calculating }) {
  return (
    <div className="dc-result-section">
      {result ? (
        <div className={`dc-result-card${calculating ? " dc-result-updating" : ""}`}>
          <div className="dc-result-headline">
            <strong>{result.attackerName}</strong>
            <span> 的 {result.moveName}</span>
            {result.moveType && <TypeChip type={result.moveType} size="sm" />}
            <span className="dc-result-category">{result.category === "physical" ? "物理" : "特殊"}</span>
            <span> → </span>
            <strong>{result.defenderName}</strong>
          </div>
          <div className="dc-result-numbers">
            <div className="dc-result-num">
              <span className="dc-result-label">最小</span>
              <span className="dc-result-value">{result.min}</span>
            </div>
            <div className="dc-result-num dc-result-num-main">
              <span className="dc-result-label">平均</span>
              <span className="dc-result-value">{result.average}</span>
            </div>
            <div className="dc-result-num">
              <span className="dc-result-label">最大</span>
              <span className="dc-result-value">{result.max}</span>
            </div>
          </div>
          {result.defHp > 0 && (
            <div className="dc-result-percent">
              {((result.min / result.defHp) * 100).toFixed(1)}% - {((result.max / result.defHp) * 100).toFixed(1)}% HP
            </div>
          )}
          {result.description && (
            <div className="dc-result-desc"><code>{result.description}</code></div>
          )}
        </div>
      ) : calculating ? (
        <div className="dc-result-card dc-result-loading">
          <span>计算中...</span>
        </div>
      ) : (
        <div className="dc-result-empty">
          <p>选择攻守双方宝可梦并点击招式开始计算</p>
        </div>
      )}
    </div>
  );
}
