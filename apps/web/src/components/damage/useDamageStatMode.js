import { useEffect } from "react";
import { STAT_KEYS } from "@pokemon-localdex/store-types/constants";
import { convertEvsToSps, convertSpsToEvs } from "../../utils/statCalcModel";

export default function useDamageStatMode(isChampions, setAttacker, setDefender) {
  useEffect(() => {
    const targetMode = isChampions ? "champions" : "classic";
    const convert = (prev) => {
      if (prev.statMode === targetMode) return { ...prev, statMode: targetMode };
      if (prev.statMode === "classic" && targetMode === "champions") {
        const converted = convertEvsToSps(prev.evs || {});
        return { ...prev, sps: converted, statMode: targetMode };
      }
      if (prev.statMode === "champions" && targetMode === "classic") {
        const converted = convertSpsToEvs(prev.sps || {});
        return { ...prev, evs: converted, ivs: Object.fromEntries(STAT_KEYS.map((k) => [k, 31])), statMode: targetMode };
      }
      return { ...prev, statMode: targetMode };
    };
    setAttacker(convert);
    setDefender(convert);
  }, [isChampions, setAttacker, setDefender]);
}
