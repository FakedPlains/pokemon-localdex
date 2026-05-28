import TypeChip from "../TypeChip.jsx";

/** 因素类别对应的图标/标签 */
const CATEGORY_LABELS = {
  type: "属性",
  stab: "本属性",
  weather: "天气",
  terrain: "场地",
  ability: "特性",
  item: "道具",
  field: "场地效果",
  status: "状态",
  critical: "暴击",
};

function FactorChip({ factor }) {
  const effectClass = factor.effect === "boost"
    ? "dc-factor-boost"
    : factor.effect === "reduce"
      ? "dc-factor-reduce"
      : "dc-factor-neutral";

  return (
    <span className={`dc-factor-chip ${effectClass}`} title={factor.value || ""}>
      <span className="dc-factor-category">{CATEGORY_LABELS[factor.category] || factor.category}</span>
      <span className="dc-factor-name">{factor.name}</span>
      {factor.value && <span className="dc-factor-value">{factor.value}</span>}
    </span>
  );
}

function BreakdownSection({ breakdown }) {
  if (!breakdown || !breakdown.factors || breakdown.factors.length === 0) {
    return null;
  }

  return (
    <div className="dc-breakdown">
      <div className="dc-breakdown-header">伤害因素</div>
      <div className="dc-breakdown-factors">
        {breakdown.factors.map((factor, idx) => (
          <FactorChip key={`${factor.category}-${factor.name}-${idx}`} factor={factor} />
        ))}
      </div>
    </div>
  );
}

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
              {result.minPercent}% - {result.maxPercent}% HP
            </div>
          )}
          <BreakdownSection breakdown={result.breakdown} />
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
