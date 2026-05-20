import { getTypeChips } from "../utils/helpers";

export interface TypeChipProps {
  type: string | undefined;
  size?: string;
}

export default function TypeChip({ type }: TypeChipProps) {
  if (!type) return null;
  const chips = getTypeChips(type);
  return chips.map((name) => (
    <span key={name} className={`type-chip type-${name}`}>
      <img className="type-chip-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${name}@sm.png`} alt="" />
      {name}
    </span>
  ));
}
