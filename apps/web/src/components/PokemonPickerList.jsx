import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { unifiedApi } from "../utils/api.js";
import { STAT_KEYS } from "@pokemon-localdex/store-types/constants";
import { getPokemonPreviewImage } from "../utils/helpers.js";

/**
 * 宝可梦选择列表（横向表格样式，按需分页加载）
 *
 * Props:
 *   search   - 搜索关键词
 *   onSelect - 选中宝可梦回调，参数为宝可梦数据对象
 */

const PAGE_SIZE = 50;

export default function PokemonPickerList({ search = "", onSelect }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("desc");
  const [allData, setAllData] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const tableWrapRef = useRef(null);
  const searchRef = useRef(search);

  const loadPage = useCallback(async (currentOffset, query, reset = false) => {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(currentOffset) });
      if (query.trim()) params.set("q", query.trim());
      const r = await unifiedApi(`/pokemon?${params.toString()}`);
      const list = r.data || [];
      if (reset) {
        setAllData(list);
      } else {
        setAllData((prev) => [...prev, ...list]);
      }
      setHasMore(list.length >= PAGE_SIZE);
      setOffset(currentOffset + list.length);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    searchRef.current = search;
    setAllData([]);
    setOffset(0);
    setHasMore(true);
    setInitialLoading(true);
    loadPage(0, search, true);
  }, [search, loadPage]);

  useEffect(() => {
    const wrap = tableWrapRef.current;
    if (!wrap) return;
    const handleScroll = () => {
      if (loadingMore || !hasMore) return;
      if (wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 60) {
        loadPage(offset, searchRef.current, false);
      }
    };
    wrap.addEventListener("scroll", handleScroll, { passive: true });
    return () => wrap.removeEventListener("scroll", handleScroll);
  }, [offset, hasMore, loadingMore, loadPage]);

  const visible = useMemo(() => {
    if (!sortKey) return allData;
    return [...allData].sort((a, b) => {
      const va = (sortKey === "bst")
        ? STAT_KEYS.reduce((s, k) => s + (a.baseStats?.[k] || 0), 0)
        : (a.baseStats?.[sortKey] || 0);
      const vb = (sortKey === "bst")
        ? STAT_KEYS.reduce((s, k) => s + (b.baseStats?.[k] || 0), 0)
        : (b.baseStats?.[sortKey] || 0);
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [allData, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const statCols = [
    { key: "hp", label: "HP" },
    { key: "atk", label: "Atk" },
    { key: "def", label: "Def" },
    { key: "spa", label: "SpA" },
    { key: "spd", label: "SpD" },
    { key: "spe", label: "Spe" },
    { key: "bst", label: "BST" },
  ];

  return (
    <div className="cfg-picker">
      <div className="cfg-picker-table-wrap" ref={tableWrapRef}>
        <table className="cfg-picker-table">
          <thead>
            <tr>
              <th className="cfg-th-img"></th>
              <th className="cfg-th-name">名称</th>
              <th className="cfg-th-types">属性</th>
              <th className="cfg-th-abilities">特性</th>
              {statCols.map((col) => (
                <th
                  key={col.key}
                  className={`cfg-th-stat${sortKey === col.key ? " cfg-th-stat-active" : ""}`}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && <span className="cfg-sort-arrow">{sortDir === "desc" ? "▼" : "▲"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const img = getPokemonPreviewImage(p);
              const bst = STAT_KEYS.reduce((s, k) => s + (p.baseStats?.[k] || 0), 0);
              return (
                <tr key={p.slug || p.id} className="cfg-picker-row" onClick={() => onSelect(p)}>
                  <td className="cfg-td-img">
                    {img?.url && <img src={img.url} alt={p.nameZh || ""} referrerPolicy="no-referrer" />}
                  </td>
                  <td className="cfg-td-name">
                    <span className="cfg-td-name-zh">{p.nameZh || p.slug}</span>
                    <span className="cfg-td-name-en">{p.nameEn || ""}</span>
                  </td>
                  <td className="cfg-td-types">
                    {p.primaryType && (
                      <span className={`type-chip type-${p.primaryType}`}>
                        <img className="type-chip-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${p.primaryType}@sm.png`} alt="" />
                        {p.primaryType}
                      </span>
                    )}
                    {p.secondaryType && (
                      <span className={`type-chip type-${p.secondaryType}`}>
                        <img className="type-chip-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${p.secondaryType}@sm.png`} alt="" />
                        {p.secondaryType}
                      </span>
                    )}
                  </td>
                  <td className="cfg-td-abilities">
                    {(p.abilities || []).map((a) => <span key={a} className="cfg-ability-pill">{a}</span>)}
                    {p.hiddenAbility && <span className="cfg-ability-pill cfg-ability-ha">{p.hiddenAbility}</span>}
                  </td>
                  {STAT_KEYS.map((k) => (
                    <td key={k} className="cfg-td-stat">{p.baseStats?.[k] || "—"}</td>
                  ))}
                  <td className="cfg-td-stat cfg-td-bst">{bst}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {initialLoading && (
          <div className="cfg-picker-empty">加载中…</div>
        )}
        {!initialLoading && allData.length === 0 && (
          <div className="cfg-picker-empty">没有找到匹配的宝可梦</div>
        )}
        {loadingMore && !initialLoading && (
          <div className="cfg-picker-empty" style={{ padding: "8px 0" }}>加载更多…</div>
        )}
      </div>
    </div>
  );
}
