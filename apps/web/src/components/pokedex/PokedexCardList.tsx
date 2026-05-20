import { motion } from "framer-motion";
import type { PokemonCardSummary } from "@pokemon-localdex/store-types";
import TypeChip from "../TypeChip";
import { getPokemonPreviewImage } from "../../utils/helpers";

export interface PokedexCardListProps {
  displayList: PokemonCardSummary[];
  loading: boolean;
  hasSelection: boolean;
  selectedSlug: string;
  onSelect: (slug: string) => void;
  hasMore: boolean;
  sentinelRef: React.RefCallback<HTMLElement>;
  activeCardRef: (node: HTMLButtonElement | null) => void;
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
        const slug = String(member.id);
        const isActive = selectedSlug === slug;
        const image = getPokemonPreviewImage(member as Parameters<typeof getPokemonPreviewImage>[0]);
        const imageSrc = typeof image === "string" ? image : undefined;
        const imageAlt = member.nameZh;
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
            <div className="dex-item-img">
              {imageSrc
                ? <img src={imageSrc} alt={imageAlt} referrerPolicy="no-referrer" loading="lazy" />
                : <span className="dex-card-placeholder">?</span>}
            </div>
            <div className="dex-item-info">
              <span className="dex-item-dex">#{String(member.dexNumber || "?").padStart(4, "0")}</span>
              <strong className="dex-item-name">{member.nameZh}</strong>
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
