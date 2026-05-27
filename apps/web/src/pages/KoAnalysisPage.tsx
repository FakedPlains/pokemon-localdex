/**
 * KO 分析页面 — 斩杀线/防守线分析器
 * 路由: #/ko
 */
import { useState, useCallback, useMemo, useEffect } from "react";
import { createDraftMember, getPokemonPreviewImage } from "../utils/helpers.js";
import { unifiedApi } from "../utils/api.js";
import PokemonConfigPanel from "../components/damage/PokemonConfigPanel.jsx";
import usePokemonDetails from "../components/damage/usePokemonDetails.js";
import useDamageStatMode from "../components/damage/useDamageStatMode.js";
import { DEFAULT_BOOSTS } from "../components/damage/damageConstants.js";
import KoTargetPanel from "../components/ko/KoTargetPanel";
import KoResultPanel from "../components/ko/KoResultPanel";
import useKoAnalysis from "../hooks/useKoAnalysis";
import type { PokemonMember, MoveInfo, TargetEntry } from "../utils/koCalculation";

interface LearnsetMove {
  id: string;
  nameZh: string;
  name: string;
  type: string;
  category: string;
  power: number;
}

export default function KoAnalysisPage() {
  // ── 我方宝可梦 ──
  const [myPokemon, setMyPokemon] = useState<PokemonMember>(() => ({
    ...createDraftMember(),
    statMode: "champions",
  } as PokemonMember));
  const [myBoosts, setMyBoosts] = useState<Record<string, number>>({ ...DEFAULT_BOOSTS });
  const [myTeraType, setMyTeraType] = useState("none");

  // ── 世代与模式 ──
  const [generation] = useState("0"); // 默认 Champions
  const isChampions = Number(generation) === 0;

  // ── 我方详情 ──
  const { attackerDetail: myDetail } = usePokemonDetails(myPokemon.pokemonId, "");

  // ── EV/SP 模式自动转换 ──
  const noop = useCallback((_fn: any) => {
    // 只处理 myPokemon（因 useDamageStatMode 需要两个 setter）
  }, []);
  useDamageStatMode(isChampions, setMyPokemon, noop);

  // ── 分析模式 ──
  const [analysisMode, setAnalysisMode] = useState<"attack" | "defense">("attack");

  // ── 目标列表 ──
  const [targets, setTargets] = useState<TargetEntry[]>([]);

  // ── 我方招式（简单的 4 槽位管理）──
  const [myMoves, setMyMoves] = useState<(MoveInfo | null)[]>([null, null, null, null]);
  const [selectedMoveIdx, setSelectedMoveIdx] = useState(0);

  // ── 加载我方宝可梦的招式列表 ──
  const [learnset, setLearnset] = useState<LearnsetMove[]>([]);
  useEffect(() => {
    if (!myPokemon.pokemonId) { setLearnset([]); return; }
    let cancelled = false;
    unifiedApi(`/pokemon/${myPokemon.pokemonId}/learnset/meta`).then((meta: any) => {
      if (cancelled) return;
      const metaForms = meta.data?.forms || [];
      const matchedForm = (myPokemon.formId && metaForms.find((f: any) => f.formId === Number(myPokemon.formId))) || metaForms.find((f: any) => f.isDefault) || metaForms[0];
      const resolvedFormId = matchedForm?.formId;
      const formIdParam = resolvedFormId ? `&formId=${resolvedFormId}` : "";
      return unifiedApi(`/pokemon/${myPokemon.pokemonId}/learnset?generation=9${formIdParam}`);
    }).then((r: any) => {
      if (cancelled || !r) return;
      const entries = r.data || [];
      const seen = new Set<string>();
      const list: LearnsetMove[] = [];
      for (const entry of entries) {
        const name = entry.moveNameZh || entry.moveId;
        if (name && !seen.has(name)) {
          seen.add(name);
          // 只保留攻击招式（有威力的）
          if (entry.movePower && entry.movePower > 0) {
            list.push({
              id: entry.moveId ?? "",
              nameZh: name,
              name,
              type: entry.moveType || "",
              category: entry.moveCategory || "",
              power: entry.movePower ?? 0,
            });
          }
        }
      }
      setLearnset(list);
    }).catch(() => { if (!cancelled) setLearnset([]); });
    return () => { cancelled = true; };
  }, [myPokemon.pokemonId, myPokemon.formId]);

  // ── KO 分析引擎 ──
  const {
    loading,
    progress,
    attackResults,
    defenseResults,
    runAttackAnalysis,
    runDefenseAnalysis,
    clearResults,
  } = useKoAnalysis();

  // ── 选择招式 ──
  const handleSelectMove = useCallback((move: MoveInfo, idx: number) => {
    setMyMoves((prev) => {
      const next = [...prev];
      next[idx] = move;
      return next;
    });
    setSelectedMoveIdx(idx);
  }, []);

  // ── 开始分析 ──
  const handleAnalyze = useCallback(() => {
    if (targets.length === 0) return;

    const options = { generation, battleMode: "doubles" };

    if (analysisMode === "attack") {
      const move = myMoves[selectedMoveIdx];
      if (!move) return;
      runAttackAnalysis(myPokemon, move, targets, options);
    } else {
      runDefenseAnalysis(myPokemon, targets, options);
    }
  }, [analysisMode, myPokemon, myMoves, selectedMoveIdx, targets, generation, runAttackAnalysis, runDefenseAnalysis]);

  // ── 清除我方宝可梦 ──
  const handleClearMyPokemon = useCallback(() => {
    setMyPokemon({ ...createDraftMember(), statMode: isChampions ? "champions" : "classic" } as PokemonMember);
    setMyMoves([null, null, null, null]);
    setLearnset([]);
    clearResults();
  }, [isChampions, clearResults]);

  // ── 能否开始分析 ──
  const canAnalyze = useMemo(() => {
    if (!myPokemon.pokemonId) return false;
    if (targets.length === 0) return false;
    if (analysisMode === "attack" && !myMoves[selectedMoveIdx]) return false;
    return !loading;
  }, [myPokemon.pokemonId, targets.length, analysisMode, myMoves, selectedMoveIdx, loading]);

  const selectedMove = myMoves[selectedMoveIdx];

  return (
    <div className="ko-page">
      {/* 页面标题 */}
      <div className="ko-header">
        <h1>KO 分析器</h1>
        <span className="ko-header-desc">分析宝可梦的进攻覆盖和防御承受能力</span>
      </div>

      <div className="ko-body">
        {/* 左侧面板 */}
        <div className="ko-left-panel">
          {/* 我方宝可梦配置 */}
          <PokemonConfigPanel
            title="我的宝可梦"
            member={myPokemon}
            detail={myDetail}
            isChampions={isChampions}
            onChange={setMyPokemon}
            onClear={handleClearMyPokemon}
            boosts={myBoosts}
            onBoostChange={(key: string, val: number) => setMyBoosts((prev) => ({ ...prev, [key]: Math.max(-6, Math.min(6, val)) }))}
            level={50}
            curHP={0}
            onCurHPChange={() => {}}
            teraType={myTeraType}
            setTeraType={setMyTeraType}
            generation={generation}
          />

          {/* 分析设置 */}
          <div className="ko-settings">
            <h3 className="ko-settings-title">分析设置</h3>

            {/* 模式切换 */}
            <div className="ko-mode-toggle">
              <button
                className={`ko-mode-btn${analysisMode === "attack" ? " ko-mode-btn-active" : ""}`}
                onClick={() => { setAnalysisMode("attack"); clearResults(); }}
              >
                🗡️ 斩杀线
              </button>
              <button
                className={`ko-mode-btn${analysisMode === "defense" ? " ko-mode-btn-active" : ""}`}
                onClick={() => { setAnalysisMode("defense"); clearResults(); }}
              >
                🛡️ 防守线
              </button>
            </div>

            {/* 斩杀线模式：选择招式 */}
            {analysisMode === "attack" && myPokemon.pokemonId && (
              <div className="ko-move-select">
                <div className="ko-move-select-label">选择分析招式</div>
                <div className="ko-move-chips">
                  {[0, 1, 2, 3].map((idx) => {
                    const move = myMoves[idx];
                    if (!move) {
                      return (
                        <MovePickerChip
                          key={idx}
                          index={idx}
                          learnset={learnset}
                          onSelect={handleSelectMove}
                          isActive={false}
                        />
                      );
                    }
                    return (
                      <button
                        key={idx}
                        className={`ko-move-chip${selectedMoveIdx === idx ? " ko-move-chip-active" : ""}`}
                        onClick={() => setSelectedMoveIdx(idx)}
                      >
                        {move.nameZh}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 分析按钮 */}
            <button
              className="ko-analyze-btn"
              onClick={handleAnalyze}
              disabled={!canAnalyze}
            >
              {loading ? `分析中 (${progress.current}/${progress.total})…` : "开始分析"}
            </button>
          </div>

          {/* 目标管理 */}
          <KoTargetPanel targets={targets} onTargetsChange={setTargets} />
        </div>

        {/* 右侧：结果面板 */}
        <div className="ko-right-panel">
          {/* 进度 */}
          {loading && (
            <div className="ko-progress">
              <div className="ko-progress-bar">
                <div
                  className="ko-progress-fill"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
              <span className="ko-progress-text">{progress.current}/{progress.total}</span>
            </div>
          )}

          {/* 结果 */}
          {(attackResults || defenseResults) ? (
            <KoResultPanel
              mode={analysisMode}
              attackResults={attackResults}
              defenseResults={defenseResults}
              moveName={selectedMove?.nameZh}
            />
          ) : !loading && (
            <div className="ko-empty">
              <div className="ko-empty-icon">{analysisMode === "attack" ? "🗡️" : "🛡️"}</div>
              <div className="ko-empty-text">
                {!myPokemon.pokemonId
                  ? "请先选择你的宝可梦"
                  : targets.length === 0
                    ? "请添加目标宝可梦"
                    : analysisMode === "attack" && !selectedMove
                      ? "请选择一个招式"
                      : "点击「开始分析」查看结果"
                }
              </div>
              <div className="ko-empty-hint">
                {analysisMode === "attack"
                  ? "分析你的宝可梦对各目标的击杀能力"
                  : "分析目标宝可梦对你的威胁程度"
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// 内部子组件：招式选择 Chip（含下拉搜索）
// ═══════════════════════════════════════════════

interface MovePickerChipProps {
  index: number;
  learnset: LearnsetMove[];
  onSelect: (move: MoveInfo, idx: number) => void;
  isActive: boolean;
}

function MovePickerChip({ index, learnset, onSelect }: MovePickerChipProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // 过滤招式列表
  const filtered = useMemo(() => {
    if (!query.trim()) return learnset.slice(0, 30);
    const q = query.trim().toLowerCase();
    return learnset.filter((m) => m.nameZh.toLowerCase().includes(q)).slice(0, 30);
  }, [learnset, query]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = () => {
      // 简单处理：document click 关闭
      setTimeout(() => setOpen(false), 200);
    };
    // 延迟添加以避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener("click", handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handler);
    };
  }, [open]);

  if (!open) {
    return (
      <button
        className="ko-move-chip ko-move-chip-empty"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        + 招式{index + 1}
      </button>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }} onClick={(e) => e.stopPropagation()}>
      <input
        className="ko-move-chip"
        style={{ width: "120px" }}
        type="text"
        placeholder="输入招式名…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {filtered.length > 0 && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          width: "200px",
          maxHeight: "240px",
          overflowY: "auto",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          zIndex: 100,
          marginTop: "4px",
        }}>
          {filtered.map((move) => (
            <div
              key={move.id || move.nameZh}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: "0.8rem",
                borderBottom: "1px solid #f5f5f5",
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(move, index);
                setOpen(false);
                setQuery("");
              }}
            >
              <span>{move.nameZh}</span>
              {move.type && <span style={{ marginLeft: "6px", fontSize: "0.7rem", color: "#888" }}>{move.type}</span>}
              {move.power > 0 && <span style={{ marginLeft: "4px", fontSize: "0.7rem", color: "#888" }}>威力{move.power}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
