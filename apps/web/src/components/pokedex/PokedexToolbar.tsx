import type { ChampionsSeasonSummary } from "@pokemon-localdex/store-types";
import CustomSelect from "../CustomSelect.jsx";
import ViewToggle from "../ViewToggle.jsx";

interface SeasonOption {
  value: string;
  label: string;
}

interface PokedexToolbarProps {
  championsSeasonId: string;
  onChampionsSeasonChange: (value: string) => void;
  championsSeasonOptions: SeasonOption[];
  seasonsLoading: boolean;
  championsSeasons: ChampionsSeasonSummary[];
  selectedSeason: ChampionsSeasonSummary | undefined;
  battleFormat: "double" | "single";
  onBattleFormatChange: (format: "double" | "single") => void;
  isUsageRanking: boolean;
  isRefreshingList: boolean;
  displayTotal: number;
  hasSelection: boolean;
  displayListLength: number;
  showSpeedLine: boolean;
  onSpeedLineToggle: () => void;
  effectiveViewMode: "card" | "list";
  onViewModeChange: (mode: "card" | "list") => void;
}

export default function PokedexToolbar({
  championsSeasonId,
  onChampionsSeasonChange,
  championsSeasonOptions,
  seasonsLoading,
  championsSeasons,
  selectedSeason,
  battleFormat,
  onBattleFormatChange,
  isUsageRanking,
  isRefreshingList,
  displayTotal,
  hasSelection,
  displayListLength,
  showSpeedLine,
  onSpeedLineToggle,
  effectiveViewMode,
  onViewModeChange,
}: PokedexToolbarProps) {
  // 是否选择了赛季（用于控制 format toggle 显示）
  const hasSeason = !!championsSeasonId;

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
        {hasSeason && (
          <div className="dex-format-toggle">
            <button
              type="button"
              className={`dex-format-btn${battleFormat === "double" ? " dex-format-btn-active" : ""}`}
              onClick={() => onBattleFormatChange("double")}
            >
              双打
            </button>
            <button
              type="button"
              className={`dex-format-btn${battleFormat === "single" ? " dex-format-btn-active" : ""}`}
              onClick={() => onBattleFormatChange("single")}
            >
              单打
            </button>
          </div>
        )}
      </div>

      {selectedSeason && (
        <div className="dex-season-note">
          <strong>{selectedSeason.regulationName || selectedSeason.regulationCode}</strong>
          {selectedSeason.periodText && <span>{selectedSeason.periodText}</span>}
          <span>
            {isRefreshingList
              ? "正在更新排行…"
              : isUsageRanking
                ? `使用率排行 TOP ${displayListLength}`
                : `${displayListLength} 只可用宝可梦`}
          </span>
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
