import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PokemonCardSummary, PokemonTableSummary, ChampionsSeasonSummary } from "@pokemon-localdex/store-types";
import type { PokemonDetail } from "../components/pokedex/types";
import { unifiedApi } from "../utils/api.js";
import { useApi } from "../hooks/useApi.js";
import { useInfiniteApi } from "../hooks/useInfiniteApi.js";
import { resolvePokemonDisplayVariant } from "../utils/helpers.js";
import Loading from "../components/Loading.jsx";
import PokedexCardList from "../components/pokedex/PokedexCardList";
import PokedexDetailPanel from "../components/pokedex/PokedexDetailPanel";
import PokedexTableList from "../components/pokedex/PokedexTableList";
import PokedexToolbar from "../components/pokedex/PokedexToolbar";
import BattleTab from "../components/pokedex/BattleTab";

type ViewMode = "card" | "list";
type SpeedSortOrder = "asc" | "desc" | "";

interface SeasonOption {
  value: string;
  label: string;
}

function formatSeasonLabel(season: ChampionsSeasonSummary): string {
  if (!season) return "";
  const parts = [season.seasonCode, season.regulationCode];
  if (season.regulationName && season.regulationName !== season.regulationCode) {
    parts.push(season.regulationName);
  }
  return parts.filter(Boolean).join(" · ");
}

interface PokedexPageProps {
  query?: string;
  types?: string[];
  generation?: string;
  initialPokemonId?: string | null;
  onInitialPokemonConsumed?: () => void;
}

const PAGE_SIZE = 60;

/* ─── Main Page ─── */
export default function PokedexPage({
  query = "",
  types = [],
  generation = "",
  initialPokemonId = null,
  onInitialPokemonConsumed,
}: PokedexPageProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<PokemonDetail | null>(null);
  const [detailGeneration, setDetailGeneration] = useState("");
  const [dexViewMode, setDexViewMode] = useState<ViewMode>("card");
  const [championsSeasonId, setChampionsSeasonId] = useState("");
  const [battleFormat, setBattleFormat] = useState<"double" | "single">("double");
  const [speedSortOrder, setSpeedSortOrder] = useState<SpeedSortOrder>("");
  const [showSpeedLine, setShowSpeedLine] = useState(false);
  const [hasLoadedList, setHasLoadedList] = useState(false);
  const [lastList, setLastList] = useState<(PokemonCardSummary | PokemonTableSummary)[]>([]);

  // Battle 面板状态
  const [battleOpen, setBattleOpen] = useState(false);
  const [battleApply, setBattleApply] = useState<{ nature: string; sps: Record<string, number> } | null>(null);
  const [moveSearch, setMoveSearch] = useState<string | null>(null);

  const { data: championsSeasonsData, loading: seasonsLoading } =
    useApi<ChampionsSeasonSummary[]>("/champions/seasons");
  const championsSeasons = championsSeasonsData || [];
  const selectedSeason = useMemo(
    () => championsSeasons.find((season) => String(season.id) === championsSeasonId),
    [championsSeasons, championsSeasonId],
  );
  const championsSeasonOptions = useMemo<SeasonOption[]>(() => {
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
  const activeCardRef = useRef<HTMLButtonElement>(null);
  const prevSlugRef = useRef<string | null>(null);
  const filterChangedWhileOpenRef = useRef(false);
  const fromUrlNavRef = useRef(false);

  // Position-based navigation state
  const [initialOffset, setInitialOffset] = useState<number | null>(
    initialPokemonId ? null : 0,
  );
  const navigateTargetRef = useRef<string | null>(null);
  const didNavigateRef = useRef(false);
  const filterMountedRef = useRef(false);

  // 构建分页请求路径
  const pokemonPath = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (types.length > 0) params.set("type", types.join(","));
    if (generation) params.set("generation", generation);
    if (championsSeasonId) {
      params.set("seasonId", championsSeasonId);
      params.set("format", battleFormat);
    }
    if (dexViewMode === "list" && speedSortOrder) {
      params.set("sort", "speed");
      params.set("order", speedSortOrder);
    } else if (championsSeasonId) {
      // 选择赛季后默认按使用率排名排序
      params.set("sort", "usage");
    }
    const qs = params.toString();
    const endpoint = dexViewMode === "list" ? "/pokemon/table" : "/pokemon/cards";
    return qs ? `${endpoint}?${qs}` : endpoint;
  }, [query, types, generation, championsSeasonId, battleFormat, speedSortOrder, dexViewMode]);

  // Mark that filters changed while detail panel is open
  useEffect(() => {
    if (!filterMountedRef.current) {
      filterMountedRef.current = true;
      return;
    }
    if (selectedSlug && !fromUrlNavRef.current) {
      filterChangedWhileOpenRef.current = true;
    }
    // 过滤条件变化时（非导航触发），重置 initialOffset 为 0
    if (!fromUrlNavRef.current) {
      setInitialOffset(0);
      navigateTargetRef.current = null;
    }
  }, [query, types, generation, championsSeasonId, battleFormat]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: list, loading, hasMore, hasPrev, sentinelRef, topSentinelRef } = useInfiniteApi(pokemonPath, { pageSize: PAGE_SIZE, initialOffset }) as {
    data: (PokemonCardSummary | PokemonTableSummary)[];
    loading: boolean;
    hasMore: boolean;
    hasPrev: boolean;
    sentinelRef: React.RefObject<HTMLDivElement | null>;
    topSentinelRef: React.RefObject<HTMLDivElement | null>;
  };
  const isRefreshingList = loading && hasLoadedList;
  const displayList = isRefreshingList && list.length === 0 ? lastList : list;

  useEffect(() => {
    if (loading) return;
    setHasLoadedList(true);
    setLastList(list);
  }, [list, loading]);

  // After list reloads due to filter change while detail is open:
  // - has results → auto-select the first pokemon
  // - no results  → close detail, show empty state
  useEffect(() => {
    if (!filterChangedWhileOpenRef.current || loading) return;
    filterChangedWhileOpenRef.current = false;

    if (list.length > 0) {
      const first = list[0];
      const firstSlug = first.formId ? `${first.id}-f${first.formId}` : String(first.id);
      setSelectedSlug(firstSlug);
    } else {
      setSelectedSlug(null);
      setDetail(null);
    }
  }, [list, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // 通用导航函数：查询 position API 后重置列表 offset，让目标宝可梦出现在可见区域
  // useFilters: 是否携带当前过滤条件查询 position。
  //   - true：页面内导航（如 BattleTab 队友点击），在当前过滤列表中定位。
  //   - false：跨页导航（如全局搜索跳转），过滤条件即将被 reset，应在无过滤列表中定位。
  const navigateToPokemon = useCallback((pokemonId: string, useFilters = true) => {
    fromUrlNavRef.current = true;
    navigateTargetRef.current = pokemonId;
    didNavigateRef.current = false;

    // 构建 position 请求参数：仅在页面内导航时使用当前过滤条件
    const params = new URLSearchParams();
    if (useFilters) {
      if (query) params.set("q", query);
      if (types.length > 0) params.set("type", types.join(","));
      if (generation) params.set("generation", generation);
      if (championsSeasonId) {
        params.set("seasonId", championsSeasonId);
        params.set("format", battleFormat);
      }
    }
    const qs = params.toString();
    const url = `/pokemon/cards/${pokemonId}/position${qs ? `?${qs}` : ""}`;

    // 置为 null 暂停列表加载，等待 position 返回
    setInitialOffset(null);
    unifiedApi<{ position: number }>(url)
      .then((r) => {
        const pos = r?.data?.position ?? 0;
        const start = Math.max(0, pos - Math.floor(PAGE_SIZE / 2));
        setInitialOffset(start);
      })
      .catch(() => {
        // position 查询失败时回退到列表开头，直接选中
        navigateTargetRef.current = null;
        setInitialOffset(0);
        setSelectedSlug(pokemonId);
      });
  }, [query, types, generation, championsSeasonId, battleFormat]); // eslint-disable-line react-hooks/exhaustive-deps

  // 从 URL 参数 (#/pokemon?id=X) 自动选中宝可梦（跨页导航）
  useEffect(() => {
    if (!initialPokemonId) return;
    // 跨页导航：过滤条件即将被 route reset effect 清空，不带过滤参数查 position
    navigateToPokemon(String(initialPokemonId), false);
    if (onInitialPokemonConsumed) onInitialPokemonConsumed();
    const hash = window.location.hash || "";
    if (hash.startsWith("#/pokemon")) {
      window.history.replaceState(null, "", "#/pokedex");
    }
  }, [initialPokemonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 页面内 hashchange 监听：处理已在 pokedex 页面时点击 #/pokemon?id=X 的场景
  useEffect(() => {
    const handleHashNav = () => {
      const hash = window.location.hash || "";
      if (!hash.startsWith("#/pokemon")) return;
      const qIdx = hash.indexOf("?");
      if (qIdx < 0) return;
      const params = new URLSearchParams(hash.slice(qIdx));
      const id = params.get("id");
      if (!id) return;
      navigateToPokemon(id);
      window.history.replaceState(null, "", "#/pokedex");
    };
    window.addEventListener("hashchange", handleHashNav);
    return () => window.removeEventListener("hashchange", handleHashNav);
  }, [navigateToPokemon]);

  // 列表加载完成后定位到导航目标（仅一次）
  useEffect(() => {
    const targetId = navigateTargetRef.current;
    if (!targetId || didNavigateRef.current) return;
    if (loading || list.length === 0) return;

    // 在已加载列表中查找目标
    const target = list.find((item) => String(item.id) === targetId);
    if (target) {
      didNavigateRef.current = true;
      navigateTargetRef.current = null;
      const slug = target.formId ? `${target.id}-f${target.formId}` : String(target.id);
      setSelectedSlug(slug);
      // 等 split view 布局动画完成后，将目标卡片滚动到可见区域
      setTimeout(() => {
        const el = document.querySelector(`[data-slug="${CSS.escape(slug)}"]`);
        if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
      }, 400);
    }
  }, [list, loading]);

  // Fetch detail when a card is selected
  useEffect(() => {
    if (!selectedSlug) { setDetail(null); return; }
    let cancelled = false;
    setDetail(null);
    // slug 格式可能是 "123-f456"（形态级卡片）或 "123"（普通卡片），提取 pokemonId
    const pokemonId = selectedSlug.includes("-f") ? selectedSlug.split("-f")[0] : selectedSlug;
    const params = new URLSearchParams();
    if (championsSeasonId) params.set("seasonId", championsSeasonId);
    const qs = params.toString();
    unifiedApi<PokemonDetail>(`/pokemon/${pokemonId}/summary${qs ? `?${qs}` : ""}`).then((r) => {
      if (!cancelled) {
        setDetail(r.data);
        setDetailGeneration("");
      }
    });
    return () => { cancelled = true; };
  }, [selectedSlug, championsSeasonId]);

  // 切换宝可梦时关闭 battle 面板
  useEffect(() => {
    setBattleOpen(false);
  }, [selectedSlug]);

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
      if (!isFromUrl) {
        // 手动点击卡片进入 split view：等动画结束后滚动到该卡片
        scrollTimerRef.current = setTimeout(() => {
          const card = document.querySelector(`[data-slug="${CSS.escape(selectedSlug!)}"]`);
          if (card) {
            card.scrollIntoView({ block: "start", behavior: "instant" });
          }
        }, 380);
      }
      // 从 URL 导航进入时不做滚动：position API 已确保目标在首屏
    } else if (isOpen && wasOpen) {
      // Switching pokemon within split view
      prevSlugRef.current = selectedSlug;
      const isFromUrl = fromUrlNavRef.current;
      fromUrlNavRef.current = false;
      // 从 URL 导航（如队友点击）不再强制滚顶，position 定位已就绪
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

  // ─── Battle 面板相关回调 ───
  const handleToggleBattle = useCallback(() => {
    setBattleOpen((prev) => !prev);
  }, []);

  const handleCloseBattle = useCallback(() => {
    setBattleOpen(false);
  }, []);

  const handleBattleApplyToCalc = useCallback((nature: string, sps: Record<string, number>) => {
    setBattleApply({ nature, sps });
    // 延长清空时间，确保 tab 切换动画完成后 StatsTab/InlineStatCalculator 能消费到值
    setTimeout(() => setBattleApply(null), 600);
  }, []);

  const handleBattleSearchMove = useCallback((moveName: string) => {
    setMoveSearch(moveName);
    // 延长清空时间，确保 tab 切换动画完成后 MovesTab 能消费到值
    setTimeout(() => setMoveSearch(null), 600);
  }, []);

  // 计算当前 formId 用于 BattleTab
  const currentFormId = useMemo(() => {
    if (!detail) return undefined;
    const initialFid = selectedSlug?.includes("-f") ? Number(selectedSlug.split("-f")[1]) : null;
    const display = resolvePokemonDisplayVariant(detail, detailGeneration, initialFid, "");
    return display.form?.id;
  }, [detail, detailGeneration, selectedSlug]);

  if (initialOffset === null || (loading && list.length === 0 && !hasLoadedList)) return <Loading />;

  const hasSelection = selectedSlug !== null;

  // 是否处于使用率排行模式：有赛季且不是速度排序时才是使用率排行
  const isUsageRanking = !!championsSeasonId && !(dexViewMode === "list" && speedSortOrder);

  // 选中详情时强制使用卡片模式（紧凑列表）
  const effectiveViewMode: ViewMode = hasSelection ? "card" : dexViewMode;

  // dex-body 的类名：根据是否有详情和 battle 面板调整
  const bodyClassName = [
    "dex-body",
    hasSelection ? "dex-body-split" : "",
    battleOpen && hasSelection ? "dex-body-with-battle" : "",
  ].filter(Boolean).join(" ");

  // dex-page 的类名：battle 展开时突破居中容器
  const pageClassName = [
    "dex-page",
    battleOpen && hasSelection ? "dex-page-battle-open" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={pageClassName}>
      <PokedexToolbar
        championsSeasonId={championsSeasonId}
        onChampionsSeasonChange={setChampionsSeasonId}
        championsSeasonOptions={championsSeasonOptions}
        seasonsLoading={seasonsLoading}
        championsSeasons={championsSeasons}
        selectedSeason={selectedSeason}
        battleFormat={battleFormat}
        onBattleFormatChange={setBattleFormat}
        isUsageRanking={isUsageRanking}
        isRefreshingList={isRefreshingList}
        hasSelection={hasSelection}
        displayListLength={displayList.length}
        showSpeedLine={showSpeedLine}
        onSpeedLineToggle={handleSpeedLineToggle}
        effectiveViewMode={effectiveViewMode}
        onViewModeChange={setDexViewMode}
      />

      <div className={bodyClassName}>
        {/* Left: Pokemon list — scrolls naturally with the page */}
        <div className={`dex-list-panel${hasSelection ? " dex-list-panel-narrow" : ""}`}>
          {effectiveViewMode === "card" ? (
            <PokedexCardList
              displayList={displayList as PokemonCardSummary[]}
              loading={loading}
              hasSelection={hasSelection}
              selectedSlug={selectedSlug}
              onSelect={handleSelect}
              hasMore={hasMore}
              hasPrev={hasPrev}
              sentinelRef={sentinelRef}
              topSentinelRef={topSentinelRef}
              activeCardRef={activeCardRef}
              iconOnly={battleOpen && hasSelection}
            />
          ) : (
            <PokedexTableList
              displayList={displayList as PokemonTableSummary[]}
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

        {/* Middle: Detail panel — sticky so it stays visible while list scrolls */}
        <PokedexDetailPanel
          hasSelection={hasSelection}
          detailRef={detailRef}
          detail={detail}
          initialFormId={selectedSlug?.includes("-f") ? Number(selectedSlug.split("-f")[1]) : undefined}
          detailGeneration={detailGeneration}
          onDetailGenerationChange={setDetailGeneration}
          onClose={handleClose}
          onToggleBattle={handleToggleBattle}
          battleOpen={battleOpen}
          battleApplyPreset={battleApply}
          battleMoveSearch={moveSearch}
        />

        {/* Right: Battle panel — 独立卡片，和详情面板同级 */}
        <AnimatePresence>
          {battleOpen && hasSelection && detail && (
            <motion.div
              key="battle-panel"
              className="dex-battle-panel panel"
              initial={{ opacity: 0, x: 40, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.97 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <button className="dex-detail-close" onClick={handleCloseBattle} title="关闭对战数据">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" />
                </svg>
              </button>
              <div className="dex-battle-panel-header">
                <h3 className="dex-battle-panel-title">对战数据</h3>
              </div>
              <BattleTab
                pokemonId={detail.id}
                formId={currentFormId}
                championsSeasonId={championsSeasonId}
                battleFormat={battleFormat}
                championsSeasons={championsSeasons}
                onApplyToCalc={handleBattleApplyToCalc}
                onSearchMove={handleBattleSearchMove}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
