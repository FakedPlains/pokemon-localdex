import TypeChip from "../TypeChip.jsx";

/* ─── Evolution Tab (懒加载) ─── */
export default function EvolutionTab({ detail, evolutionChain, loading }) {
  if (loading) {
    return (
      <div className="tab-evolution">
        <div className="dex-drawer-loading">
          <div className="pulse-dot" />
          <span>加载进化链…</span>
        </div>
      </div>
    );
  }

  if (!evolutionChain || evolutionChain.length === 0) {
    return (
      <div className="tab-evolution">
        <p className="muted">该宝可梦没有进化链数据。</p>
      </div>
    );
  }

  // 按 stage 分组
  const stages = new Map();
  for (const evo of evolutionChain) {
    const stage = evo.stage ?? 0;
    if (!stages.has(stage)) stages.set(stage, []);
    stages.get(stage).push(evo);
  }

  return (
    <div className="tab-evolution">
      <div className="evo-chain">
        {[...stages.entries()]
          .sort(([a], [b]) => a - b)
          .map(([stage, evos], stageIdx) => (
            <div key={stage} className="evo-stage-group">
              {stageIdx > 0 && <div className="evo-arrow">→</div>}
              <div className="evo-stage-members">
                {evos.map((evo, i) => {
                  const isCurrent = evo.toPokemonId === detail.id;
                  return (
                    <a
                      key={`${evo.toPokemonId}-${i}`}
                      className={`evo-member${isCurrent ? " evo-member-current" : ""}`}
                      href={!isCurrent && evo.toPokemonId ? `#/pokemon?id=${evo.toPokemonId}` : undefined}
                      title={evo.condition || evo.method || ""}
                    >
                      {evo.toImage?.url && (
                        <img
                          className="evo-member-img"
                          src={evo.toImage.url}
                          alt={evo.toImage.alt || evo.toNameZh}
                          loading="lazy"
                        />
                      )}
                      <span className="evo-member-name">{evo.toNameZh}</span>
                      {evo.toTypes && evo.toTypes.length > 0 && (
                        <div className="evo-member-types">
                          {evo.toTypes.map((t) => (
                            <TypeChip key={t} type={t} />
                          ))}
                        </div>
                      )}
                      {(evo.method || evo.level || evo.item || evo.condition) && (
                        <span className="evo-member-method">
                          {evo.method || ""}
                          {evo.level ? ` Lv.${evo.level}` : ""}
                          {evo.item ? ` ${evo.item}` : ""}
                          {evo.condition ? ` ${evo.condition}` : ""}
                        </span>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
