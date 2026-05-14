import { useCallback, useState } from "react";
import { unifiedApi } from "../../utils/api.js";

const EMPTY_MOVES = ["", "", "", ""];

function moveInfoFromOption(opt) {
  return {
    moveId: opt.moveId || null,
    type: opt.moveType || "",
    power: opt.movePower ?? 0,
    category: opt.moveCategory || "",
    _opt: opt,
  };
}

function fetchMoveDetail(name, moveId) {
  const request = moveId
    ? unifiedApi(`/moves/${moveId}`)
    : unifiedApi(`/moves?q=${encodeURIComponent(name)}&limit=5`);

  return request.then((r) => (
    moveId ? r.data : (r.data || []).find((m) => m.nameZh === name || m.slug === name)
  ));
}

export default function useDamageMoves() {
  const [atkMoves, setAtkMoves] = useState(EMPTY_MOVES);
  const [atkMovesInfo, setAtkMovesInfo] = useState({});
  const [atkSelectedSlot, setAtkSelectedSlot] = useState(null);
  const [defMoves, setDefMoves] = useState(EMPTY_MOVES);
  const [defMovesInfo, setDefMovesInfo] = useState({});
  const [defSelectedSlot, setDefSelectedSlot] = useState(null);
  const [selectedMove, setSelectedMove] = useState(null);
  const [calcDirection, setCalcDirection] = useState("atk");

  const applyMoveSelection = useCallback((index, opt, side) => {
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

  const handleAtkSetMove = useCallback((index, opt) => {
    applyMoveSelection(index, opt, "atk");
  }, [applyMoveSelection]);

  const handleDefSetMove = useCallback((index, opt) => {
    applyMoveSelection(index, opt, "def");
  }, [applyMoveSelection]);

  const handleAtkSelectSlot = useCallback((index) => {
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

    fetchMoveDetail(moveName, info?.moveId).then((found) => {
      if (found) setSelectedMove(found);
    }).catch(() => {});
  }, [atkMoves, atkMovesInfo]);

  const handleDefSelectSlot = useCallback((index) => {
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

    fetchMoveDetail(moveName, info?.moveId).then((found) => {
      if (found) setSelectedMove(found);
    }).catch(() => {});
  }, [defMoves, defMovesInfo]);

  const syncMovesFromConfig = useCallback((cfg, side) => {
    const moves = cfg.moves || EMPTY_MOVES;
    const info = { ...(cfg._movesInfo || {}) };

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
      const moveId = info[name]?.moveId;
      fetchMoveDetail(name, moveId).then((found) => {
        if (!found) return;
        const patch = {
          moveId: found.id || moveId,
          type: found.type || "",
          power: found.power ?? 0,
          category: found.category || "",
        };
        if (side === "atk") {
          setAtkMovesInfo((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));
        } else {
          setDefMovesInfo((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));
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
