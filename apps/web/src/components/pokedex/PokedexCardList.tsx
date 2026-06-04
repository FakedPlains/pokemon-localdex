import { type RefObject } from "react";
import { motion } from "framer-motion";
import type { PokemonCardSummary } from "@pokemon-localdex/store-types";
import { TYPE_BG_RGB } from "@pokemon-localdex/store-types/constants";
import TypeChip from "../TypeChip.jsx";
import { getPokemonPreviewImage } from "../../utils/helpers.js";
import { getShortFormName } from "./formUtils";

interface PokedexCardListProps {
  displayList: PokemonCardSummary[];
  loading: boolean;
  hasSelection: boolean;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  hasMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  activeCardRef: RefObject<HTMLButtonElement | null>;
}

export default function PokedexCardList({
  displayList,
  loading,
  hasSelection,
  selectedSlug,
  onSelect,
  hasMore,
  sentinelRef,
  activeCardRef,
}: PokedexCardListProps) {
  return (
    <div className={`dex-list ${hasSelection ? "dex-list-compact" : ""}`}>
      {displayList.length === 0 && !loading && <div className="dex-empty">没有匹配的宝可梦。</div>}
      {displayList.map((member) => {
        const slug = member.formId ? `${member.id}-f${member.formId}` : String(member.id);
        const isActive = selectedSlug === slug;
        const image = getPokemonPreviewImage(member);
        return (
          <motion.button
            layout
            layoutId={`dex-item-${slug}`}
            key={slug}
            ref={isActive ? activeCardRef : undefined}
            data-slug={slug}
            className={`dex-item ${hasSelection ? "dex-item-compact" : ""} ${isActive ? "dex-item-active" : ""}`}
            onClick={() => onSelect(slug)}
            transition={{ layout: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
          >
            <div className="dex-item-numbers">
              {member.usageRank != null && (
                <span className="dex-item-usage-rank">#{member.usageRank}</span>
              )}
              <span className="dex-item-dex">#{String(member.dexNumber || "?").padStart(4, "0")}</span>
            </div>
            <div
              className="dex-item-img"
              style={{ "--type-rgb": member.primaryType ? TYPE_BG_RGB[member.primaryType] || "200,200,200" : "200,200,200" } as React.CSSProperties}
            >
              {image?.url
                ? <img src={image.url} alt={image.alt || member.nameZh} referrerPolicy="no-referrer" loading="lazy" />
                : <span className="dex-card-placeholder">?</span>}
            </div>
            <div className="dex-item-info">
              <span className="dex-item-name-row">
                <strong className="dex-item-name">{member.nameZh}</strong>
                {member.formName && <span className="dex-item-form">{getShortFormName(member.formName)}</span>}
              </span>
              <span className="dex-item-en">{member.nameEn || ""}</span>
            </div>
            <div className="dex-item-types">
              <TypeChip type={member.primaryType} />
              <TypeChip type={member.secondaryType} />
            </div>
          </motion.button>
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
