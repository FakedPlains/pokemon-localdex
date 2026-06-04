import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { TYPE_OPTIONS, CATEGORY_OPTIONS, GENERATION_OPTIONS } from "@pokemon-localdex/store-types/constants";
import { ToastProvider } from "./components/Toast.jsx";
import GlobalSearch from "./components/GlobalSearch.tsx";
import Loading from "./components/Loading.tsx";

const PokedexPage = lazy(() => import("./pages/PokedexPage.tsx"));
const ItemsPage = lazy(() => import("./pages/ItemsPage.jsx"));
const MovesPage = lazy(() => import("./pages/MovesPage.jsx"));
const AbilitiesPage = lazy(() => import("./pages/AbilitiesPage.jsx"));
const TeamsPage = lazy(() => import("./pages/TeamsPage.jsx"));
const DamagePage = lazy(() => import("./pages/DamagePage.tsx"));
const TypeChartPage = lazy(() => import("./pages/TypeChartPage.jsx"));
// KoAnalysisPage 现在由 DamagePage 内部 tab 切换渲染
const FieldEffectsPage = lazy(() => import("./pages/FieldEffectsPage.jsx"));

/* "资料库" 下拉子项 */
const DATABASE_ITEMS = [
  { key: "pokedex", label: "图鉴", hash: "#/pokedex", icon: "📖" },
  { key: "moves", label: "招式", hash: "#/moves", icon: "⚔️" },
  { key: "abilities", label: "特性", hash: "#/abilities", icon: "✨" },
  { key: "items", label: "道具", hash: "#/items", icon: "🎒" },
  { key: "field-effects", label: "场地", hash: "#/field-effects", icon: "🌊" },
];
const DATABASE_KEYS = new Set(DATABASE_ITEMS.map(i => i.key));

const NAV_ITEMS = [
  { key: "database", label: "资料库", children: DATABASE_ITEMS },
  { key: "teams", label: "队伍", hash: "#/teams" },
  { key: "damage", label: "对战", hash: "#/damage" },
  { key: "typechart", label: "克制表", hash: "#/typechart" }
];

/* Per-page search placeholder text */
const SEARCH_PLACEHOLDERS = {
  pokedex: "搜索宝可梦名称 / 编号…",
  items: "搜索道具名称 / 效果…",
  moves: "搜索招式名（中/英/日）…",
  abilities: "搜索特性名（中/英/日）…",
  teams: "队伍页暂无搜索",
  damage: "对战页暂无搜索",
  typechart: "克制表页暂无搜索"
};


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
  // #/pokemon?id=X 也映射到 pokedex
  if (key === "pokemon") return "pokedex";
  // #/ko 映射到 damage 页面（合并后由内部 tab 切换）
  if (key === "ko") return "damage";
  // 资料库下拉子项（pokedex/moves/abilities/items/field-effects）
  if (DATABASE_KEYS.has(key)) return key;
  // 顶层导航项（teams/damage/typechart 等，"database" 仅作为下拉容器，不会作为实际路由）
  const topLevel = NAV_ITEMS.find((n) => n.key === key && !n.children);
  return topLevel?.key || "pokedex";
}

function parsePokemonIdFromHash() {
  const hash = window.location.hash || "";
  if (!hash.startsWith("#/pokemon")) return null;
  const qIdx = hash.indexOf("?");
  if (qIdx < 0) return null;
  const params = new URLSearchParams(hash.slice(qIdx));
  return params.get("id") || null;
}

export default function App() {
  const [route, setRoute] = useState(parseRoute);
  const [initialPokemonId, setInitialPokemonId] = useState(parsePokemonIdFromHash);
  const initialPokemonIdRef = useRef(initialPokemonId);

  // ── Shared search state (driven by GlobalSearch component) ──
  const [query, setQuery] = useState("");

  // ── Shared filter state ──
  const [types, setTypes] = useState([]);
  const [generation, setGeneration] = useState("");
  const [moveCategory, setMoveCategory] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      const newId = parsePokemonIdFromHash();
      setRoute(parseRoute());
      setInitialPokemonId(newId);
      initialPokemonIdRef.current = newId;
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Reset filters when switching pages (search is reset by GlobalSearch internally)
  useEffect(() => {
    setQuery("");
    setTypes([]);
    setGeneration("");
    setMoveCategory("");
    setFilterOpen(false);
  }, [route]);

  const handleSearchQueryChange = useCallback((value) => {
    setQuery(value);
  }, []);

  const isFilterable = FILTERABLE_PAGES.has(route);
  const showTypeFilter = TYPE_FILTER_PAGES.has(route);
  const showGenFilter = GEN_FILTER_PAGES.has(route);
  const showCategoryFilter = CATEGORY_FILTER_PAGES.has(route);
  const hasActiveFilters = types.length > 0 || generation !== "" || moveCategory !== "";

  const consumeInitialPokemonId = useCallback(() => {
    setInitialPokemonId(null);
    initialPokemonIdRef.current = null;
  }, []);

  const pageElement = useMemo(() => {
    // Read initialPokemonId from ref so consuming it doesn't recreate the page component
    const pokemonId = initialPokemonIdRef.current;
    switch (route) {
      case "pokedex":
        return <PokedexPage query={query} types={types} generation={generation} initialPokemonId={pokemonId} onInitialPokemonConsumed={consumeInitialPokemonId} />;
      case "items":
        return <ItemsPage query={query} />;
      case "moves":
        return <MovesPage query={query} type={types.length > 0 ? types[0] : ""} category={moveCategory} generation={generation} />;
      case "abilities":
        return <AbilitiesPage query={query} generation={generation} />;
      case "teams":
        return <TeamsPage />;
      case "damage":
        return <DamagePage initialTab={window.location.hash.startsWith("#/ko") ? "ko" : "damage"} />;
      case "field-effects":
        return <FieldEffectsPage />;
      case "typechart":
        return <TypeChartPage />;
      default:
        return <PokedexPage query={query} types={types} generation={generation} initialPokemonId={pokemonId} onInitialPokemonConsumed={consumeInitialPokemonId} />;
    }
    // Note: initialPokemonId is intentionally read from ref, not listed as dependency.
    // This prevents the page component from being recreated when the id is consumed.
  }, [route, query, types, generation, moveCategory, consumeInitialPokemonId]);

  return (
    <ToastProvider>
    <div className="app-shell">
      <nav className="top-nav">
        <a className="top-nav-brand" href="#/pokedex">
          <span className="top-nav-logo">🔴</span>
          <span className="top-nav-title">Pokemon LocalDex</span>
        </a>

        {/* Global aggregated search */}
        <GlobalSearch
          route={route}
          onQueryChange={handleSearchQueryChange}
          placeholder={SEARCH_PLACEHOLDERS[route] || "搜索宝可梦、招式、特性、道具、场地…"}
        />

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
          {NAV_ITEMS.map((item) => {
            if (item.children) {
              const isActive = DATABASE_KEYS.has(route);
              return (
                <div key={item.key} className="top-nav-dropdown-wrap">
                  <button
                    className={`top-nav-link top-nav-dropdown-trigger${isActive ? " top-nav-link-active" : ""}`}
                  >
                    {item.label}
                    <svg className="top-nav-dropdown-arrow" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 4 L5 6.5 L7.5 4" />
                    </svg>
                  </button>
                  <div className="top-nav-dropdown-menu">
                    {item.children.map((child) => (
                      <a
                        key={child.key}
                        href={child.hash}
                        className={`top-nav-dropdown-item${route === child.key ? " top-nav-dropdown-item-active" : ""}`}
                      >
                        <span className="top-nav-dropdown-item-icon">{child.icon}</span>
                        {child.label}
                      </a>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <a
                key={item.key}
                href={item.hash}
                className={`top-nav-link${route === item.key ? " top-nav-link-active" : ""}`}
              >
                {item.label}
              </a>
            );
          })}
        </div>

        <a
          className="top-nav-github"
          href="https://github.com/FakedPlains/pokemon-localdex"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub"
        >
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
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
                  {TYPE_OPTIONS.map((type) => {
                    const isActive = types.includes(type.nameZh);
                    return (
                      <button
                        key={type.id}
                        data-type={type.nameZh}
                        className={`filter-chip filter-chip-type${isActive ? " filter-chip-type-active" : ""}`}
                        onClick={() => {
                          if (route === "moves") {
                            // Moves page: single select
                            setTypes(isActive ? [] : [type.nameZh]);
                          } else {
                            // Pokedex: multi select
                            setTypes((prev) => prev.includes(type.nameZh) ? prev.filter((x) => x !== type.nameZh) : [...prev, type.nameZh]);
                          }
                        }}
                      >
                        <img className="filter-type-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${type.nameZh}@sm.png`} alt="" />
                        {type.nameZh}
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
                  {CATEGORY_OPTIONS.map((category) => (
                    <button
                      key={category.id}
                      className={`filter-chip${moveCategory === category.nameZh ? " filter-chip-active" : ""}`}
                      onClick={() => setMoveCategory(moveCategory === category.nameZh ? "" : category.nameZh)}
                    >
                      {category.nameZh}
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
        <Suspense fallback={<Loading text="资料加载中…" />}>
          {pageElement}
        </Suspense>
      </main>
    </div>
    </ToastProvider>
  );
}
