import CustomSelect from "../CustomSelect.jsx";
import ViewToggle from "../ViewToggle.jsx";

export default function PokedexToolbar({
  championsSeasonId,
  onChampionsSeasonChange,
  championsSeasonOptions,
  seasonsLoading,
  championsSeasons,
  selectedSeason,
  isRefreshingList,
  displayTotal,
  hasSelection,
  displayListLength,
  showSpeedLine,
  onSpeedLineToggle,
  effectiveViewMode,
  onViewModeChange,
}) {
  return (
    <div className="dex-list-toolbar">
      <div className="dex-season-control">
        <label className="dex-season-label" htmlFor="dex-season-select">赛季</label>
        <CustomSelect
          id="dex-season-select"
          className="dex-season-select"
          value={championsSeasonId}
          options={championsSeasonOptions}
          onChange={onChampionsSeasonChange}
          disabled={seasonsLoading || championsSeasons.length === 0}
        />
      </div>

      {selectedSeason && (
        <div className="dex-season-note">
          <strong>{selectedSeason.regulationName || selectedSeason.regulationCode}</strong>
          {selectedSeason.periodText && <span>{selectedSeason.periodText}</span>}
          <span>{isRefreshingList ? "正在更新可用名单…" : `${displayListLength} 只可用宝可梦`}</span>
        </div>
      )}

      {!hasSelection && displayListLength > 0 && (
        <div className="dex-view-toggle">
          <button
            type="button"
            className={`dex-speed-line-toggle${showSpeedLine ? " dex-speed-line-toggle-active" : ""}`}
            onClick={onSpeedLineToggle}
            aria-pressed={showSpeedLine}
            title={showSpeedLine ? "显示完整种族值" : "查看速度线"}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12h10" />
              <path d="M4 10l3-3 2 2 3-5" />
            </svg>
            <span>{showSpeedLine ? "完整种族值" : "查看速度线"}</span>
          </button>
          <ViewToggle mode={effectiveViewMode} onChange={onViewModeChange} />
        </div>
      )}
    </div>
  );
}
