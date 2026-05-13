import { useState, useMemo } from "react";
import { TYPE_OPTIONS, TYPE_CHART_BY_ID } from "@pokemon-localdex/store-types/constants";

const EFFECTIVENESS_LABELS = {
  0: "无效",
  0.5: "½",
  1: "",
  2: "2×",
};

export default function TypeChartPage() {
  const [highlightAtk, setHighlightAtk] = useState(null);
  const [highlightDef, setHighlightDef] = useState(null);

  const hasHover = highlightAtk !== null || highlightDef !== null;

  const chartData = useMemo(() => {
    return TYPE_OPTIONS.map((type) => ({
      type,
      row: TYPE_CHART_BY_ID[type.id],
    }));
  }, []);

  const getCellClass = (value) => {
    if (value === 0) return "tc-cell tc-immune";
    if (value === 0.5) return "tc-cell tc-resist";
    if (value === 2) return "tc-cell tc-super";
    return "tc-cell tc-neutral";
  };

  return (
    <section className="view-grid">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">属性克制表</h2>
            <p className="panel-subtitle">完整 18 属性相克关系。行 = 攻击方属性，列 = 防守方属性。悬停高亮行列。</p>
          </div>
        </div>

        <div className="tc-wrap">
          <div className="tc-table-scroll">
            <table
              className={`tc-table${hasHover ? " tc-has-hover" : ""}`}
              onMouseLeave={() => { setHighlightAtk(null); setHighlightDef(null); }}
            >
              <thead>
                <tr>
                  <th className={`tc-corner${hasHover ? " tc-header-highlight" : ""}`}>
                    <span className="tc-corner-atk">攻↓</span>
                    <span className="tc-corner-def">防→</span>
                  </th>
                  {TYPE_OPTIONS.map((defType) => (
                    <th
                      key={defType.id}
                      className={`tc-header-col${highlightDef === defType.id ? " tc-header-highlight" : ""}`}
                    >
                      <span className={`tc-type-label type-bg-solid-${defType.nameZh}`}>
                        <img className="tc-type-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${defType.nameZh}@sm.png`} alt="" />
                        <span className="tc-type-text">{defType.nameZh}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.map(({ type: atkType, row }) => (
                  <tr
                    key={atkType.id}
                    onMouseEnter={() => setHighlightAtk(atkType.id)}
                  >
                    <th className={`tc-header-row${highlightAtk === atkType.id ? " tc-header-highlight" : ""}`}>
                      <span className={`tc-type-label type-bg-solid-${atkType.nameZh}`}>
                        <img className="tc-type-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${atkType.nameZh}@sm.png`} alt="" />
                        <span className="tc-type-text">{atkType.nameZh}</span>
                      </span>
                    </th>
                    {row.map((value, i) => {
                      const defType = TYPE_OPTIONS[i];
                      const isHighlighted = highlightAtk === atkType.id || highlightDef === defType.id;
                      return (
                        <td
                          key={defType.id}
                          className={`${getCellClass(value)}${isHighlighted ? " tc-cell-highlight" : ""}`}
                          title={`${atkType.nameZh} → ${defType.nameZh}: ${value === 0 ? "无效" : value === 0.5 ? "效果不好" : value === 2 ? "效果拔群" : "普通"}`}
                          onMouseEnter={() => setHighlightDef(defType.id)}
                        >
                          {EFFECTIVENESS_LABELS[value]}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 图例 */}
          <div className="tc-legend">
            <span className="tc-legend-item"><span className="tc-legend-dot tc-super"></span>2× 效果拔群</span>
            <span className="tc-legend-item"><span className="tc-legend-dot tc-neutral"></span>1× 普通</span>
            <span className="tc-legend-item"><span className="tc-legend-dot tc-resist"></span>½ 效果不好</span>
            <span className="tc-legend-item"><span className="tc-legend-dot tc-immune"></span>0 无效</span>
          </div>
        </div>
      </div>
    </section>
  );
}
