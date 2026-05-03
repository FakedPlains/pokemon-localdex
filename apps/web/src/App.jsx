import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createDraftMember } from "./utils/helpers.js";
import { ALL_TYPE_OPTIONS, GENERATION_OPTIONS } from "./utils/constants.js";
import PokedexPage from "./pages/PokedexPage.jsx";
import ItemsPage from "./pages/ItemsPage.jsx";
import MovesPage from "./pages/MovesPage.jsx";
import AbilitiesPage from "./pages/AbilitiesPage.jsx";
import TeamsPage from "./pages/TeamsPage.jsx";
import DamagePage from "./pages/DamagePage.jsx";

const NAV_ITEMS = [
  { key: "pokedex", label: "图鉴", hash: "#/pokedex" },
  { key: "abilities", label: "特性", hash: "#/abilities" },
  { key: "moves", label: "招式", hash: "#/moves" },
  { key: "items", label: "道具", hash: "#/items" },
  { key: "teams", label: "队伍", hash: "#/teams" },
  { key: "damage", label: "伤害", hash: "#/damage" }
];

/* Per-page search placeholder text */
const SEARCH_PLACEHOLDERS = {
  pokedex: "搜索宝可梦名称 / 编号…",
  items: "搜索道具名称 / 效果…",
  moves: "搜索招式名（中/英/日）…",
  abilities: "搜索特性名（中/英/日）…",
  teams: "队伍页暂无搜索",
  damage: "伤害页暂无搜索"
};

/* Pages that support the shared search */
const SEARCHABLE_PAGES = new Set(["pokedex", "items", "moves", "abilities"]);

/* Pages that show the floating filter panel */
const FILTERABLE_PAGES = new Set(["pokedex", "moves", "abilities"]);

/* Pages that show type filter */
const TYPE_FILTER_PAGES = new Set(["pokedex", "moves"]);

/* Pages that show generation filter */
const GEN_FILTER_PAGES = new Set(["pokedex", "moves", "abilities"]);

/* Pages that show category filter (moves only) */
const CATEGORY_FILTER_PAGES = new Set(["moves"]);

function parseRoute() {
  const hash = window.location.hash || "#/pokedex";
  const key = hash.replace("#/", "").split(/[/?]/)[0];
  return NAV_ITEMS.find((n) => n.key === key)?.key || "pokedex";
}

export default function App() {
  const [route, setRoute] = useState(parseRoute);

  // Shared team draft state (lifted from TeamsPage so DamagePage can import from it)
  const [teamDraft, setTeamDraft] = useState({
    id: "",
    name: "",
    format: "singles",
    members: Array.from({ length: 6 }, () => createDraftMember())
  });

  // ── Shared search state ──
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const composingRef = useRef(false);
  const debounceRef = useRef(null);

  // ── Shared filter state ──
  const [types, setTypes] = useState([]);
  const [generation, setGeneration] = useState("");
  const [moveCategory, setMoveCategory] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Reset search & filters when switching pages
  useEffect(() => {
    setInputValue("");
    setQuery("");
    setTypes([]);
    setGeneration("");
    setMoveCategory("");
    setFilterOpen(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, [route]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!composingRef.current) {
      debounceRef.current = setTimeout(() => setQuery(value), 300);
    }
  }, []);

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleCompositionEnd = useCallback((e) => {
    composingRef.current = false;
    const value = e.target.value;
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(value), 300);
  }, []);

  const handleTeamDraftChange = useCallback((updater) => {
    setTeamDraft((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const isSearchable = SEARCHABLE_PAGES.has(route);
  const isFilterable = FILTERABLE_PAGES.has(route);
  const showTypeFilter = TYPE_FILTER_PAGES.has(route);
  const showGenFilter = GEN_FILTER_PAGES.has(route);
  const showCategoryFilter = CATEGORY_FILTER_PAGES.has(route);
  const hasActiveFilters = types.length > 0 || generation !== "" || moveCategory !== "";

  const pageElement = useMemo(() => {
    switch (route) {
      case "pokedex":
        return <PokedexPage query={query} types={types} generation={generation} />;
      case "items":
        return <ItemsPage query={query} />;
      case "moves":
        return <MovesPage query={query} type={types.length > 0 ? types[0] : ""} category={moveCategory} generation={generation} />;
      case "abilities":
        return <AbilitiesPage query={query} generation={generation} />;
      case "teams":
        return <TeamsPage teamDraft={teamDraft} onTeamDraftChange={handleTeamDraftChange} />;
      case "damage":
        return <DamagePage teamDraft={teamDraft} />;
      default:
        return <PokedexPage query={query} types={types} generation={generation} />;
    }
  }, [route, query, types, generation, moveCategory, teamDraft, handleTeamDraftChange]);

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <a className="top-nav-brand" href="#/pokedex">
          <span className="top-nav-logo">🔴</span>
          <span className="top-nav-title">Pokemon LocalDex</span>
        </a>

        {/* Shared search box in nav */}
        {isSearchable && (
          <div className="nav-search-wrap">
            <svg className="nav-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8.5" cy="8.5" r="5.5" /><line x1="13" y1="13" x2="17" y2="17" />
            </svg>
            <input
              className="nav-search"
              placeholder={SEARCH_PLACEHOLDERS[route] || "搜索…"}
              value={inputValue}
              onChange={handleInputChange}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
            />
            {inputValue && (
              <button
                className="nav-search-clear"
                onClick={() => { setInputValue(""); setQuery(""); }}
                title="清除搜索"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="3" x2="11" y2="11" /><line x1="11" y1="3" x2="3" y2="11" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Filter toggle button */}
        {isFilterable && (
          <button
            className={`nav-filter-btn${filterOpen ? " nav-filter-btn-active" : ""}${hasActiveFilters ? " nav-filter-btn-has-active" : ""}`}
            onClick={() => setFilterOpen((v) => !v)}
            title="筛选"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 2h13l-5 6.5V13l-3 1.5V8.5L1.5 2z" />
            </svg>
            {hasActiveFilters && <span className="nav-filter-badge" />}
          </button>
        )}

        <div className="top-nav-links">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.key}
              href={item.hash}
              className={`top-nav-link${route === item.key ? " top-nav-link-active" : ""}`}
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Floating filter panel */}
      {isFilterable && filterOpen && (
        <div className="filter-panel-overlay" onClick={() => setFilterOpen(false)}>
          <div className="filter-panel" onClick={(e) => e.stopPropagation()}>
            <div className="filter-panel-header">
              <h3 className="filter-panel-title">筛选条件</h3>
              <button className="filter-panel-close" onClick={() => setFilterOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="3" x2="13" y2="13" /><line x1="13" y1="3" x2="3" y2="13" />
                </svg>
              </button>
            </div>

            {/* Generation filter */}
            {showGenFilter && (
              <div className="filter-section">
                <span className="filter-section-label">世代</span>
                <div className="filter-chips">
                  <button
                    className={`filter-chip${generation === "" ? " filter-chip-active" : ""}`}
                    onClick={() => setGeneration("")}
                  >全部</button>
                  {GENERATION_OPTIONS.map((g) => (
                    <button
                      key={g}
                      className={`filter-chip${generation === String(g) ? " filter-chip-active" : ""}`}
                      onClick={() => setGeneration(generation === String(g) ? "" : String(g))}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Type filter */}
            {showTypeFilter && (
              <div className="filter-section">
                <span className="filter-section-label">
                  属性
                  {route === "moves" && <span className="filter-hint">（招式页仅支持单选）</span>}
                </span>
                <div className="filter-chips">
                  {ALL_TYPE_OPTIONS.map((t) => {
                    const isActive = types.includes(t);
                    return (
                      <button
                        key={t}
                        data-type={t}
                        className={`filter-chip filter-chip-type${isActive ? " filter-chip-type-active" : ""}`}
                        onClick={() => {
                          if (route === "moves") {
                            // Moves page: single select
                            setTypes(isActive ? [] : [t]);
                          } else {
                            // Pokedex: multi select
                            setTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
                          }
                        }}
                      >
                        <img className="filter-type-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${t}@sm.png`} alt="" />
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Category filter (moves only) */}
            {showCategoryFilter && (
              <div className="filter-section">
                <span className="filter-section-label">分类</span>
                <div className="filter-chips">
                  <button
                    className={`filter-chip${moveCategory === "" ? " filter-chip-active" : ""}`}
                    onClick={() => setMoveCategory("")}
                  >全部</button>
                  {["物理", "特殊", "变化"].map((c) => (
                    <button
                      key={c}
                      className={`filter-chip${moveCategory === c ? " filter-chip-active" : ""}`}
                      onClick={() => setMoveCategory(moveCategory === c ? "" : c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Clear all filters */}
            {hasActiveFilters && (
              <button
                className="filter-clear-all"
                onClick={() => { setTypes([]); setGeneration(""); setMoveCategory(""); }}
              >
                清除所有筛选
              </button>
            )}
          </div>
        </div>
      )}

      <main className="main-panel">
        {pageElement}
      </main>
    </div>
  );
}
