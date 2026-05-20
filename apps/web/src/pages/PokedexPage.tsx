import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useApi } from "../hooks/useApi";
import { useInfiniteApi } from "../hooks/useInfiniteApi";
import Loading from "../components/Loading";
import PokedexCardList from "../components/pokedex/PokedexCardList";
import PokedexDetailPanel from "../components/pokedex/PokedexDetailPanel";
import PokedexTableList from "../components/pokedex/PokedexTableList";
import PokedexToolbar from "../components/pokedex/PokedexToolbar";
import type { PokemonEntry, PokemonCardSummary, PokemonTableSummary, ChampionsSeasonSummary } from "@pokemon-localdex/store-types";

export interface PokedexPageProps {
  query?: string;
  types?: string[];
  generation?: string;
  initialPokemonId?: string | null;
  onInitialPokemonConsumed?: () => void;
}

type _SeasonEntry = ChampionsSeasonSummary;

function formatSeasonLabel(season: ChampionsSeasonSummary): string {
  if (!season) return "";
  const parts: string[] = [season.seasonCode ?? "", season.regulationCode ?? ""];
  if (season.regulationName && season.regulationName !== season.regulationCode) {
    parts.push(season.regulationName);
  }
  return parts.filter(Boolean).join(" · ");
}

/* ─── Main Page ─── */
export default function PokedexPage({
  query = "",
  types = [],
  generation = "",
  initialPokemonId = null,
  onInitialPokemonConsumed,
}: PokedexPageProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<PokemonEntry | null>(null);
  const [detailGeneration, setDetailGeneration] = useState("");
  const [dexViewMode, setDexViewMode] = useState<"card" | "list">("card");
  const [championsSeasonId, setChampionsSeasonId] = useState("");
  const [speedSortOrder, setSpeedSortOrder] = useState<"desc" | "asc" | "">("");
  const [showSpeedLine, setShowSpeedLine] = useState(false);
  const [hasLoadedList, setHasLoadedList] = useState(false);
  const [lastCardList, setLastCardList] = useState<PokemonCardSummary[]>([]);
  const [lastTableList, setLastTableList] = useState<PokemonTableSummary[]>([]);
  const [lastTotal, setLastTotal] = useState(0);

  const { data: championsSeasonsData, loading: seasonsLoading } = useApi<ChampionsSeasonSummary[]>("/champions/seasons");
  const championsSeasons: ChampionsSeasonSummary[] = championsSeasonsData ?? [];
  const selectedSeason = useMemo(
    () => championsSeasons.find((season) => String(season.id) === championsSeasonId) ?? null,
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

  const detailRef = useRef<HTMLDivElement>(null);
  const activeCardRef = useCallback((_node: HTMLButtonElement | null) => {}, []);
  const prevSlugRef = useRef<string | null>(null);  // remember slug before closing detail
  const filterChangedWhileOpenRef = useRef(false); // track filter changes with detail open
  const fromUrlNavRef = useRef(false); // true when selection comes from URL navigation (#/pokemon?id=X)

  // 构建分页请求路径（card 和 table 各用独立 hook，通过 enabled 控制是否发请求）
  const baseParams = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (types.length > 0) params.set("type", types.join(","));
    if (generation) params.set("generation", generation);
    if (championsSeasonId) params.set("seasonId", championsSeasonId);
    return params;
  }, [query, types, generation, championsSeasonId]);

  const cardPath = useMemo(() => {
    const qs = baseParams.toString();
    return qs ? `/pokemon/cards?${qs}` : "/pokemon/cards";
  }, [baseParams]);

  const tablePath = useMemo(() => {
    const params = new URLSearchParams(baseParams);
    if (speedSortOrder) {
      params.set("sort", "speed");
      params.set("order", speedSortOrder);
    }
    const qs = params.toString();
    return qs ? `/pokemon/table?${qs}` : "/pokemon/table";
  }, [baseParams, speedSortOrder]);

  // Mark that filters changed while detail panel is open
  useEffect(() => {
    if (selectedSlug && !fromUrlNavRef.current) {
      filterChangedWhileOpenRef.current = true;
    }
  }, [query, types, generation, championsSeasonId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCardMode = dexViewMode === "card";
  const cardResult = useInfiniteApi<PokemonCardSummary>(cardPath, { pageSize: 60, enabled: isCardMode });
  const tableResult = useInfiniteApi<PokemonTableSummary>(tablePath, { pageSize: 60, enabled: !isCardMode });

  // 统一输出：根据当前模式选择活跃 hook 的返回值
  const list: PokemonCardSummary[] = isCardMode ? cardResult.data : tableResult.data;
  const total = isCardMode ? cardResult.total : tableResult.total;
  const loading = isCardMode ? cardResult.loading : tableResult.loading;
  const hasMore = isCardMode ? cardResult.hasMore : tableResult.hasMore;
  const sentinelRef = isCardMode ? cardResult.sentinelRef : tableResult.sentinelRef;

  const isRefreshingList = loading && hasLoadedList;
  const displayCardList = isRefreshingList && cardResult.data.length === 0 ? lastCardList : cardResult.data;
  const displayTableList = isRefreshingList && tableResult.data.length === 0 ? lastTableList : tableResult.data;
  const displayTotal = isRefreshingList && list.length === 0 ? lastTotal : total;

  useEffect(() => {
    if (loading) return;
    setHasLoadedList(true);
    if (isCardMode) {
      setLastCardList(cardResult.data);
    } else {
      setLastTableList(tableResult.data);
    }
    setLastTotal(total);
  }, [cardResult.data, tableResult.data, loading, total, isCardMode]);

  // After list reloads due to filter change while detail is open:
  // - has results → auto-select the first pokemon
  // - no results  → close detail, show empty state
  useEffect(() => {
    if (!filterChangedWhileOpenRef.current || loading) return;
    filterChangedWhileOpenRef.current = false;

    if (list.length > 0) {
      const first = list[0];
      if (first) setSelectedSlug(String(first.id));
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
  const detailPath = useMemo(() => {
    if (!selectedSlug) return null;
    const params = new URLSearchParams();
    if (championsSeasonId) params.set("seasonId", championsSeasonId);
    const qs = params.toString();
    return `/pokemon/${selectedSlug}/summary${qs ? `?${qs}` : ""}`;
  }, [selectedSlug, championsSeasonId]);

  const { data: fetchedDetail, loading: detailLoading } = useApi<PokemonEntry>(detailPath);

  useEffect(() => {
    if (fetchedDetail) {
      setDetail(fetchedDetail);
      setDetailGeneration("");
    } else if (!selectedSlug) {
      setDetail(null);
    }
  }, [fetchedDetail, selectedSlug]);

  // Scroll detail panel to top when detail changes
  useEffect(() => {
    if (detail && detailRef.current) {
      detailRef.current.scrollTop = 0;
    }
  }, [detail]);

  // Scroll handling for layout transitions.
  // Only scroll when layout actually changes (entering/leaving split view),
  // NOT when switching between pokemon within the split view.
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
          const card = document.querySelector(`[data-slug="${CSS.escape(selectedSlug!)}"]`);
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

  const handleSelect = useCallback((slug: string) => {
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
  const effectiveViewMode: "card" | "list" = hasSelection ? "card" : dexViewMode;

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
        displayListLength={isCardMode ? displayCardList.length : displayTableList.length}
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
              displayList={displayCardList}
              loading={cardResult.loading}
              hasSelection={hasSelection}
              selectedSlug={selectedSlug ?? ""}
              onSelect={handleSelect}
              hasMore={hasMore}
              sentinelRef={sentinelRef}
              activeCardRef={activeCardRef}
            />
          ) : (
            <PokedexTableList
              displayList={displayTableList}
              loading={tableResult.loading}
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
          detailLoading={detailLoading}
          detailGeneration={detailGeneration}
          onDetailGenerationChange={setDetailGeneration}
          onClose={handleClose}
        />
      </div>
    </div>
  );
}
