import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api } from "../utils/api.js";
import { GENERATION_OPTIONS } from "@pokemon-localdex/store-types/constants";
import { createDraftMember } from "../utils/helpers.js";
import { buildDamageRequest, buildDamageResult } from "../components/damage/damageCalculation.ts";
import DamageResultPanel from "../components/damage/DamageResultPanel.jsx";
import FieldControlPanel from "../components/damage/FieldControlPanel.jsx";
import MoveExtrasPanel from "../components/damage/MoveExtrasPanel.jsx";
import MoveSlotPanel from "../components/damage/MoveSlotPanel.jsx";
import PokemonConfigPanel from "../components/damage/PokemonConfigPanel.jsx";
import useDamageMoves from "../components/damage/useDamageMoves.js";
import useDamageSideState from "../components/damage/useDamageSideState.ts";
import useDamageStatMode from "../components/damage/useDamageStatMode.js";
import useFieldState from "../components/damage/useFieldState.js";
import useMoveExtraState from "../components/damage/useMoveExtraState.ts";
import usePokemonDetails from "../components/damage/usePokemonDetails.js";
import StatusPanel from "../components/damage/StatusPanel.jsx";

//  主页面
// ══════════════════════════════════════════════════════════════

export default function DamagePage() {
  // ── 世代 ──
  const [generation, setGeneration] = useState("0");
  const isChampions = Number(generation) === 0;

  // ── 攻守双方 ──
  const [attacker, setAttacker] = useState(() => ({ ...createDraftMember(), statMode: "classic" }));
  const [defender, setDefender] = useState(() => ({ ...createDraftMember(), statMode: "classic" }));

  // ── 等级（攻守共享） ──
  const [level, setLevel] = useState(50);

  // ── 招式（攻守双方各4个槽位） ──
  const {
    atkMoves,
    atkMovesInfo,
    atkSelectedSlot,
    defMoves,
    defMovesInfo,
    defSelectedSlot,
    selectedMove,
    calcDirection,
    handleAtkSetMove,
    handleAtkSelectSlot,
    handleDefSetMove,
    handleDefSelectSlot,
    syncMovesFromConfig,
    clearAttackerMoves,
    clearDefenderMoves,
    resetMoves,
  } = useDamageMoves();
  const attackerMoveExtras = useMoveExtraState();
  const defenderMoveExtras = useMoveExtraState();

  // ── 场地环境（weather/terrain/gravity/magicRoom/wonderRoom/灾厄四宝） ──
  const [battleMode, setBattleMode] = useState("doubles");
  const { field, setField, toggleField, resetField } = useFieldState();

  // ── 攻守双方状态 ──
  const attackerSide = useDamageSideState();
  const defenderSide = useDamageSideState();

  // ── 攻击方额外属性 ──
  const [atkTeraType, setAtkTeraType] = useState("none");

  // ── 防守方额外属性 ──
  const [defTeraType, setDefTeraType] = useState("none");

  // ── 计算结果 ──
  const [result, setResult] = useState(null);
  const [calculating, setCalculating] = useState(false);

  // ── 全局数据 ──
  const { attackerDetail, defenderDetail } = usePokemonDetails(attacker.pokemonId, defender.pokemonId);

  // 世代切换时更新 statMode 并自动转换 EV↔SP
  useDamageStatMode(isChampions, setAttacker, setDefender);

  // ── 伤害计算（支持双向：calcDirection 决定谁攻谁守） ──
  const handleCalculate = useCallback(async () => {
    if (!selectedMove || !attacker.pokemonId || !defender.pokemonId) return;

    setCalculating(true);
    try {
      const { payload, meta } = buildDamageRequest({
        selectedMove,
        calcDirection,
        attacker,
        attackerDetail,
        defender,
        defenderDetail,
        generation,
        isChampions,
        level,
        critical: attackerMoveExtras.values.critical,
        moveHits: attackerMoveExtras.values.moveHits,
        useZ: attackerMoveExtras.values.useZ,
        useMax: attackerMoveExtras.values.useMax,
        timesUsed: attackerMoveExtras.values.timesUsed,
        timesUsedWithMetronome: attackerMoveExtras.values.timesUsedWithMetronome,
        isStellarFirstUse: attackerMoveExtras.values.isStellarFirstUse,
        defCritical: defenderMoveExtras.values.critical,
        defMoveHits: defenderMoveExtras.values.moveHits,
        defUseZ: defenderMoveExtras.values.useZ,
        defUseMax: defenderMoveExtras.values.useMax,
        defTimesUsed: defenderMoveExtras.values.timesUsed,
        defTimesUsedWithMetronome: defenderMoveExtras.values.timesUsedWithMetronome,
        defIsStellarFirstUse: defenderMoveExtras.values.isStellarFirstUse,
        battleMode,
        weather: field.weather,
        terrain: field.terrain,
        gravity: field.gravity,
        magicRoom: field.magicRoom,
        wonderRoom: field.wonderRoom,
        beadsOfRuin: field.beadsOfRuin,
        tabletsOfRuin: field.tabletsOfRuin,
        swordOfRuin: field.swordOfRuin,
        vesselOfRuin: field.vesselOfRuin,
        atkTeraType,
        defTeraType,
        atkSide: attackerSide.values,
        defSide: defenderSide.values,
      });

      const calcResult = await api("/battle/damage", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setResult(buildDamageResult(calcResult.data, meta));
    } catch (err) {
      window.alert("计算失败: " + (err.message || "未知错误"));
    }
    setCalculating(false);
  }, [selectedMove, calcDirection, attacker, attackerDetail, defender, defenderDetail, generation, isChampions, level,
    attackerMoveExtras.recalcKey, defenderMoveExtras.recalcKey,
    battleMode, field,
    atkTeraType, defTeraType,
    attackerSide.recalcKey, defenderSide.recalcKey]);

  // 用 ref 保存最新的 handleCalculate，避免 useEffect 因引用变化过度触发
  const calcRef = useRef(handleCalculate);
  calcRef.current = handleCalculate;

  // 选中招式后立即计算（仅 selectedMove 变化时触发）
  useEffect(() => {
    if (selectedMove && attacker.pokemonId && defender.pokemonId) {
      calcRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMove]);

  // 其他参数变化时防抖重新计算（500ms）
  const recalcKey = useMemo(() => JSON.stringify({
    atk: [attacker.pokemonId, attacker.formId, attacker.nature, attacker.abilityId, attacker.itemId, attacker.evs, attacker.sps, attacker.ivs],
    def: [defender.pokemonId, defender.formId, defender.nature, defender.abilityId, defender.itemId, defender.evs, defender.sps, defender.ivs],
    level, generation, calcDirection,
    atkExtras: attackerMoveExtras.recalcKey,
    defExtras: defenderMoveExtras.recalcKey,
    battleMode, field,
    atkTeraType, defTeraType,
    atkSide: attackerSide.recalcKey,
    defSide: defenderSide.recalcKey,
  }), [attacker, defender, level, generation, calcDirection,
    attackerMoveExtras.recalcKey, defenderMoveExtras.recalcKey,
    battleMode, field, atkTeraType, defTeraType,
    attackerSide.recalcKey, defenderSide.recalcKey]);

  useEffect(() => {
    if (!selectedMove || !attacker.pokemonId || !defender.pokemonId) return;
    const timer = setTimeout(() => calcRef.current(), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recalcKey]);

  const handleReset = useCallback(() => {
    setAttacker({ ...createDraftMember(), statMode: isChampions ? "champions" : "classic" });
    setDefender({ ...createDraftMember(), statMode: isChampions ? "champions" : "classic" });
    resetMoves();
    attackerMoveExtras.reset();
    defenderMoveExtras.reset();
    setAtkTeraType("none"); attackerSide.clearBattleSpecials();
    setDefTeraType("none"); defenderSide.clearBattleSpecials();
    resetField();
    setResult(null);
  }, [attackerMoveExtras, attackerSide, defenderMoveExtras, defenderSide, isChampions, resetMoves, resetField]);


  return (
    <section className="view-grid">
      <div className="panel dc-page">
        {/* ── 页面标题栏 ── */}
        <div className="dc-header">
          <div className="dc-header-left">
            <h2 className="dc-title">伤害计算器</h2>
            <span className="dc-subtitle">{isChampions ? "Champions 模式 (SP)" : `第${generation}世代`}</span>
          </div>
          <div className="dc-header-right">
            <select className="dc-gen-select" value={generation} onChange={(e) => { setGeneration(e.target.value); setResult(null); }}>
              {GENERATION_OPTIONS.map((g) => <option key={g} value={g}>{g}世代</option>)}
              <option value="0">Champions</option>
            </select>
            {!isChampions && (
              <div className="dc-level-inline">
                <span className="dc-level-inline-label">Lv.</span>
                <input
                  className="dc-level-inline-input"
                  type="number"
                  min={1}
                  max={100}
                  value={level}
                  onChange={(e) => setLevel(Math.max(1, Math.min(100, Number(e.target.value) || 50)))}
                />
              </div>
            )}
            <div className="dc-battle-mode-toggle">
              <button className={"dc-mode-btn" + (battleMode === "singles" ? " dc-mode-btn-active" : "")} onClick={() => setBattleMode("singles")}>单打</button>
              <button className={"dc-mode-btn" + (battleMode === "doubles" ? " dc-mode-btn-active" : "")} onClick={() => setBattleMode("doubles")}>双打</button>
            </div>
            <button className="dc-btn-reset" onClick={handleReset}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 1 3 6.36" /><path d="M3 21v-6h6" />
              </svg>
              重置
            </button>
          </div>
        </div>

        {/* ── 三栏主体：攻击方 | 中栏(场地+结果) | 防守方 ── */}
        <div className="dc-main-layout">

          {/* ═══ 左栏：攻击方招式 + 宝可梦 ═══ */}
          <div className="dc-side-col">
            {/* 攻击方招式槽位 */}
            {attacker.pokemonId && (
              <div className="dc-move-section dc-move-section-side">
                <span className="dc-section-title">攻击方招式</span>
                <MoveSlotPanel
                  moves={atkMoves}
                  movesInfo={atkMovesInfo}
                  selectedIndex={atkSelectedSlot}
                  onSelectSlot={handleAtkSelectSlot}
                  pokemonId={attacker.pokemonId}
                  generation={generation}
                  onSetMove={handleAtkSetMove}
                />
                <MoveExtrasPanel
                  generation={generation}
                  {...attackerMoveExtras.panelProps}
                  teraType={atkTeraType}
                  itemName={attacker.itemName}
                  itemId={attacker.itemId}
                />
              </div>
            )}
            <PokemonConfigPanel
              title="攻击方"
              member={attacker}
              detail={attackerDetail}
              isChampions={isChampions}
              onChange={setAttacker}
              onClear={() => { setAttacker({ ...createDraftMember(), statMode: isChampions ? "champions" : "classic" }); clearAttackerMoves(); setResult(null); }}
              boosts={attackerSide.values.boost}
              onBoostChange={attackerSide.onBoostChange}
              level={level}
              onMovesSync={(cfg) => syncMovesFromConfig(cfg, "atk")}
              curHP={attackerSide.values.curHP}
              onCurHPChange={attackerSide.setCurHP}
              teraType={atkTeraType}
              setTeraType={setAtkTeraType}
              generation={generation}
            />
          </div>

          {/* ═══ 中栏：结果 + 等级 + 场地 + 状态 ═══ */}
          <div className="dc-center-col">
            {/* 计算结果（顶部） */}
            <DamageResultPanel result={result} calculating={calculating} />

            {/* 场地环境 */}
            <FieldControlPanel
              field={field}
              setField={setField}
              toggleField={toggleField}
            />

            {/* 攻守双方状态 */}
            <div className="dc-status-row">
              <StatusPanel
                label="攻击方"
                side="atk"
                {...attackerSide.panelProps}
                generation={generation}
              />
              <StatusPanel
                label="防守方"
                side="def"
                {...defenderSide.panelProps}
                generation={generation}
              />
            </div>

          </div>

          {/* ═══ 右栏：防守方招式 + 宝可梦 ═══ */}
          <div className="dc-side-col">
            {/* 防守方招式槽位 */}
            {defender.pokemonId && (
              <div className="dc-move-section dc-move-section-side">
                <span className="dc-section-title">防守方招式</span>
                <MoveSlotPanel
                  moves={defMoves}
                  movesInfo={defMovesInfo}
                  selectedIndex={defSelectedSlot}
                  onSelectSlot={handleDefSelectSlot}
                  pokemonId={defender.pokemonId}
                  generation={generation}
                  onSetMove={handleDefSetMove}
                />
                <MoveExtrasPanel
                  generation={generation}
                  {...defenderMoveExtras.panelProps}
                  teraType={defTeraType}
                  itemName={defender.itemName}
                  itemId={defender.itemId}
                />
              </div>
            )}
            <PokemonConfigPanel
              title="防守方"
              member={defender}
              detail={defenderDetail}
              isChampions={isChampions}
              onChange={setDefender}
              onClear={() => { setDefender({ ...createDraftMember(), statMode: isChampions ? "champions" : "classic" }); clearDefenderMoves(); setResult(null); }}
              boosts={defenderSide.values.boost}
              onBoostChange={defenderSide.onBoostChange}
              level={level}
              onMovesSync={(cfg) => syncMovesFromConfig(cfg, "def")}
              curHP={defenderSide.values.curHP}
              onCurHPChange={defenderSide.setCurHP}
              teraType={defTeraType}
              setTeraType={setDefTeraType}
              generation={generation}
            />
          </div>

        </div>

      </div>
    </section>
  );
}
