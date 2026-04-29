import { getTypeChips } from "../utils/helpers.js";

export default function TypeChip({ type }) {
  if (!type) return null;
  const chips = getTypeChips(type);
  return chips.map((name) => (
    <span key={name} className={`type-chip type-${name}`}>{name}</span>
  ));
}
