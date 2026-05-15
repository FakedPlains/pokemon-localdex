import { useEffect } from "react";
import { STAT_KEYS } from "@pokemon-localdex/store-types/constants";
import { evToSp } from "../../utils/helpers.js";
import { EV_MAX, EV_TOTAL_MAX, SP_TOTAL_MAX, spToEv } from "./damageConstants.js";

export default function useDamageStatMode(isChampions, setAttacker, setDefender) {
  useEffect(() => {
    const targetMode = isChampions ? "champions" : "classic";
    const convert = (prev) => {
      if (prev.statMode === targetMode) return { ...prev, statMode: targetMode };
      if (prev.statMode === "classic" && targetMode === "champions") {
        const converted = {};
        for (const k of STAT_KEYS) {
          converted[k] = evToSp(prev.evs?.[k] || 0);
        }
        const total = STAT_KEYS.reduce((s, k) => s + converted[k], 0);
        if (total > SP_TOTAL_MAX) {
          const scale = SP_TOTAL_MAX / total;
          for (const k of STAT_KEYS) {
            converted[k] = Math.floor(converted[k] * scale);
          }
        }
        return { ...prev, sps: converted, statMode: targetMode };
      }
      if (prev.statMode === "champions" && targetMode === "classic") {
        const converted = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
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
        return { ...prev, evs: converted, ivs: Object.fromEntries(STAT_KEYS.map((k) => [k, 31])), statMode: targetMode };
      }
      return { ...prev, statMode: targetMode };
    };
    setAttacker(convert);
    setDefender(convert);
  }, [isChampions, setAttacker, setDefender]);
}
