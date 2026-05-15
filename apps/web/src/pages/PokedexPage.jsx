import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { unifiedApi } from "../utils/api.js";
import { useApi } from "../hooks/useApi.js";
import { useInfiniteApi } from "../hooks/useInfiniteApi.js";
import Loading from "../components/Loading.jsx";
import PokedexCardList from "../components/pokedex/PokedexCardList.jsx";
import PokedexDetailPanel from "../components/pokedex/PokedexDetailPanel.jsx";
import PokedexTableList from "../components/pokedex/PokedexTableList.jsx";
import PokedexToolbar from "../components/pokedex/PokedexToolbar.jsx";

function formatSeasonLabel(season) {
  if (!season) return "";
  const parts = [season.seasonCode, season.regulationCode];
  if (season.regulationName && season.regulationName !== season.regulationCode) {
    parts.push(season.regulationName);
  }
  return parts.filter(Boolean).join(" · ");
}

/* ─── Main Page ─── */
export default function PokedexPage({ query = "", types = [], generation = "", initialPokemonId = null, onInitialPokemonConsumed }) {
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailGeneration, setDetailGeneration] = useState("");
  const [dexViewMode, setDexViewMode] = useState("card"); // "card" | "list"
  const [championsSeasonId, setChampionsSeasonId] = useState("");
  const [speedSortOrder, setSpeedSortOrder] = useState("");
  const [showSpeedLine, setShowSpeedLine] = useState(false);
  const [hasLoadedList, setHasLoadedList] = useState(false);
  const [lastList, setLastList] = useState([]);
  const [lastTotal, setLastTotal] = useState(0);

  const { data: championsSeasonsData = [], loading: seasonsLoading } = useApi("/champions/seasons");
  const championsSeasons = championsSeasonsData || [];
  const selectedSeason = useMemo(
    () => championsSeasons.find((season) => String(season.id) === championsSeasonId),
    [championsSeasons, championsSeasonId],
  );
  const championsSeasonOptions = useMemo(() => {
    const defaultLabel = seasonsLoading
      ? "加载赛季…"
      : championsSeasons.length === 0 ? "暂无赛季" : "全部赛季";
    return [
      { value: "", label: defaultLabel },
      ...championsSeasons.map((season) => ({
        value: String(season.id),
        label: formatSeasonLabel(season),
      })),
    ];
  }, [championsSeasons, seasonsLoading]);

  const detailRef = useRef(null);
  const activeCardRef = useRef(null);
  const prevSlugRef = useRef(null);  // remember slug before closing detail
  const filterChangedWhileOpenRef = useRef(false); // track filter changes with detail open
  const fromUrlNavRef = useRef(false); // true when selection comes from URL navigation (#/pokemon?id=X)

  // 构建分页请求路径
  const pokemonPath = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (types.length > 0) params.set("type", types.join(","));
    if (generation) params.set("generation", generation);
    if (championsSeasonId) params.set("seasonId", championsSeasonId);
    if (dexViewMode === "list" && speedSortOrder) {
      params.set("sort", "speed");
      params.set("order", speedSortOrder);
    }
    const qs = params.toString();
    const endpoint = dexViewMode === "list" ? "/pokemon/table" : "/pokemon/cards";
    return qs ? `${endpoint}?${qs}` : endpoint;
  }, [query, types, generation, championsSeasonId, speedSortOrder, dexViewMode]);

  // Mark that filters changed while detail panel is open
  useEffect(() => {
    if (selectedSlug && !fromUrlNavRef.current) {
      filterChangedWhileOpenRef.current = true;
    }
  }, [query, types, generation, championsSeasonId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: list, total, loading, hasMore, sentinelRef } = useInfiniteApi(pokemonPath, { pageSize: 60 });
  const isRefreshingList = loading && hasLoadedList;
  const displayList = isRefreshingList && list.length === 0 ? lastList : list;
  const displayTotal = isRefreshingList && list.length === 0 ? lastTotal : total;

  useEffect(() => {
    if (loading) return;
    setHasLoadedList(true);
    setLastList(list);
    setLastTotal(total);
  }, [list, loading, total]);

  // After list reloads due to filter change while detail is open:
  // - has results → auto-select the first pokemon
  // - no results  → close detail, show empty state
  useEffect(() => {
    if (!filterChangedWhileOpenRef.current || loading) return;
    filterChangedWhileOpenRef.current = false;

    if (list.length > 0) {
      const firstSlug = String(list[0].id);
      setSelectedSlug(firstSlug);
    } else {
      setSelectedSlug(null);
      setDetail(null);
    }
  }, [list, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // 从 URL 参数 (#/pokemon?id=X) 自动选中宝可梦
  useEffect(() => {
    if (!initialPokemonId) return;
    fromUrlNavRef.current = true; // mark so scroll handler scrolls to top instead of scrollIntoView
    setSelectedSlug(String(initialPokemonId));
    if (onInitialPokemonConsumed) onInitialPokemonConsumed();
    // 清理 URL hash，避免刷新后重复触发
    const hash = window.location.hash || "";
    if (hash.startsWith("#/pokemon")) {
      window.history.replaceState(null, "", "#/pokedex");
    }
  }, [initialPokemonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch detail when a card is selected
  useEffect(() => {
    if (!selectedSlug) { setDetail(null); return; }
    let cancelled = false;
    setDetail(null);
    const params = new URLSearchParams();
    if (championsSeasonId) params.set("seasonId", championsSeasonId);
    const qs = params.toString();
    unifiedApi(`/pokemon/${selectedSlug}/summary${qs ? `?${qs}` : ""}`).then((r) => {
      if (!cancelled) {
        setDetail(r.data);
        setDetailGeneration("");
      }
    });
    return () => { cancelled = true; };
  }, [selectedSlug, championsSeasonId]);

  // Scroll detail panel to top when detail changes
  useEffect(() => {
    if (detail && detailRef.current) {
      detailRef.current.scrollTop = 0;
    }
  }, [detail]);

  // Scroll handling for layout transitions.
  // Only scroll when layout actually changes (entering/leaving split view),
  // NOT when switching between pokemon within the split view.
  const scrollTimerRef = useRef(null);
  const hadSelectionRef = useRef(false); // was there a selection BEFORE this change?

  useEffect(() => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);

    const wasOpen = hadSelectionRef.current;
    const isOpen = !!selectedSlug;
    hadSelectionRef.current = isOpen;

    if (isOpen && !wasOpen) {
      // Entering split view from grid: scroll to the selected card after layout animation
      prevSlugRef.current = selectedSlug;
      const isFromUrl = fromUrlNavRef.current;
      fromUrlNavRef.current = false;
      scrollTimerRef.current = setTimeout(() => {
        if (isFromUrl) {
          // Navigated from another page (e.g. moves/abilities) — scroll to top so detail panel is visible
          window.scrollTo({ top: 0, behavior: "instant" });
        } else {
          const card = document.querySelector(`[data-slug="${CSS.escape(selectedSlug)}"]`);
          if (card) {
            card.scrollIntoView({ block: "start", behavior: "instant" });
          }
        }
      }, 380);
    } else if (isOpen && wasOpen) {
      // Switching pokemon within split view: just update prevSlug, no scroll
      prevSlugRef.current = selectedSlug;
    } else if (!isOpen && prevSlugRef.current) {
      // Closing detail: scroll back to the previously selected card
      const slugToRestore = prevSlugRef.current;
      scrollTimerRef.current = setTimeout(() => {
        const card = document.querySelector(`[data-slug="${CSS.escape(slugToRestore)}"]`);
        if (card) {
          card.scrollIntoView({ block: "center", behavior: "instant" });
        }
      }, 380);
    }

    return () => { if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current); };
  }, [selectedSlug]);

  const handleSelect = useCallback((slug) => {
    setSelectedSlug((prev) => (prev === slug ? null : slug));
  }, []);

  const handleClose = useCallback(() => {
    setSelectedSlug(null);
  }, []);

  const handleSpeedSortToggle = useCallback(() => {
    setSpeedSortOrder((prev) => {
      if (prev === "desc") return "asc";
      if (prev === "asc") return "";
      return "desc";
    });
  }, []);

  const handleSpeedLineToggle = useCallback(() => {
    if (!showSpeedLine) setDexViewMode("list");
    setShowSpeedLine((prev) => !prev);
  }, [showSpeedLine]);

  if (loading && list.length === 0 && !hasLoadedList) return <Loading />;

  const hasSelection = selectedSlug !== null;

  // 选中详情时强制使用卡片模式（紧凑列表）
  const effectiveViewMode = hasSelection ? "card" : dexViewMode;

  return (
    <div className="dex-page">
      <PokedexToolbar
        championsSeasonId={championsSeasonId}
        onChampionsSeasonChange={setChampionsSeasonId}
        championsSeasonOptions={championsSeasonOptions}
        seasonsLoading={seasonsLoading}
        championsSeasons={championsSeasons}
        selectedSeason={selectedSeason}
        isRefreshingList={isRefreshingList}
        displayTotal={displayTotal}
        hasSelection={hasSelection}
        displayListLength={displayList.length}
        showSpeedLine={showSpeedLine}
        onSpeedLineToggle={handleSpeedLineToggle}
        effectiveViewMode={effectiveViewMode}
        onViewModeChange={setDexViewMode}
      />

      <div className={`dex-body${hasSelection ? " dex-body-split" : ""}`}>
        {/* Left: Pokemon list — scrolls naturally with the page */}
        <div className={`dex-list-panel${hasSelection ? " dex-list-panel-narrow" : ""}`}>
          {effectiveViewMode === "card" ? (
            <PokedexCardList
              displayList={displayList}
              loading={loading}
              hasSelection={hasSelection}
              selectedSlug={selectedSlug}
              onSelect={handleSelect}
              hasMore={hasMore}
              sentinelRef={sentinelRef}
              activeCardRef={activeCardRef}
            />
          ) : (
            <PokedexTableList
              displayList={displayList}
              loading={loading}
              showSpeedLine={showSpeedLine}
              speedSortOrder={speedSortOrder}
              onSpeedSortToggle={handleSpeedSortToggle}
              onSelect={handleSelect}
              hasMore={hasMore}
              sentinelRef={sentinelRef}
            />
          )}
        </div>

        {/* Right: Detail panel — sticky so it stays visible while list scrolls */}
        <PokedexDetailPanel
          hasSelection={hasSelection}
          detailRef={detailRef}
          detail={detail}
          detailGeneration={detailGeneration}
          onDetailGenerationChange={setDetailGeneration}
          onClose={handleClose}
        />
      </div>
    </div>
  );
}
