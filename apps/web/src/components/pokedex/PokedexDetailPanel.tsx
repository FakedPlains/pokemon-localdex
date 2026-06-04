import { AnimatePresence, motion } from "framer-motion";
import type { RefObject } from "react";
import DrawerContent from "./DrawerContent.tsx";
import Loading from "../Loading.tsx";
import type { PokemonDetail } from "./types";
import type { ChampionsSeasonSummary } from "@pokemon-localdex/store-types";

interface PokedexDetailPanelProps {
  hasSelection: boolean;
  detailRef: RefObject<HTMLDivElement | null>;
  detail: PokemonDetail | null;
  initialFormId?: number;
  detailGeneration: string;
  onDetailGenerationChange: (gen: string) => void;
  onClose: () => void;
  championsSeasonId: string;
  battleFormat: "double" | "single";
  championsSeasons: ChampionsSeasonSummary[];
}

export default function PokedexDetailPanel({
  hasSelection,
  detailRef,
  detail,
  initialFormId,
  detailGeneration,
  onDetailGenerationChange,
  onClose,
  championsSeasonId,
  battleFormat,
  championsSeasons,
}: PokedexDetailPanelProps) {
  return (
    <AnimatePresence mode="wait">
      {hasSelection && (
        <motion.div
          key="detail-panel"
          className="dex-detail-panel panel"
          ref={detailRef}
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <button className="dex-detail-close" onClick={onClose} title="关闭详情">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" />
            </svg>
          </button>
          {detail ? (
            <DrawerContent
              detail={detail}
              initialFormId={initialFormId}
              detailGeneration={detailGeneration}
              onDetailGenerationChange={onDetailGenerationChange}
              championsSeasonId={championsSeasonId}
              battleFormat={battleFormat}
              championsSeasons={championsSeasons}
            />
          ) : (
            <Loading variant="inline" text="加载详情…" style={{ padding: 40 }} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
