import { useCallback, useState } from "react";
import type { MoveEntry } from "@pokemon-localdex/store-types";
import { unifiedApi } from "../../utils/api.js";

export type MoveOption = {
  moveId?: number | null;
  value?: string;
  label?: string;
  moveType?: string;
  movePower?: number;
  moveCategory?: string;
  _moveObj?: MoveEntry;
  [key: string]: unknown;
};

type MoveInfo = {
  moveId: number | null;
  type: string;
  power: number;
  category: string;
  _opt: MoveOption;
};

const EMPTY_MOVES: [string, string, string, string] = ["", "", "", ""];

function moveInfoFromOption(opt: MoveOption): MoveInfo {
  return {
    moveId: opt.moveId || null,
    type: opt.moveType || "",
    power: opt.movePower ?? 0,
    category: opt.moveCategory || "",
    _opt: opt,
  };
}

function fetchMoveDetail(name: string, moveId: number | null): Promise<MoveEntry | undefined> {
  const request = moveId
    ? unifiedApi(`/moves/${moveId}`)
    : unifiedApi(`/moves?q=${encodeURIComponent(name)}&limit=5`);

  return request.then((r) => {
    const data = r.data as MoveEntry | MoveEntry[];
    return Array.isArray(data) ? data.find((m) => m.nameZh === name || (m as Record<string, unknown>).slug === name) : data;
  });
}

export default function useDamageMoves() {
  const [atkMoves, setAtkMoves] = useState<string[]>(EMPTY_MOVES);
  const [atkMovesInfo, setAtkMovesInfo] = useState<Record<string, MoveInfo>>({});
  const [atkSelectedSlot, setAtkSelectedSlot] = useState<number | null>(null);
  const [defMoves, setDefMoves] = useState<string[]>(EMPTY_MOVES);
  const [defMovesInfo, setDefMovesInfo] = useState<Record<string, MoveInfo>>({});
  const [defSelectedSlot, setDefSelectedSlot] = useState<number | null>(null);
  const [selectedMove, setSelectedMove] = useState<MoveEntry | null>(null);
  const [calcDirection, setCalcDirection] = useState<"atk" | "def">("atk");

  const applyMoveSelection = useCallback((index: number, opt: MoveOption | null, side: "atk" | "def") => {
    if (!opt) {
      if (side === "atk") {
        setAtkMoves((prev) => { const next = [...prev]; next[index] = ""; return next; });
        setAtkSelectedSlot(null);
      } else {
        setDefMoves((prev) => { const next = [...prev]; next[index] = ""; return next; });
        setDefSelectedSlot(null);
      }
      setSelectedMove(null);
      return;
    }

    const name = opt.value || opt.label || "";
    const info = moveInfoFromOption(opt);

    if (side === "atk") {
      setAtkMoves((prev) => { const next = [...prev]; next[index] = name; return next; });
      setAtkMovesInfo((prev) => ({ ...prev, [name]: info }));
      setAtkSelectedSlot(index);
    } else {
      setDefMoves((prev) => { const next = [...prev]; next[index] = name; return next; });
      setDefMovesInfo((prev) => ({ ...prev, [name]: info }));
      setDefSelectedSlot(index);
      setCalcDirection("def");
      setAtkSelectedSlot(null);
    }

    fetchMoveDetail(name, info.moveId).then((found) => {
      if (found) setSelectedMove(found);
    }).catch(() => {});
  }, []);

  const handleAtkSetMove = useCallback((index: number, opt: MoveOption | null) => {
    applyMoveSelection(index, opt, "atk");
  }, [applyMoveSelection]);

  const handleDefSetMove = useCallback((index: number, opt: MoveOption | null) => {
    applyMoveSelection(index, opt, "def");
  }, [applyMoveSelection]);

  const handleAtkSelectSlot = useCallback((index: number | null) => {
    if (index === null) { setAtkSelectedSlot(null); setSelectedMove(null); return; }
    setAtkSelectedSlot(index);
    setCalcDirection("atk");
    setDefSelectedSlot(null);

    const moveName = atkMoves[index];
    if (!moveName) return;
    const info = atkMovesInfo[moveName];
    if (info?._opt?._moveObj) {
      setSelectedMove(info._opt._moveObj);
      return;
    }

    fetchMoveDetail(moveName, info?.moveId ?? null).then((found) => {
      if (found) setSelectedMove(found);
    }).catch(() => {});
  }, [atkMoves, atkMovesInfo]);

  const handleDefSelectSlot = useCallback((index: number | null) => {
    if (index === null) { setDefSelectedSlot(null); setSelectedMove(null); return; }
    setDefSelectedSlot(index);
    setCalcDirection("def");
    setAtkSelectedSlot(null);

    const moveName = defMoves[index];
    if (!moveName) return;
    const info = defMovesInfo[moveName];
    if (info?._opt?._moveObj) {
      setSelectedMove(info._opt._moveObj);
      return;
    }

    fetchMoveDetail(moveName, info?.moveId ?? null).then((found) => {
      if (found) setSelectedMove(found);
    }).catch(() => {});
  }, [defMoves, defMovesInfo]);

  const syncMovesFromConfig = useCallback((cfg: { moves?: string[]; _movesInfo?: Record<string, { moveId?: number | null; type?: string; power?: string | number; category?: string; [k: string]: unknown }> }, side: "atk" | "def") => {
    const moves = cfg.moves || EMPTY_MOVES;
    const info = { ...(cfg._movesInfo || {}) } as Record<string, MoveInfo>;

    if (side === "atk") {
      setAtkMoves(moves);
      setAtkMovesInfo(info);
      setAtkSelectedSlot(null);
    } else {
      setDefMoves(moves);
      setDefMovesInfo(info);
      setDefSelectedSlot(null);
    }

    const missing = moves.filter((name) => name && (!info[name] || !info[name].type));
    if (missing.length === 0) return;

    for (const name of missing) {
      const moveId = info[name]?.moveId ?? null;
      fetchMoveDetail(name, moveId).then((found) => {
        if (!found) return;
        const patch: Partial<MoveInfo> = {
          moveId: found.id ? Number(found.id) : moveId,
          type: found.type || "",
          power: found.power ?? 0,
          category: found.category || "",
        };
        if (side === "atk") {
          setAtkMovesInfo((prev) => ({ ...prev, [name]: { ...prev[name]!, ...patch } }));
        } else {
          setDefMovesInfo((prev) => ({ ...prev, [name]: { ...prev[name]!, ...patch } }));
        }
      }).catch(() => {});
    }
  }, []);

  const clearAttackerMoves = useCallback(() => {
    setAtkMoves(EMPTY_MOVES);
    setAtkMovesInfo({});
    setAtkSelectedSlot(null);
    setSelectedMove(null);
  }, []);

  const clearDefenderMoves = useCallback(() => {
    setDefMoves(EMPTY_MOVES);
    setDefMovesInfo({});
    setDefSelectedSlot(null);
    setSelectedMove(null);
  }, []);

  const resetMoves = useCallback(() => {
    clearAttackerMoves();
    setDefMoves(EMPTY_MOVES);
    setDefMovesInfo({});
    setDefSelectedSlot(null);
    setCalcDirection("atk");
  }, [clearAttackerMoves]);

  return {
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
  };
}
