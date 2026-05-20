import { STAT_KEYS } from "@pokemon-localdex/store-types/constants";
import type { PokemonTableSummary } from "@pokemon-localdex/store-types";
import { getStatValue } from "@pokemon-localdex/store-types";
import TypeChip from "../TypeChip";
import { calculateSpeedLine, getPokemonPreviewImage } from "../../utils/helpers";

export interface PokedexTableListProps {
  displayList: PokemonTableSummary[];
  loading: boolean;
  showSpeedLine: boolean;
  speedSortOrder: "asc" | "desc" | "";
  onSpeedSortToggle: () => void;
  onSelect: (slug: string) => void;
  hasMore: boolean;
  sentinelRef: React.RefCallback<HTMLElement>;
}

export default function PokedexTableList({
  displayList,
  loading,
  showSpeedLine,
  speedSortOrder,
  onSpeedSortToggle,
  onSelect,
  hasMore,
  sentinelRef,
}: PokedexTableListProps) {
  return (
    <div className="dex-table-view">
      {displayList.length === 0 && !loading && <div className="dex-empty">没有匹配的宝可梦。</div>}
      <div className={`dex-table-header${showSpeedLine ? " dex-table-header-speed-line" : ""}`}>
        <span className="dex-table-hcol dex-table-hcol-img"></span>
        <span className="dex-table-hcol dex-table-hcol-dex">编号</span>
        <span className="dex-table-hcol dex-table-hcol-name">名称</span>
        <span className="dex-table-hcol dex-table-hcol-types">属性</span>
        <span className="dex-table-hcol-spacer" />
        <span className="dex-table-hcol dex-table-hcol-ability">特性</span>
        {showSpeedLine ? (
          <>
            <button
              type="button"
              className={`dex-table-hcol dex-table-hcol-stats dex-table-sort-btn${speedSortOrder ? " dex-table-sort-btn-active" : ""}`}
              onClick={onSpeedSortToggle}
              aria-label="按速度种族值排序"
              aria-sort={speedSortOrder === "asc" ? "ascending" : speedSortOrder === "desc" ? "descending" : "none"}
              title="按速度种族值排序"
            >
              <span>种族值</span>
              <span className="dex-table-sort-icon" aria-hidden="true">
                {speedSortOrder === "asc" ? "↑" : speedSortOrder === "desc" ? "↓" : "↕"}
              </span>
            </button>
            <span className="dex-table-hcol dex-table-hcol-stats">无加点</span>
            <span className="dex-table-hcol dex-table-hcol-stats">满速</span>
            <span className="dex-table-hcol dex-table-hcol-stats">极速</span>
          </>
        ) : (
          <>
            <span className="dex-table-hcol dex-table-hcol-stats">HP</span>
            <span className="dex-table-hcol dex-table-hcol-stats">攻击</span>
            <span className="dex-table-hcol dex-table-hcol-stats">防御</span>
            <span className="dex-table-hcol dex-table-hcol-stats">特攻</span>
            <span className="dex-table-hcol dex-table-hcol-stats">特防</span>
            <button
              type="button"
              className={`dex-table-hcol dex-table-hcol-stats dex-table-sort-btn${speedSortOrder ? " dex-table-sort-btn-active" : ""}`}
              onClick={onSpeedSortToggle}
              aria-label="按速度排序"
              aria-sort={speedSortOrder === "asc" ? "ascending" : speedSortOrder === "desc" ? "descending" : "none"}
              title="按速度排序"
            >
              <span>速度</span>
              <span className="dex-table-sort-icon" aria-hidden="true">
                {speedSortOrder === "asc" ? "↑" : speedSortOrder === "desc" ? "↓" : "↕"}
              </span>
            </button>
            <span className="dex-table-hcol dex-table-hcol-stats">合计</span>
          </>
        )}
      </div>
      {displayList.map((member) => {
        const slug = String(member.id);
        const image = getPokemonPreviewImage(member);
        const imageSrc = typeof image === "string" ? image : undefined;
        const bs = member.baseStats;
        const total = STAT_KEYS.reduce((s: number, k) => s + getStatValue(bs, k), 0);
        const speedLine = calculateSpeedLine(bs?.spe);
        return (
          <div key={slug} className={`dex-table-row${showSpeedLine ? " dex-table-row-speed-line" : ""}`} data-slug={slug} onClick={() => onSelect(slug)}>
            <div className="dex-table-col dex-table-col-img">
              <div className="dex-table-thumb">
                {imageSrc
                  ? <img src={imageSrc} alt={member.nameZh} referrerPolicy="no-referrer" loading="lazy" />
                  : <span className="dex-card-placeholder">?</span>}
              </div>
            </div>
            <div className="dex-table-col dex-table-col-dex">
              <span className="dex-table-dex">#{String(member.dexNumber || "?").padStart(4, "0")}</span>
            </div>
            <div className="dex-table-col dex-table-col-name">
              <strong className="dex-table-name-zh">{member.nameZh}</strong>
              <span className="dex-table-name-en">{member.nameEn || ""}</span>
            </div>
            <div className="dex-table-col dex-table-col-types">
              <TypeChip type={member.primaryType} />
              <TypeChip type={member.secondaryType} />
            </div>
            <div className="dex-table-col-spacer" />
            <div className="dex-table-col dex-table-col-ability">
              <span className="dex-table-ability">{(member.abilities || []).join(" / ") || "—"}</span>
              {member.hiddenAbility && <span className="dex-table-ability-hidden">{member.hiddenAbility}</span>}
            </div>
            {showSpeedLine ? (
              <>
                <div className="dex-table-col dex-table-col-stat">
                  <span className="dex-table-stat-val">{bs?.spe ?? "—"}</span>
                </div>
                <div className="dex-table-col dex-table-col-stat">
                  <span className="dex-table-stat-val">{speedLine.noInvestment ?? "—"}</span>
                </div>
                <div className="dex-table-col dex-table-col-stat">
                  <span className="dex-table-stat-val">{speedLine.full ?? "—"}</span>
                </div>
                <div className="dex-table-col dex-table-col-stat">
                  <span className="dex-table-stat-val">{speedLine.max ?? "—"}</span>
                </div>
              </>
            ) : (
              <>
                {STAT_KEYS.map((k) => (
                  <div key={k} className="dex-table-col dex-table-col-stat">
                    <span className="dex-table-stat-val">{getStatValue(bs, k) || "—"}</span>
                  </div>
                ))}
                <div className="dex-table-col dex-table-col-stat dex-table-col-total">
                  <span className="dex-table-stat-val dex-table-stat-total">{total || "—"}</span>
                </div>
              </>
            )}
          </div>
        );
      })}
      {hasMore && (
        <div className="dex-load-more" ref={sentinelRef}>
          <div className="pulse-dot" />
        </div>
      )}
    </div>
  );
}
