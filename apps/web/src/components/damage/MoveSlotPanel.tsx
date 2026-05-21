import { useEffect, useRef, useState } from "react";
import type { MoveOption } from "./useDamageMoves";
import { api } from "../../utils/api";
import type { DataResponse, LearnsetResponse, PaginatedResponse } from "../../utils/apiTypes";
import type { LearnsetMeta } from "@pokemon-localdex/store-types";

//  子组件：招式槽位面板（4个招式，样式与盒子一致）
// ══════════════════════════════════════════════════════════════

type LearnsetEntry = {
  moveId?: number;
  moveNameZh?: string;
  moveType?: string;
  moveCategory?: string;
  movePower?: number | null;
  moveAccuracy?: number | null;
  movePP?: number | null;
  moveDescription?: string;
};

type LearnsetItem = {
  value: string;
  label: string;
  moveId: number | null;
  moveType: string;
  moveCategory: string;
  movePower: number | null;
  moveAccuracy: number | null;
  movePP: number | null;
  moveDescription: string;
};

type SearchMoveItem = {
  id: string;
  nameZh?: string;
  type?: string;
  category?: string;
  power?: number | null;
  accuracy?: number | null;
  pp?: number | null;
  description?: string;
};

type MoveInfoEntry = {
  type?: string;
  moveType?: string;
  power?: number;
};

export interface MoveSlotPanelProps {
  moves: string[];
  movesInfo: Record<string, MoveInfoEntry>;
  selectedIndex: number | null;
  onSelectSlot: (index: number | null) => void;
  onSetMove: (index: number, opt: MoveOption | null) => void;
  pokemonId: string;
  generation: string | number;
}

export default function MoveSlotPanel({ moves, movesInfo, selectedIndex, onSelectSlot, onSetMove, pokemonId, generation: _generation }: MoveSlotPanelProps) {
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [learnset, setLearnset] = useState<LearnsetItem[]>([]);
  const [learnsetLoaded, setLearnsetLoaded] = useState(false);
  const [searchResults, setSearchResults] = useState<LearnsetItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const learnsetPokemonRef = useRef<string | null>(null);

  // pokemonId 变化时重置 learnset 缓存标记
  useEffect(() => {
    if (pokemonId !== learnsetPokemonRef.current) {
      setLearnset([]);
      setLearnsetLoaded(false);
      learnsetPokemonRef.current = pokemonId;
    }
  }, [pokemonId]);

  // 懒加载：仅在打开编辑面板且尚未加载时请求 learnset
  useEffect(() => {
    if (editingSlot === null || !pokemonId || learnsetLoaded) return;
    let cancelled = false;
    setLoading(true);
    api<DataResponse<LearnsetMeta>>(`/pokemon/${pokemonId}/learnset/meta`).then((meta) => {
      if (cancelled) return;
      const gens = meta.data?.generations || [];
      const latestGen = gens.length > 0 ? gens[gens.length - 1] : 9;
      const formKeys = meta.data?.formKeys || [];
      const form = formKeys[0] || "default";
      return api<LearnsetResponse>(`/pokemon/${pokemonId}/learnset?generation=${latestGen}&form=${form}`);
    }).then((r) => {
      if (cancelled || !r) return;
      const entries = r.data?.moves || [];
      const seen = new Set<string>();
      const list: LearnsetItem[] = [];
      for (const entry of entries) {
        const name = entry.moveNameZh || String(entry.moveId ?? "");
        if (name && !seen.has(name)) {
          seen.add(name);
          list.push({
            value: name,
            label: name,
            moveId: entry.moveId ?? null,
            moveType: entry.moveType || "",
            moveCategory: entry.moveCategory || "",
            movePower: entry.movePower ?? null,
            moveAccuracy: entry.moveAccuracy ?? null,
            movePP: entry.movePP ?? null,
            moveDescription: entry.moveDescription || "",
          });
        }
      }
      setLearnset(list);
      setLearnsetLoaded(true);
      setLoading(false);
    }).catch(() => { if (!cancelled) { setLearnset([]); setLearnsetLoaded(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [editingSlot, pokemonId, learnsetLoaded]);

  // 搜索招式（防抖，走 /moves API）
  useEffect(() => {
    if (editingSlot === null) return;
    if (!query.trim()) { setSearchResults(null); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setLoading(true);
    searchTimer.current = setTimeout(() => {
      api<PaginatedResponse<SearchMoveItem>>(`/moves?q=${encodeURIComponent(query.trim())}&limit=50`).then((r) => {
        setSearchResults((r.data || []).map((m) => ({
          value: m.nameZh || String(m.id),
          label: m.nameZh || String(m.id),
          moveId: m.id ? Number(m.id) : null,
          moveType: m.type || "",
          moveCategory: m.category || "",
          movePower: m.power ?? null,
          moveAccuracy: m.accuracy ?? null,
          movePP: m.pp ?? null,
          moveDescription: m.description || "",
        })));
        setLoading(false);
      }).catch(() => { setSearchResults([]); setLoading(false); });
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, editingSlot]);

  // 点击外部关闭编辑
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setEditingSlot(null);
        setQuery("");
        setSearchResults(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayedMoves = searchResults !== null ? searchResults : learnset;

  const handleSlotClick = (index: number) => {
    if (moves[index]) {
      onSelectSlot(index);
    } else {
      setEditingSlot(index);
      setQuery("");
      setSearchResults(null);
    }
  };

  const _handleEditSlot = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSlot(index);
    setQuery("");
    setSearchResults(null);
  };

  const handlePickMove = (opt: LearnsetItem) => {
    if (editingSlot !== null) {
      const moveOption: MoveOption = {
        moveId: opt.moveId,
        value: opt.value,
        label: opt.label,
        moveType: opt.moveType,
        movePower: opt.movePower ?? undefined,
        moveCategory: opt.moveCategory,
      };
      onSetMove(editingSlot, moveOption);
      setEditingSlot(null);
      setQuery("");
      setSearchResults(null);
    }
  };

  const handleClearSlot = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onSetMove(index, null);
    if (selectedIndex === index) onSelectSlot(null);
  };

  return (
    <div className="dc-move-slots" ref={wrapRef}>
      {/* 4个招式槽位（盒子样式） */}
      <div className="dc-move-slots-grid">
        {[0, 1, 2, 3].map((i) => {
          const moveName = moves[i] ?? "";
          const info = movesInfo?.[moveName] || {};
          const moveType = info.type || info.moveType || "";
          const isSelected = selectedIndex === i && !!moveName;
          if (moveName) {
            return (
              <div
                key={i}
                className={`box-card-move type-bg-${moveType || "unknown"} dc-move-slot-card${isSelected ? " dc-move-slot-card-active" : ""}`}
                onClick={() => handleSlotClick(i)}
              >
                {moveType && (
                  <img className="box-card-move-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${moveType}@sm.png`} alt={moveType} />
                )}
                <span className="box-card-move-name">{moveName}</span>
                {info.power && info.power > 0 && <span className="box-card-move-power">{info.power}</span>}
                <button className="dc-move-slot-clear-btn" onClick={(e) => handleClearSlot(i, e)} title="清除">×</button>
              </div>
            );
          }
          return (
            <button
              key={i}
              className="dc-move-slot-empty-btn"
              onClick={() => handleSlotClick(i)}
            >
              招式 {i + 1}
            </button>
          );
        })}
      </div>

      {/* 招式搜索面板 */}
      {editingSlot !== null && (
        <div className="dc-move-panel-overlay">
          <div className="dc-move-panel-header">
            <input
              className="dc-move-panel-search-input"
              placeholder="搜索招式…"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && <button className="dc-move-panel-search-clear" onClick={() => { setQuery(""); setSearchResults(null); }}>✕</button>}
            <button className="dc-move-panel-close" onClick={() => { setEditingSlot(null); setQuery(""); setSearchResults(null); }}>取消</button>
          </div>
          <div className="dc-move-panel-list">
            {loading && <div className="dc-move-panel-hint">加载中…</div>}
            {!loading && displayedMoves.length === 0 && <div className="dc-move-panel-hint">{query.trim() ? "无匹配结果" : "暂无招式数据"}</div>}
            {!loading && displayedMoves.map((opt) => (
              <div
                key={opt.value}
                className={`dc-move-panel-item${moves.includes(opt.value) ? " dc-move-panel-item-selected" : ""}`}
                onClick={() => handlePickMove(opt)}
              >
                <span className={`dc-move-panel-item-type type-bg-${opt.moveType || "unknown"}`}>
                  {opt.moveType && <img className="box-card-move-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${opt.moveType}@sm.png`} alt="" />}
                  {opt.moveType || "—"}
                </span>
                <span className="dc-move-panel-item-name">{opt.label}</span>
                <span className="dc-move-panel-item-cat">
                  {opt.moveCategory === "physical" ? "物理" : opt.moveCategory === "special" ? "特殊" : "变化"}
                </span>
                <span className="dc-move-panel-item-power">{opt.movePower ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
