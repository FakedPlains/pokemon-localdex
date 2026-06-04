import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { unifiedApi } from "../utils/api.js";

// ── 类型定义 ──

interface SearchResultItem {
  id: string | number;
  nameZh: string;
  nameEn?: string;
  subtitle?: string;
  image?: string;
  types?: string[];
}

interface SearchResults {
  pokemon: SearchResultItem[];
  moves: SearchResultItem[];
  abilities: SearchResultItem[];
  items: SearchResultItem[];
  fieldEffects: SearchResultItem[];
}

interface CategoryConfig {
  key: keyof SearchResults;
  label: string;
  icon: string;
  route: string;
}

const CATEGORIES: CategoryConfig[] = [
  { key: "pokemon", label: "宝可梦", icon: "🔴", route: "#/pokemon?id=" },
  { key: "moves", label: "招式", icon: "⚔️", route: "#/moves?expand=" },
  { key: "abilities", label: "特性", icon: "✨", route: "#/abilities?expand=" },
  { key: "items", label: "道具", icon: "🎒", route: "#/items?expand=" },
  { key: "fieldEffects", label: "场地效果", icon: "🌊", route: "#/field-effects?expand=" },
];

// 把后端返回的搜索结果规整为每个分类都是数组，避免某分类缺失导致渲染时迭代 undefined 而崩溃
function normalizeResults(raw: Partial<SearchResults> | null | undefined): SearchResults {
  return {
    pokemon: Array.isArray(raw?.pokemon) ? raw!.pokemon : [],
    moves: Array.isArray(raw?.moves) ? raw!.moves : [],
    abilities: Array.isArray(raw?.abilities) ? raw!.abilities : [],
    items: Array.isArray(raw?.items) ? raw!.items : [],
    fieldEffects: Array.isArray(raw?.fieldEffects) ? raw!.fieldEffects : [],
  };
}

interface GlobalSearchProps {
  /** 当前路由 key，用于控制页面内搜索 */
  route: string;
  /** 回传搜索关键词到页面进行本地筛选 */
  onQueryChange: (query: string) => void;
  /** 当前页面搜索 placeholder */
  placeholder?: string;
}

export default function GlobalSearch({ route, onQueryChange, placeholder }: GlobalSearchProps) {
  const [inputValue, setInputValue] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const composingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 将所有结果平铺用于键盘导航
  const flatResults = useMemo(() => {
    if (!results) return [];
    const items: Array<{ category: keyof SearchResults; item: SearchResultItem }> = [];
    for (const cat of CATEGORIES) {
      for (const item of results[cat.key]) {
        items.push({ category: cat.key, item });
      }
    }
    return items;
  }, [results]);

  // 切换页面时清空
  useEffect(() => {
    setInputValue("");
    setResults(null);
    setShowDropdown(false);
    setActiveIndex(-1);
    onQueryChange("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (pageDebounceRef.current) clearTimeout(pageDebounceRef.current);
  }, [route]);

  // 点击外部关闭下拉
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 清理 debounce
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pageDebounceRef.current) clearTimeout(pageDebounceRef.current);
    };
  }, []);

  const fetchResults = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults(null);
      setShowDropdown(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await unifiedApi(`/search?q=${encodeURIComponent(query.trim())}&limit=5`);
      setResults(normalizeResults(res.data));
      setShowDropdown(true);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    setActiveIndex(-1);

    // 页面内搜索防抖（300ms）
    if (pageDebounceRef.current) clearTimeout(pageDebounceRef.current);
    if (!composingRef.current) {
      pageDebounceRef.current = setTimeout(() => onQueryChange(value), 300);
    }

    // 全局聚合搜索防抖（400ms，稍长以减少请求）
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!composingRef.current) {
      debounceRef.current = setTimeout(() => fetchResults(value), 400);
    }
  }, [fetchResults, onQueryChange]);

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (pageDebounceRef.current) clearTimeout(pageDebounceRef.current);
  }, []);

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false;
    const value = (e.target as HTMLInputElement).value;
    setInputValue(value);

    if (pageDebounceRef.current) clearTimeout(pageDebounceRef.current);
    pageDebounceRef.current = setTimeout(() => onQueryChange(value), 300);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(value), 400);
  }, [fetchResults, onQueryChange]);

  const handleClear = useCallback(() => {
    setInputValue("");
    setResults(null);
    setShowDropdown(false);
    setActiveIndex(-1);
    onQueryChange("");
    inputRef.current?.focus();
  }, [onQueryChange]);

  const handleFocus = useCallback(() => {
    // 如果有值且有结果，重新展示下拉
    if (inputValue.trim() && results) {
      setShowDropdown(true);
    }
  }, [inputValue, results]);

  const navigateTo = useCallback((category: keyof SearchResults, item: SearchResultItem) => {
    const cat = CATEGORIES.find(c => c.key === category);
    if (!cat) return;
    window.location.hash = cat.route + item.id;
    setShowDropdown(false);
    setActiveIndex(-1);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown || flatResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % flatResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const selected = flatResults[activeIndex];
      navigateTo(selected.category, selected.item);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  }, [showDropdown, flatResults, activeIndex, navigateTo]);

  // 判断是否有结果
  const hasResults = results && (
    results.pokemon.length > 0 ||
    results.moves.length > 0 ||
    results.abilities.length > 0 ||
    results.items.length > 0 ||
    results.fieldEffects.length > 0
  );

  let flatIdx = -1;

  return (
    <div className="global-search-wrap" ref={wrapRef}>
      <svg className="global-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8.5" cy="8.5" r="5.5" /><line x1="13" y1="13" x2="17" y2="17" />
      </svg>
      <input
        ref={inputRef}
        className="global-search-input"
        placeholder={placeholder || "搜索宝可梦、招式、特性、道具、场地…"}
        value={inputValue}
        onChange={handleInputChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
      />
      {inputValue && (
        <button className="global-search-clear" onClick={handleClear} title="清除搜索">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="3" x2="11" y2="11" /><line x1="11" y1="3" x2="3" y2="11" />
          </svg>
        </button>
      )}

      {/* 搜索结果下拉面板 */}
      {showDropdown && inputValue.trim() && (
        <div className="global-search-dropdown">
          {loading && (
            <div className="global-search-loading">搜索中…</div>
          )}
          {!loading && !hasResults && (
            <div className="global-search-empty">无匹配结果</div>
          )}
          {!loading && hasResults && CATEGORIES.map(cat => {
            const items = results![cat.key];
            if (items.length === 0) return null;
            return (
              <div key={cat.key} className="global-search-category">
                <div className="global-search-category-header">
                  <span className="global-search-category-icon">{cat.icon}</span>
                  <span className="global-search-category-label">{cat.label}</span>
                  <span className="global-search-category-count">{items.length}</span>
                </div>
                <div className="global-search-category-items">
                  {items.map(item => {
                    flatIdx++;
                    const currentIdx = flatIdx;
                    return (
                      <button
                        key={`${cat.key}-${item.id}`}
                        className={`global-search-item${currentIdx === activeIndex ? " global-search-item-active" : ""}`}
                        onClick={() => navigateTo(cat.key, item)}
                        onMouseEnter={() => setActiveIndex(currentIdx)}
                      >
                        {/* 图片（宝可梦/道具） */}
                        {item.image && (
                          <img className="global-search-item-img" src={item.image} alt="" loading="lazy" />
                        )}
                        {/* 属性图标（宝可梦没有图片时显示类型） */}
                        {!item.image && item.types && item.types.length > 0 && (
                          <div className="global-search-item-types">
                            {item.types.map(t => (
                              <img key={t} className="global-search-type-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${t}@sm.png`} alt={t} />
                            ))}
                          </div>
                        )}
                        <div className="global-search-item-text">
                          <span className="global-search-item-name">
                            {item.nameZh}
                            {item.nameEn && <span className="global-search-item-en">{item.nameEn}</span>}
                          </span>
                          {item.subtitle && (
                            <span className="global-search-item-subtitle">{item.subtitle}</span>
                          )}
                        </div>
                        {/* 属性 chips（宝可梦有图片时显示） */}
                        {item.image && item.types && item.types.length > 0 && (
                          <div className="global-search-item-type-chips">
                            {item.types.map(t => (
                              <span key={t} className={`type-chip type-${t}`}>
                                <img className="type-chip-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${t}@sm.png`} alt="" />
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
