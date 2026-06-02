import {
  NATURES,
  NATURE_EFFECTS_BY_ID,
  STAT_LABELS_BY_ID,
  TYPE_OPTIONS,
} from "@pokemon-localdex/store-types/constants";

export const BOOST_STATS = ["atk", "def", "spa", "spd", "spe"];
export const DEFAULT_BOOSTS = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export { EV_MAX, EV_TOTAL_MAX, IV_MAX, SP_MAX, SP_TOTAL_MAX, spToEv } from "../../utils/statCalcModel";

export const NATURE_SELECT_OPTIONS = NATURES.map((nature) => {
  const eff = NATURE_EFFECTS_BY_ID[nature.id];
  return {
    id: nature.id,
    value: nature.nameZh,
    label: nature.nameZh,
    sublabel: eff ? `+${STAT_LABELS_BY_ID[eff.up]} -${STAT_LABELS_BY_ID[eff.down]}` : "无修正",
  };
});

export const TERA_TYPE_OPTIONS = [
  { value: "none", label: "无" },
  ...TYPE_OPTIONS.map((type) => ({ id: type.id, value: type.nameZh, label: type.nameZh })),
  { id: 99, value: "星晶", label: "星晶" },
];
