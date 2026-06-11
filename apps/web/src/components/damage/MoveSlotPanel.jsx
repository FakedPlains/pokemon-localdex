import { useEffect, useRef, useState } from "react";
import { unifiedApi } from "../../utils/api.js";
import Loading from "../Loading.tsx";

//  子组件：招式槽位面板（4个招式，样式与盒子一致）
// ══════════════════════════════════════════════════════════════

export default function MoveSlotPanel({ moves, movesInfo, selectedIndex, onSelectSlot, onSetMove, pokemonId, generation, formId }) {
  const [editingSlot, setEditingSlot] = useState(null);
  const [query, setQuery] = useState("");
  const [learnset, setLearnset] = useState([]);
  const [learnsetLoaded, setLearnsetLoaded] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const searchTimer = useRef(null);
  const learnsetPokemonRef = useRef(null);
  const learnsetFormRef = useRef(null);

  // pokemonId 或 formId 变化时重置 learnset 缓存标记
  useEffect(() => {
    if (pokemonId !== learnsetPokemonRef.current || formId !== learnsetFormRef.current) {
      setLearnset([]);
      setLearnsetLoaded(false);
      learnsetPokemonRef.current = pokemonId;
      learnsetFormRef.current = formId;
    }
  }, [pokemonId, formId]);

  // 懒加载：仅在打开编辑面板且尚未加载时请求 learnset
  useEffect(() => {
    if (editingSlot === null || !pokemonId || learnsetLoaded) return;
    let cancelled = false;
    setLoading(true);
    unifiedApi(`/pokemon/${pokemonId}/learnset/meta`).then((meta) => {
      if (cancelled) return;
      const gens = meta.data?.generations || [];
      const latestGen = gens.length > 0 ? gens[gens.length - 1] : 9;
      const metaForms = meta.data?.forms || [];
      // 优先使用传入的 formId 精确匹配，否则选择默认形态
      const matchedForm = (formId && metaForms.find(f => f.formId === Number(formId))) || metaForms.find(f => f.isDefault) || metaForms[0];
      const resolvedFormId = matchedForm?.formId;
      const formIdParam = resolvedFormId ? `&formId=${resolvedFormId}` : "";
      return unifiedApi(`/pokemon/${pokemonId}/learnset?generation=${latestGen}${formIdParam}`);
    }).then((r) => {
      if (cancelled || !r) return;
      const entries = r.data || [];
      const seen = new Set();
      const list = [];
      for (const entry of entries) {
        const name = entry.moveNameZh || entry.moveId;
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
  }, [editingSlot, pokemonId, formId, learnsetLoaded]);

  // 搜索招式（防抖，走 /moves API）
  useEffect(() => {
    if (editingSlot === null) return;
    if (!query.trim()) { setSearchResults(null); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setLoading(true);
    searchTimer.current = setTimeout(() => {
      unifiedApi(`/moves?q=${encodeURIComponent(query.trim())}&limit=50`).then((r) => {
        setSearchResults((r.data || []).map((m) => ({
          value: m.nameZh || String(m.id),
          label: m.nameZh || String(m.id),
          moveId: m.id || null,
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
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setEditingSlot(null);
        setQuery("");
        setSearchResults(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayedMoves = searchResults !== null ? searchResults : learnset;

  const handleSlotClick = (index) => {
    if (moves[index]) {
      onSelectSlot(index);
    } else {
      setEditingSlot(index);
      setQuery("");
      setSearchResults(null);
    }
  };

  const handleEditSlot = (index, e) => {
    e.stopPropagation();
    setEditingSlot(index);
    setQuery("");
    setSearchResults(null);
  };

  const handlePickMove = (opt) => {
    if (editingSlot !== null) {
      onSetMove(editingSlot, opt);
      setEditingSlot(null);
      setQuery("");
      setSearchResults(null);
    }
  };

  const handleClearSlot = (index, e) => {
    e.stopPropagation();
    onSetMove(index, null);
    if (selectedIndex === index) onSelectSlot(null);
  };

  return (
    <div className="dc-move-slots" ref={wrapRef}>
      {/* 4个招式槽位（盒子样式） */}
      <div className="dc-move-slots-grid">
        {[0, 1, 2, 3].map((i) => {
          const moveName = moves[i];
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
                {info.power > 0 && <span className="box-card-move-power">{info.power}</span>}
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
            {loading && <Loading variant="text" text="加载中…" className="dc-move-panel-hint" />}
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
