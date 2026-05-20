import { useEffect } from "react";
import { STAT_KEYS } from "@pokemon-localdex/store-types/constants";
import type { StatKey } from "@pokemon-localdex/store-types";
import { evToSp } from "../../utils/helpers";
import { EV_MAX, EV_TOTAL_MAX, SP_TOTAL_MAX, spToEv } from "./damageConstants";

/** Minimum shape the hook needs from a member state */
interface MemberLike {
  statMode?: string;
  evs?: Partial<Record<StatKey, number>>;
  sps?: Partial<Record<StatKey, number>>;
  ivs?: Partial<Record<StatKey, number>>;
}

type MemberUpdater<T extends MemberLike> = (updater: (prev: T) => T) => void;

export default function useDamageStatMode<T extends MemberLike>(
  isChampions: boolean,
  setAttacker: MemberUpdater<T>,
  setDefender: MemberUpdater<T>,
) {
  useEffect(() => {
    const targetMode = isChampions ? "champions" : "classic";
    // Spread preserves all properties of prev; we only overwrite stat-related fields.
    // The cast to T is safe because we always spread prev first.
    const convert = (prev: T): T => {
      if (prev.statMode === targetMode) return { ...prev, statMode: targetMode } as T;
      if (prev.statMode === "classic" && targetMode === "champions") {
        const converted: Partial<Record<StatKey, number>> = {};
        for (const k of STAT_KEYS) {
          converted[k] = evToSp(prev.evs?.[k] || 0);
        }
        const total = STAT_KEYS.reduce((s, k) => s + (converted[k] ?? 0), 0);
        if (total > SP_TOTAL_MAX) {
          const scale = SP_TOTAL_MAX / total;
          for (const k of STAT_KEYS) {
            converted[k] = Math.floor((converted[k] ?? 0) * scale);
          }
        }
        return { ...prev, sps: converted, statMode: targetMode } as T;
      }
      if (prev.statMode === "champions" && targetMode === "classic") {
        const converted: Record<StatKey, number> = Object.fromEntries(
          STAT_KEYS.map((k) => [k, 0]),
        ) as Record<StatKey, number>;
        const sorted = [...STAT_KEYS]
          .filter((k) => (prev.sps?.[k] || 0) > 0)
          .sort((a, b) => (prev.sps?.[b] || 0) - (prev.sps?.[a] || 0));
        let budget = EV_TOTAL_MAX;
        for (const k of sorted) {
          const ideal = spToEv(prev.sps?.[k] || 0);
          if (ideal <= budget) {
            converted[k] = ideal;
            budget -= ideal;
          } else {
            converted[k] = Math.min(EV_MAX, Math.floor(budget / 4) * 4);
            budget -= converted[k];
          }
        }
        return {
          ...prev,
          evs: converted,
          ivs: Object.fromEntries(STAT_KEYS.map((k) => [k, 31])),
          statMode: targetMode,
        } as T;
      }
      return { ...prev, statMode: targetMode } as T;
    };
    setAttacker(convert);
    setDefender(convert);
  }, [isChampions, setAttacker, setDefender]);
}
