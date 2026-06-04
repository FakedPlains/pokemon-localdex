/**
 * KO 分析引擎 Hook
 * 负责批量调用伤害计算 API，汇总结果并分组
 */
import { useState, useCallback, useRef } from "react";
import { unifiedApi } from "../utils/api.js";
import {
  determineKO,
  checkImmunity,
  batchExecute,
  groupAttackResults,
  groupDefenseResults,
} from "../utils/koCalculation";
import type {
  PokemonMember,
  MoveInfo,
  TargetEntry,
  AttackResultItem,
  DefenseResultItem,
  AttackResultGroups,
  DefenseResultGroups,
} from "../utils/koCalculation";

interface CalcPayload {
  generation: number;
  attacker: {
    pokemonId: string;
    formId: string;
    name: string;
    level: number;
    nature: string;
    abilityId: string;
    ability: string;
    itemId: string;
    item: string;
    evs: Record<string, number>;
    ivs: Record<string, number>;
  };
  defender: {
    pokemonId: string;
    formId: string;
    name: string;
    level: number;
    nature: string;
    abilityId: string;
    ability: string;
    itemId: string;
    item: string;
    evs: Record<string, number>;
    ivs: Record<string, number>;
  };
  move: {
    id: string;
    name: string;
  };
  field: {
    gameType: string;
  };
}

interface Progress {
  current: number;
  total: number;
}

interface AnalysisOptions {
  generation?: string;
  battleMode?: string;
}

interface UseKoAnalysisReturn {
  loading: boolean;
  progress: Progress;
  attackResults: AttackResultGroups | null;
  defenseResults: DefenseResultGroups | null;
  runAttackAnalysis: (
    myPokemon: PokemonMember,
    move: MoveInfo,
    targets: TargetEntry[],
    options?: AnalysisOptions
  ) => Promise<void>;
  runDefenseAnalysis: (
    myPokemon: PokemonMember,
    targets: TargetEntry[],
    options?: AnalysisOptions
  ) => Promise<void>;
  clearResults: () => void;
}

/**
 * 构建伤害计算请求 payload（简化版，不需要完整的 DamagePage 状态）
 */
function buildSimpleCalcPayload({
  attacker,
  defender,
  move,
  generation,
  battleMode,
}: {
  attacker: PokemonMember;
  defender: PokemonMember;
  move: MoveInfo;
  generation: string;
  battleMode: string;
}): CalcPayload {
  return {
    generation: Number(generation),
    attacker: {
      pokemonId: attacker.pokemonId || "",
      formId: attacker.formId || "",
      name: attacker.nameZh || "",
      level: Number(attacker.level || 50),
      nature: attacker.nature || "认真",
      abilityId: attacker.abilityId || "",
      ability: attacker.abilityName || "",
      itemId: attacker.itemId || "",
      item: attacker.itemName || "",
      evs: attacker.statMode === "champions" ? (attacker.sps || {}) : (attacker.evs || {}),
      ivs: attacker.ivs || {},
    },
    defender: {
      pokemonId: defender.pokemonId || "",
      formId: defender.formId || "",
      name: defender.nameZh || "",
      level: Number(defender.level || 50),
      nature: defender.nature || "认真",
      abilityId: defender.abilityId || "",
      ability: defender.abilityName || "",
      itemId: defender.itemId || "",
      item: defender.itemName || "",
      evs: defender.statMode === "champions" ? (defender.sps || {}) : (defender.evs || {}),
      ivs: defender.ivs || {},
    },
    move: {
      id: move.id || "",
      name: move.nameZh || move.name || "",
    },
    field: {
      gameType: battleMode || "doubles",
    },
  };
}

/**
 * useKoAnalysis Hook
 */
export default function useKoAnalysis(): UseKoAnalysisReturn {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<Progress>({ current: 0, total: 0 });
  const [attackResults, setAttackResults] = useState<AttackResultGroups | null>(null);
  const [defenseResults, setDefenseResults] = useState<DefenseResultGroups | null>(null);
  const abortRef = useRef(false);

  /**
   * 斩杀线分析：我方用某招式打所有目标
   */
  const runAttackAnalysis = useCallback(async (
    myPokemon: PokemonMember,
    move: MoveInfo,
    targets: TargetEntry[],
    options: AnalysisOptions = {}
  ) => {
    const { generation = "0", battleMode = "doubles" } = options;
    setLoading(true);
    setProgress({ current: 0, total: targets.length });
    abortRef.current = false;

    let completed = 0;

    // 先做免疫预判
    const tasks = targets.map((target) => {
      return async (): Promise<AttackResultItem | null> => {
        if (abortRef.current) return null;

        const targetMember = target.member;
        const moveType = move.type || "";

        // 免疫检查
        const immuneInfo = checkImmunity(
          moveType,
          targetMember.primaryType || "",
          targetMember.secondaryType || "",
          targetMember.abilityName || ""
        );

        if (immuneInfo.immune) {
          completed++;
          setProgress({ current: completed, total: targets.length });
          return {
            target: targetMember,
            immuneInfo,
            koResult: null,
            damageData: null,
          };
        }

        // 调用伤害计算 API
        try {
          const payload = buildSimpleCalcPayload({
            attacker: myPokemon,
            defender: targetMember,
            move,
            generation,
            battleMode,
          });

          const resp = await unifiedApi("/battle/damage", {
            method: "POST",
            body: JSON.stringify(payload),
          });

          const data = (resp as any).data || resp;
          const damageRolls: number[] = data.damageRolls || [];
          const defenderHp: number = data.defenderHp || 0;
          const koResult = determineKO(damageRolls, defenderHp);

          completed++;
          setProgress({ current: completed, total: targets.length });

          return {
            target: targetMember,
            immuneInfo: { immune: false, reason: "" },
            koResult,
            damageData: {
              min: data.min,
              max: data.max,
              damageRolls,
              defenderHp,
              minPercent: data.minPercent || 0,
              maxPercent: data.maxPercent || 0,
              description: data.description || "",
            },
          };
        } catch (err: any) {
          completed++;
          setProgress({ current: completed, total: targets.length });
          return {
            target: targetMember,
            immuneInfo: { immune: false, reason: "" },
            koResult: null,
            damageData: null,
            error: err.message,
          };
        }
      };
    });

    const rawResults = await batchExecute(tasks as Array<() => Promise<AttackResultItem | null>>, 6);
    const validResults = rawResults.filter(Boolean) as AttackResultItem[];

    const grouped = groupAttackResults(validResults);
    setAttackResults(grouped);
    setLoading(false);
  }, []);

  /**
   * 防守线分析：所有目标用各自的主流招式打我方
   */
  const runDefenseAnalysis = useCallback(async (
    myPokemon: PokemonMember,
    targets: TargetEntry[],
    options: AnalysisOptions = {}
  ) => {
    const { generation = "0", battleMode = "doubles" } = options;

    // 每个目标取使用率最高的攻击招式（最多 2 个）
    const calcPairs: Array<{ attacker: PokemonMember; move: MoveInfo; target: TargetEntry }> = [];
    for (const target of targets) {
      const moves = (target.moves || []).slice(0, 2);
      if (moves.length === 0) {
        // 如果没有配招信息，用占位
        calcPairs.push({ attacker: target.member, move: { id: "", nameZh: "未知招式", type: "" }, target });
      } else {
        for (const move of moves) {
          calcPairs.push({ attacker: target.member, move, target });
        }
      }
    }

    setLoading(true);
    setProgress({ current: 0, total: calcPairs.length });
    abortRef.current = false;

    let completed = 0;

    const tasks = calcPairs.map(({ attacker, move }) => {
      return async (): Promise<DefenseResultItem | null> => {
        if (abortRef.current) return null;

        const moveType = move.type || "";

        // 免疫检查（我方是否免疫对方的招式）
        const immuneInfo = checkImmunity(
          moveType,
          myPokemon.primaryType || "",
          myPokemon.secondaryType || "",
          myPokemon.abilityName || ""
        );

        if (immuneInfo.immune) {
          completed++;
          setProgress({ current: completed, total: calcPairs.length });
          return {
            source: attacker,
            moveName: move.nameZh || move.name || "未知",
            moveType,
            immuneInfo,
            koResult: null,
            damageData: null,
          };
        }

        try {
          const payload = buildSimpleCalcPayload({
            attacker,
            defender: myPokemon,
            move,
            generation,
            battleMode,
          });

          const resp = await unifiedApi("/battle/damage", {
            method: "POST",
            body: JSON.stringify(payload),
          });

          const data = (resp as any).data || resp;
          const damageRolls: number[] = data.damageRolls || [];
          const defenderHp: number = data.defenderHp || 0;
          const koResult = determineKO(damageRolls, defenderHp);

          completed++;
          setProgress({ current: completed, total: calcPairs.length });

          return {
            source: attacker,
            moveName: move.nameZh || move.name || "未知",
            moveType,
            immuneInfo: { immune: false, reason: "" },
            koResult,
            damageData: {
              min: data.min,
              max: data.max,
              damageRolls,
              defenderHp,
              minPercent: data.minPercent || 0,
              maxPercent: data.maxPercent || 0,
              description: data.description || "",
            },
          };
        } catch (err: any) {
          completed++;
          setProgress({ current: completed, total: calcPairs.length });
          return {
            source: attacker,
            moveName: move.nameZh || move.name || "未知",
            moveType,
            immuneInfo: { immune: false, reason: "" },
            koResult: null,
            damageData: null,
            error: err.message,
          };
        }
      };
    });

    const rawResults = await batchExecute(tasks as Array<() => Promise<DefenseResultItem | null>>, 6);
    const validResults = rawResults.filter(Boolean) as DefenseResultItem[];

    const grouped = groupDefenseResults(validResults);
    setDefenseResults(grouped);
    setLoading(false);
  }, []);

  const clearResults = useCallback(() => {
    setAttackResults(null);
    setDefenseResults(null);
    setProgress({ current: 0, total: 0 });
    abortRef.current = true;
  }, []);

  return {
    loading,
    progress,
    attackResults,
    defenseResults,
    runAttackAnalysis,
    runDefenseAnalysis,
    clearResults,
  };
}
