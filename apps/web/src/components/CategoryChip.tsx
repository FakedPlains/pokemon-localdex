import { CATEGORY_COLORS } from "@pokemon-localdex/store-types/constants";
import { categoryIconSrc } from "../utils/iconPaths.js";

interface CategoryChipProps {
  /** 分类名称（中文：物理/特殊/变化） */
  category: string;
  /** 是否只显示图标，不显示文字 */
  iconOnly?: boolean;
}

/**
 * 招式分类芯片，类似 TypeChip 的展现方式。
 * 支持完整模式（图标 + 文字 + 背景色药丸）和 iconOnly 模式（仅小方块图标）。
 */
export default function CategoryChip({ category, iconOnly }: CategoryChipProps) {
  if (!category) return null;
  const colors = CATEGORY_COLORS[category] || { bg: "#999", text: "#eee" };

  if (iconOnly) {
    return (
      <span
        className="cat-chip cat-chip-icon-only"
        style={{ background: colors.bg }}
        title={category}
      >
        <img
          className="cat-chip-icon"
          src={categoryIconSrc(category)}
          alt={category}
        />
      </span>
    );
  }

  return (
    <span
      className="cat-chip"
      style={{ background: colors.bg }}
      title={category}
    >
      <img
        className="cat-chip-icon"
        src={categoryIconSrc(category)}
        alt=""
      />
      {category}
    </span>
  );
}
