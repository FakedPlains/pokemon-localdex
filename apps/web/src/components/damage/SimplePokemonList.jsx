import { useCallback, useEffect, useRef, useState } from "react";
import { unifiedApi } from "../../utils/api.js";
import { getPokemonPreviewImage } from "../../utils/helpers.js";
import TypeChip from "../TypeChip.jsx";
import Loading from "../Loading.tsx";

//  子组件：简洁宝可梦选择列表（图片 + 名称 + 属性）
// ══════════════════════════════════════════════════════════════

export default function SimplePokemonList({ search, onSelect }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const listRef = useRef(null);
  const searchRef = useRef(search);

  const loadPage = useCallback(async (currentOffset, query, reset = false) => {
    try {
      const params = new URLSearchParams({ limit: "40", offset: String(currentOffset) });
      if (query.trim()) params.set("q", query.trim());
      const r = await unifiedApi(`/pokemon?${params.toString()}`);
      const list = r.data || [];
      if (reset) setData(list); else setData((prev) => [...prev, ...list]);
      setHasMore(list.length >= 40);
      setOffset(currentOffset + list.length);
    } catch { setHasMore(false); }
    setLoading(false);
  }, []);

  useEffect(() => {
    searchRef.current = search;
    setData([]);
    setOffset(0);
    setHasMore(true);
    setLoading(true);
    loadPage(0, search, true);
  }, [search, loadPage]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!hasMore || loading) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
        loadPage(offset, searchRef.current, false);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [offset, hasMore, loading, loadPage]);

  return (
    <div className="dc-simple-list" ref={listRef}>
      {data.map((p) => {
        const img = getPokemonPreviewImage(p);
        return (
          <button key={p.id} className="dc-simple-list-item" onClick={() => onSelect(p)}>
            {img?.url && <img className="dc-simple-list-img" src={img.url} alt="" referrerPolicy="no-referrer" />}
            <span className="dc-simple-list-name">{p.nameZh || ""}</span>
            <span className="dc-simple-list-types">
              {p.primaryType && <TypeChip type={p.primaryType} size="xs" />}
              {p.secondaryType && <TypeChip type={p.secondaryType} size="xs" />}
            </span>
          </button>
        );
      })}
      {loading && <Loading variant="text" text="加载中…" className="dc-simple-list-hint" />}
      {!loading && data.length === 0 && <div className="dc-simple-list-hint">没有找到匹配的宝可梦</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
