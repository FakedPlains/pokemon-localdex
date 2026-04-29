import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "../utils/api.js";
import { STAT_KEYS, NATURE_OPTIONS, ALL_TYPE_OPTIONS, GENERATION_OPTIONS } from "../utils/constants.js";
import {
  createDraftMember, createDefaultStats, buildDerivedStats,
  getLearnableDamageMoves, resolveMoveGenerationRecord, describeLearnsetEntry,
  getPokemonLearnsetEntries, sortLearnsetEntries
} from "../utils/helpers.js";
import TypeChip from "../components/TypeChip.jsx";
import StatBar from "../components/StatBar.jsx";
import Loading from "../components/Loading.jsx";

function StatInputs({ kind, stats, onChange }) {
  return (
    <div className="stat-input-grid">
      {STAT_KEYS.map((key) => (
        <label key={key} className="mini-field">
          <span>{key.toUpperCase()}</span>
          <input
            type="number"
            min="0"
            max={kind === "ivs" ? 31 : 252}
            value={stats?.[key] ?? (kind === "ivs" ? 31 : 0)}
            onChange={(e) => onChange(kind, key, Number(e.target.value || 0))}
          />
        </label>
      ))}
    </div>
  );
}

function DamageMemberEditor({ title, side, detail, teamMembers, pokemonList, onFieldChange, onStatChange, onImportSide }) {
  const importButtons = teamMembers.length > 0 ? (
    <div className="import-strip">
      {teamMembers.map((entry) => (
        <button
          key={entry.slot}
          className="secondary compact-button"
          onClick={() => onImportSide(entry.slot)}
        >
          从队伍位置 {entry.slot + 1} 导入 {entry.member.nameZh || entry.member.pokemonId}
        </button>
      ))}
    </div>
  ) : (
    <p className="panel-subtitle">当前没有队伍草稿，直接手动选择宝可梦即可。</p>
  );

  const handleStat = (kind, key, value) => onStatChange(kind, key, value);

  return (
    <section className="team-member-editor">
      <div className="member-topline">
        <strong>{title}</strong>
        <span className="chip">{detail?.nameZh ? `已选择 ${detail.nameZh}` : "手动配置中"}</span>
      </div>
      {importButtons}
      <label>
        <span>宝可梦</span>
        <input
          list="damage-pokemon-options"
          value={side.pokemonId || ""}
          onChange={(e) => onFieldChange("pokemonId", e.target.value)}
          placeholder="如：皮卡丘"
        />
      </label>
      <div className="member-grid" style={{ marginTop: 12 }}>
        <label>
          <span>显示名</span>
          <input value={side.nameZh || ""} onChange={(e) => onFieldChange("nameZh", e.target.value)} placeholder="显示名称" />
        </label>
        <label>
          <span>等级</span>
          <input type="number" min="1" max="100" value={side.level || 50} onChange={(e) => onFieldChange("level", Number(e.target.value || 50))} />
        </label>
        <label>
          <span>性格</span>
          <select value={side.nature || "认真"} onChange={(e) => onFieldChange("nature", e.target.value)}>
            {NATURE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <details className="stats-details" open>
        <summary>个体值 / 努力值</summary>
        <div className="stats-editor">
          <div>
            <strong className="section-label">个体值 IV</strong>
            <StatInputs kind="ivs" stats={side.ivs} onChange={handleStat} />
          </div>
          <div>
            <strong className="section-label">努力值 EV</strong>
            <StatInputs kind="evs" stats={side.evs} onChange={handleStat} />
          </div>
        </div>
      </details>
    </section>
  );
}

function DerivedStatSummary({ title, battleMember, category }) {
  if (!battleMember?.detail || !battleMember?.derivedStats) {
    return (
      <div className="subpanel">
        <strong>{title}</strong>
        <p className="panel-subtitle">缺少宝可梦详细数据，暂时无法计算最终能力值。</p>
      </div>
    );
  }

  const offensiveKey = category === "physical" ? "atk" : "spa";
  const defensiveKey = category === "physical" ? "def" : "spd";

  return (
    <div className="subpanel">
      <strong>{title}</strong>
      <div className="panel-subtitle">{battleMember.member.nameZh || battleMember.detail.nameZh} · Lv.{battleMember.member.level || 50}</div>
      <div className="forms-grid" style={{ marginTop: 12 }}>
        <TypeChip type={battleMember.detail.primaryType} />
        <TypeChip type={battleMember.detail.secondaryType} />
      </div>
      <StatBar stats={battleMember.derivedStats} maxValue={220} />
      <div className="result-note">
        {title === "攻击方"
          ? <>当前用于计算的攻击数值：<strong>{battleMember.derivedStats[offensiveKey] || "-"}</strong></>
          : <>当前用于计算的防御数值：<strong>{battleMember.derivedStats[defensiveKey] || "-"}</strong></>}
      </div>
    </div>
  );
}

export default function DamagePage({ teamDraft }) {
  const [attacker, setAttacker] = useState(createDraftMember());
  const [defender, setDefender] = useState(createDraftMember());
  const [moveId, setMoveId] = useState("");
  const [moveGeneration, setMoveGeneration] = useState("9");
  const [moveName, setMoveName] = useState("");
  const [moveType, setMoveType] = useState("电");
  const [power, setPower] = useState(90);
  const [category, setCategory] = useState("special");
  const [typeEffectiveness, setTypeEffectiveness] = useState(1);
  const [weather, setWeather] = useState(1);
  const [critical, setCritical] = useState(false);
  const [other, setOther] = useState(1);
  const [result, setResult] = useState(null);

  const [pokemonList, setPokemonList] = useState([]);
  const [allMoves, setAllMoves] = useState([]);
  const [attackerDetail, setAttackerDetail] = useState(null);
  const [defenderDetail, setDefenderDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api("/pokemon").then((r) => r.data),
      api("/moves").then((r) => r.data)
    ]).then(([pokemon, moves]) => {
      setPokemonList(pokemon);
      setAllMoves(moves);
      setLoading(false);
    });
  }, []);

  // Fetch attacker detail
  useEffect(() => {
    if (!attacker.pokemonId) { setAttackerDetail(null); return; }
    let cancelled = false;
    api(`/pokemon/${encodeURIComponent(attacker.pokemonId)}`).then((r) => {
      if (!cancelled) setAttackerDetail(r.data);
    }).catch(() => { if (!cancelled) setAttackerDetail(null); });
    return () => { cancelled = true; };
  }, [attacker.pokemonId]);

  // Fetch defender detail
  useEffect(() => {
    if (!defender.pokemonId) { setDefenderDetail(null); return; }
    let cancelled = false;
    api(`/pokemon/${encodeURIComponent(defender.pokemonId)}`).then((r) => {
      if (!cancelled) setDefenderDetail(r.data);
    }).catch(() => { if (!cancelled) setDefenderDetail(null); });
    return () => { cancelled = true; };
  }, [defender.pokemonId]);

  const attackerBattle = useMemo(() => ({
    member: attacker,
    detail: attackerDetail,
    derivedStats: buildDerivedStats(attacker, attackerDetail)
  }), [attacker, attackerDetail]);

  const defenderBattle = useMemo(() => ({
    member: defender,
    detail: defenderDetail,
    derivedStats: buildDerivedStats(defender, defenderDetail)
  }), [defender, defenderDetail]);

  const teamMembers = useMemo(() =>
    (teamDraft?.members || [])
      .map((m, i) => ({ member: m, slot: i }))
      .filter((e) => e.member.pokemonId),
    [teamDraft?.members]
  );

  const learnableMoveState = useMemo(
    () => getLearnableDamageMoves(attackerDetail, allMoves, moveGeneration),
    [attackerDetail, allMoves, moveGeneration]
  );

  const selectedMove = useMemo(
    () => allMoves.find((m) => m.id === moveId || m.slug === moveId || m.nameZh === moveName),
    [allMoves, moveId, moveName]
  );

  const selectedMoveRecord = useMemo(
    () => selectedMove ? resolveMoveGenerationRecord(selectedMove, moveGeneration) : null,
    [selectedMove, moveGeneration]
  );

  const selectedMoveIsLearnable = !selectedMove ? true
    : !attackerDetail || learnableMoveState.learnsetEntries.length === 0 ? true
    : learnableMoveState.moves.some((m) => m.id === selectedMove.id);

  const applyMove = useCallback((move, gen) => {
    const record = resolveMoveGenerationRecord(move, gen);
    setMoveId(move?.slug || move?.id || "");
    setMoveName(move?.nameZh || "");
    setMoveType(record?.type || move?.type || "");
    setCategory(record?.category || move?.category || "special");
    setPower(record?.power ?? move?.power ?? 0);
    setResult(null);
  }, []);

  const handleImportSide = useCallback((setter) => (slotIndex) => {
    const member = teamDraft?.members?.[slotIndex];
    if (!member?.pokemonId) return;
    setter({
      ...createDraftMember(),
      ...member,
      moves: [...(member.moves || []), "", "", "", ""].slice(0, 4),
      ivs: { ...createDefaultStats("iv"), ...(member.ivs || {}) },
      evs: { ...createDefaultStats("ev"), ...(member.evs || {}) }
    });
    setResult(null);
  }, [teamDraft]);

  const handleCalculate = useCallback(async () => {
    if (!attackerBattle?.derivedStats || !defenderBattle?.derivedStats) {
      window.alert("当前选中的宝可梦缺少可用种族值，暂时无法计算。");
      return;
    }

    const attackStat = category === "physical" ? attackerBattle.derivedStats.atk : attackerBattle.derivedStats.spa;
    const defenseStat = category === "physical" ? defenderBattle.derivedStats.def : defenderBattle.derivedStats.spd;
    const attackerTypes = [attackerBattle.detail.primaryType, attackerBattle.detail.secondaryType].filter(Boolean);
    const stab = attackerTypes.includes(moveType) ? 1.5 : 1;

    const calcResult = await api("/battle/damage", {
      method: "POST",
      body: JSON.stringify({
        level: Number(attacker.level || 50),
        power: Number(power || 0),
        attack: Number(attackStat || 1),
        defense: Number(defenseStat || 1),
        stab,
        typeEffectiveness: Number(typeEffectiveness || 1),
        weather: Number(weather || 1),
        critical: critical ? 1.5 : 1,
        other: Number(other || 1)
      })
    });

    setResult({
      ...calcResult.data,
      stab,
      attackStat,
      defenseStat,
      attackerName: attacker.nameZh || attackerBattle.detail.nameZh,
      defenderName: defender.nameZh || defenderBattle.detail.nameZh
    });
  }, [attackerBattle, defenderBattle, attacker, defender, category, moveType, power, typeEffectiveness, weather, critical, other]);

  const handleReset = useCallback(() => {
    setAttacker(createDraftMember());
    setDefender(createDraftMember());
    setResult(null);
  }, []);

  const attackerMoveButtons = (attacker.moves || []).filter(Boolean);

  if (loading) return <Loading />;

  return (
    <section className="view-grid damage-layout">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">伤害计算器</h2>
            <p className="panel-subtitle">现在可以独立配置攻击方和防守方，不需要先完成队伍构筑；如果你已经有队伍草稿，也可以一键导入。</p>
          </div>
          <span className="chip">{teamMembers.length > 0 ? `${teamMembers.length} 个队伍快捷导入` : "独立模式"}</span>
        </div>
        <div className="team-builder">
          <datalist id="damage-pokemon-options">
            {pokemonList.map((p) => (
              <option key={p.id} value={p.slug || p.id}>{p.nameZh} / {p.nameEn || ""}</option>
            ))}
          </datalist>
          <div className="damage-side-grid">
            <DamageMemberEditor
              title="攻击方"
              side={attacker}
              detail={attackerDetail}
              teamMembers={teamMembers}
              pokemonList={pokemonList}
              onFieldChange={(field, value) => {
                setAttacker((prev) => {
                  const next = { ...prev, [field]: value };
                  if (field === "pokemonId" && !prev.nameZh) next.nameZh = value;
                  return next;
                });
                setResult(null);
              }}
              onStatChange={(kind, key, value) => {
                setAttacker((prev) => ({ ...prev, [kind]: { ...prev[kind], [key]: value } }));
                setResult(null);
              }}
              onImportSide={handleImportSide(setAttacker)}
            />
            <DamageMemberEditor
              title="防守方"
              side={defender}
              detail={defenderDetail}
              teamMembers={teamMembers}
              pokemonList={pokemonList}
              onFieldChange={(field, value) => {
                setDefender((prev) => {
                  const next = { ...prev, [field]: value };
                  if (field === "pokemonId" && !prev.nameZh) next.nameZh = value;
                  return next;
                });
                setResult(null);
              }}
              onStatChange={(kind, key, value) => {
                setDefender((prev) => ({ ...prev, [kind]: { ...prev[kind], [key]: value } }));
                setResult(null);
              }}
              onImportSide={handleImportSide(setDefender)}
            />
          </div>

          <datalist id="damage-move-options">
            {learnableMoveState.moves.map((move) => {
              const entry = learnableMoveState.learnsetEntries.find((e) => e.moveId === move.id || e.moveId === move.slug || e.moveNameZh === move.nameZh);
              const detail = entry ? describeLearnsetEntry(entry) : "";
              return <option key={move.id} value={move.slug || move.id}>{move.nameZh} / {detail || move.type || "未知"} / {move.category || "未分类"}</option>;
            })}
          </datalist>

          {attackerDetail ? (
            <div className="subpanel damage-hint-panel">
              <strong>攻击方可学招式</strong>
              <div className="panel-subtitle">
                {learnableMoveState.learnsetEntries.length > 0
                  ? `当前已按 ${attackerDetail.nameZh} 在第 ${moveGeneration} 世代的可学招式表过滤，共 ${learnableMoveState.moves.length} 个候选招式。`
                  : `${attackerDetail.nameZh} 暂无第 ${moveGeneration} 世代学招式记录，当前回退为显示全部招式。`}
              </div>
              {learnableMoveState.learnsetEntries.length > 0 && (
                <div className="import-strip learnset-strip">
                  {learnableMoveState.learnsetEntries.map((entry, i) => (
                    <button
                      key={i}
                      className="secondary compact-button"
                      onClick={() => {
                        const move = allMoves.find((m) => m.id === entry.moveId || m.slug === entry.moveId);
                        if (move) applyMove(move, moveGeneration);
                      }}
                    >
                      {entry.moveNameZh || entry.moveId}
                      {describeLearnsetEntry(entry) ? ` · ${describeLearnsetEntry(entry)}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="panel-subtitle">选择攻击方后，招式候选会自动收窄到该宝可梦在当前世代真正可学的招式。</p>
          )}

          {attackerMoveButtons.length > 0 && (
            <div className="import-strip">
              {attackerMoveButtons.map((name, i) => (
                <button
                  key={i}
                  className="secondary compact-button"
                  onClick={() => {
                    const move = allMoves.find((m) => m.nameZh === name || m.slug === name);
                    if (move) applyMove(move, moveGeneration);
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          <div className="damage-grid">
            <label>
              <span>招式名</span>
              <input
                list="damage-move-options"
                value={moveId || moveName}
                onChange={(e) => {
                  setMoveName(e.target.value);
                  const move = allMoves.find((m) => m.id === e.target.value || m.slug === e.target.value || m.nameZh === e.target.value);
                  if (move) applyMove(move, moveGeneration);
                  else setMoveId("");
                }}
                placeholder="如：十万伏特"
              />
            </label>
            <label>
              <span>招式世代</span>
              <select value={moveGeneration} onChange={(e) => {
                setMoveGeneration(e.target.value);
                if (selectedMove) applyMove(selectedMove, e.target.value);
                setResult(null);
              }}>
                {GENERATION_OPTIONS.map((g) => <option key={g} value={g}>第 {g} 世代</option>)}
              </select>
            </label>
            <label>
              <span>招式属性</span>
              <select value={moveType} onChange={(e) => setMoveType(e.target.value)}>
                {ALL_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>
              <span>招式威力</span>
              <input type="number" min="1" value={power} onChange={(e) => setPower(Number(e.target.value))} />
            </label>
            <label>
              <span>分类</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="physical">物理</option>
                <option value="special">特殊</option>
              </select>
            </label>
            <label>
              <span>克制倍率</span>
              <select value={typeEffectiveness} onChange={(e) => setTypeEffectiveness(Number(e.target.value))}>
                {[0, 0.25, 0.5, 1, 2, 4].map((v) => <option key={v} value={v}>{v}x</option>)}
              </select>
            </label>
            <label>
              <span>天气倍率</span>
              <select value={weather} onChange={(e) => setWeather(Number(e.target.value))}>
                {[0.5, 1, 1.5].map((v) => <option key={v} value={v}>{v}x</option>)}
              </select>
            </label>
            <label>
              <span>其他修正</span>
              <input type="number" min="0" step="0.1" value={other} onChange={(e) => setOther(Number(e.target.value))} />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} />
              <span>暴击</span>
            </label>
          </div>
          <div className="toolbar-row">
            <button onClick={handleCalculate}>计算伤害</button>
            <button className="secondary" onClick={handleReset}>重置攻守双方</button>
          </div>
        </div>
      </div>

      <div className="panel detail-panel">
        <DerivedStatSummary title="攻击方" battleMember={attackerBattle} category={category} />
        <div style={{ height: 12 }} />
        <DerivedStatSummary title="防守方" battleMember={defenderBattle} category={category} />
        <div style={{ height: 12 }} />

        <div className="subpanel">
          <strong>招式摘要</strong>
          {selectedMove ? (
            <div className="media-layout compact-media">
              {selectedMove.image?.url
                ? <div className="media-viewer"><img src={selectedMove.image.url} alt={selectedMove.image.alt || selectedMove.nameZh} className="entity-image item-image" referrerPolicy="no-referrer" /></div>
                : <div className="media-placeholder">暂无图片</div>}
              <div className="info-stack">
                <div><strong>{selectedMove.nameZh}</strong> · {selectedMove.nameEn || ""}</div>
                <div>当前世代：第 {moveGeneration} 世代</div>
                <div>属性：{selectedMoveRecord?.type || selectedMove.type || moveType || "未记录"}</div>
                <div>分类：{selectedMoveRecord?.category || selectedMove.category || category || "未记录"}</div>
                <div>威力：{selectedMoveRecord?.power ?? selectedMove.power ?? power ?? "-"}</div>
                <div>命中：{selectedMoveRecord?.accuracy || selectedMove.accuracy || "-"}</div>
                <div>{selectedMoveRecord?.effectSummary || selectedMove.effectSummary || "暂无说明"}</div>
                {!selectedMoveIsLearnable && (
                  <div className="warning-note">当前攻击方在第 {moveGeneration} 世代的可学招式表中未找到这招。</div>
                )}
              </div>
            </div>
          ) : (
            <p className="panel-subtitle">选择一个招式后，这里会自动显示当前世代下的属性、分类、威力、命中和效果摘要。</p>
          )}
        </div>

        <div style={{ height: 12 }} />
        <div className="subpanel">
          <strong>试算结果</strong>
          {result ? (
            <div className="result-card">
              <div className="result-badge">{result.attackerName} → {result.defenderName}</div>
              <h3>{moveName || "未命名招式"}</h3>
              <div className="result-grid">
                <div className="meta-card"><strong>最小伤害</strong><div>{result.min}</div></div>
                <div className="meta-card"><strong>最大伤害</strong><div>{result.max}</div></div>
                <div className="meta-card"><strong>平均伤害</strong><div>{result.average}</div></div>
                <div className="meta-card"><strong>STAB</strong><div>{result.stab}x</div></div>
              </div>
              <p className="panel-subtitle">
                当前计算使用攻击值 {result.attackStat}、防御值 {result.defenseStat}，
                并叠加克制倍率 {typeEffectiveness}x、天气倍率 {weather}x、其他修正 {other}x。
              </p>
            </div>
          ) : (
            <p className="panel-subtitle">填写参数后点击"计算伤害"，这里会显示最小值、最大值和平均值。</p>
          )}
        </div>
      </div>
    </section>
  );
}
