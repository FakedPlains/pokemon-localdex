import { getTypeChips } from "../utils/helpers.js";

interface TypeChipProps {
  /** 属性，可为单个属性名或属性名数组 */
  type: string | string[] | null | undefined;
  /** 尺寸修饰（可选），落为 type-chip-<size> 类名，便于按需定制样式 */
  size?: string;
}

export default function TypeChip({ type, size }: TypeChipProps) {
  if (!type) return null;
  const chips: string[] = getTypeChips(type);
  const sizeClass = size ? ` type-chip-${size}` : "";
  return (
    <>
      {chips.map((name) => (
        <span key={name} className={`type-chip type-${name}${sizeClass}`}>
          <img
            className="type-chip-icon"
            src={`${import.meta.env.BASE_URL}assets/type-icons/type-${name}@sm.png`}
            alt=""
          />
          {name}
        </span>
      ))}
    </>
  );
}
