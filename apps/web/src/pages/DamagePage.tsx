import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { unifiedApi } from "../utils/api.js";
import { useToast } from "../components/Toast.jsx";
import { GENERATION_OPTIONS } from "@pokemon-localdex/store-types/constants";
import { createDraftMember } from "../utils/helpers.js";
import { buildDamageRequest, buildDamageResult } from "../components/damage/damageCalculation.ts";
import { getAbilityFieldMapping } from "../components/damage/damageConstants.ts";
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

const KoAnalysisPage = lazy(() => import("./KoAnalysisPage.tsx"));

// ── 类型定义 ──
// ══════════════════════════════════════════════════════════════

interface DraftMember {
  pokemonId: string;
  nameZh: string;
  configName: string;
  level: number;
  itemId: string;
  itemName?: string;
  abilityId: string;
  abilityName?: string;
  nature: string;
  moves: string[];
  ivs: Record<string, number>;
  evs: Record<string, number>;
  sps?: Record<string, number>;
  formId?: string;
  statMode?: string;
  [key: string]: unknown;
}

interface DamagePageProps {
  initialTab?: "damage" | "ko";
}

interface DamageResult {
  [key: string]: unknown;
}

//  主页面
// ══════════════════════════════════════════════════════════════

export default function DamagePage({ initialTab = "damage" }: DamagePageProps) {
  const [activeTab, setActiveTab] = useState<"damage" | "ko">(initialTab);

  // 当 initialTab prop 变化时同步（例如从 #/ko 直接导航）
  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);
  const toast = useToast();

  // ── 世代 ──
  const [generation, setGeneration] = useState("0");
  const isChampions = Number(generation) === 0;

  // ── 攻守双方 ──
  const [attacker, setAttacker] = useState<DraftMember>(() => ({ ...createDraftMember(), statMode: "classic" }));
  const [defender, setDefender] = useState<DraftMember>(() => ({ ...createDraftMember(), statMode: "classic" }));

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
  const [battleMode, setBattleMode] = useState<"singles" | "doubles">("doubles");
  const { field, setField, toggleField, resetField } = useFieldState();

  // ── 攻守双方状态 ──
  const attackerSide = useDamageSideState();
  const defenderSide = useDamageSideState();

  // ── 攻击方额外属性 ──
  const [atkTeraType, setAtkTeraType] = useState("none");

  // ── 防守方额外属性 ──
  const [defTeraType, setDefTeraType] = useState("none");

  // ── 计算结果 ──
  const [result, setResult] = useState<DamageResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  // ── 全局数据 ──
  const { attackerDetail, defenderDetail } = usePokemonDetails(attacker.pokemonId, defender.pokemonId);

  // 世代切换时更新 statMode 并自动转换 EV↔SP
  useDamageStatMode(isChampions, setAttacker, setDefender);

  // ── 特性 → 天气/场地自动联动 ──
  // autoFieldRef 记录由特性自动设置的字段值；当 field 仍等于该值时，表示用户未手动修改，自动逻辑仍有控制权
  const autoFieldRef = useRef<{ weather: string; terrain: string }>({ weather: "", terrain: "" });
  const prevAtkAbilityRef = useRef(attacker.abilityId);
  const prevDefAbilityRef = useRef(defender.abilityId);
  const prevGenerationRef = useRef(generation);

  // 用 ref 持有最新的 field 值以便 effect 内读取但不作为依赖
  const fieldRef = useRef(field);
  fieldRef.current = field;

  /**
   * 统一 resolver：基于攻防双方当前特性 + 世代，计算某类型字段应有的自动值。
   * 后出场特性覆盖先出场特性（防守方优先于攻击方），与对战机制一致。
   * 返回映射值字符串或 null（表示当前无特性提供该类型字段）。
   */
  const resolveAutoValue = useCallback(
    (fieldType: "weather" | "terrain", gen: string | number): string | null => {
      // 防守方后出场，优先取防守方映射（覆盖逻辑）
      const sides = [defender.abilityId, attacker.abilityId];
      for (const abilityId of sides) {
        if (!abilityId) continue;
        const mapping = getAbilityFieldMapping(abilityId, gen);
        if (mapping && mapping.type === fieldType) {
          return mapping.value;
        }
      }
      return null;
    },
    [attacker.abilityId, defender.abilityId],
  );

  /**
   * 核心联动 effect：当特性或世代变化时，重新 resolve 每个字段类型。
   * 只在字段仍由自动逻辑控制时（field === autoFieldRef）才写入或清除。
   * 用户手动修改后（field !== autoFieldRef），自动逻辑放弃该字段的追踪。
   */
  useEffect(() => {
    const prevAtkId = prevAtkAbilityRef.current;
    const prevDefId = prevDefAbilityRef.current;
    const prevGen = prevGenerationRef.current;
    const atkChanged = attacker.abilityId !== prevAtkId;
    const defChanged = defender.abilityId !== prevDefId;
    const genChanged = generation !== prevGen;
    prevAtkAbilityRef.current = attacker.abilityId;
    prevDefAbilityRef.current = defender.abilityId;
    prevGenerationRef.current = generation;

    if (!atkChanged && !defChanged && !genChanged) return;

    const currentField = fieldRef.current;
    const fieldTypes = ["weather", "terrain"] as const;

    for (const fieldType of fieldTypes) {
      const prevAutoValue = autoFieldRef.current[fieldType];
      const currentValue = currentField[fieldType];

      // 如果之前有自动值但用户已手动修改，放弃追踪
      if (prevAutoValue && currentValue !== prevAutoValue) {
        autoFieldRef.current[fieldType] = "";
        continue;
      }

      // resolve 当前攻防双方 + 世代下该字段应有的值
      const resolved = resolveAutoValue(fieldType, generation);

      if (resolved) {
        // 有映射值：当前无自动值或自动值不同时才更新
        if (resolved !== prevAutoValue) {
          setField(fieldType, resolved);
          autoFieldRef.current[fieldType] = resolved;
        }
      } else {
        // 无映射值：如果之前有自动值在控制，清除回 "none"
        if (prevAutoValue) {
          setField(fieldType, "none");
          autoFieldRef.current[fieldType] = "";
        }
      }
    }
  }, [attacker.abilityId, defender.abilityId, generation, setField, resolveAutoValue]);

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

      const calcResult = await unifiedApi("/battle/damage", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setResult(buildDamageResult(calcResult.data, meta));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "未知错误";
      toast.error("计算失败: " + message);
    }
    setCalculating(false);
  }, [toast, selectedMove, calcDirection, attacker, attackerDetail, defender, defenderDetail, generation, isChampions, level,
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
      {/* ── 页面级 Tab 切换：伤害计算 / KO 分析 ── */}
      <div className="dc-page-tabs">
        <button
          className={`dc-page-tab${activeTab === "damage" ? " dc-page-tab-active" : ""}`}
          onClick={() => { setActiveTab("damage"); window.location.hash = "#/damage"; }}
        >
          伤害计算
        </button>
        <button
          className={`dc-page-tab${activeTab === "ko" ? " dc-page-tab-active" : ""}`}
          onClick={() => { setActiveTab("ko"); window.location.hash = "#/ko"; }}
        >
          KO 分析
        </button>
      </div>

      {activeTab === "ko" ? (
        <Suspense fallback={<div className="shared-loading">加载中…</div>}>
          <KoAnalysisPage />
        </Suspense>
      ) : (
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
                  formId={attacker.formId}
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
              onMovesSync={(cfg: Record<string, unknown>) => syncMovesFromConfig(cfg, "atk")}
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
                  formId={defender.formId}
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
              onMovesSync={(cfg: Record<string, unknown>) => syncMovesFromConfig(cfg, "def")}
              curHP={defenderSide.values.curHP}
              onCurHPChange={defenderSide.setCurHP}
              teraType={defTeraType}
              setTeraType={setDefTeraType}
              generation={generation}
            />
          </div>

        </div>

      </div>
      )}
    </section>
  );
}
