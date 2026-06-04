interface LoadingProps {
  /** 显示文本，默认 "加载中…" */
  text?: string;
  /**
   * 展示变体：
   * - "full"：全页居中（带 min-height），用于页面初始加载
   * - "inline"：小型居中，用于展开详情 / 分页加载
   * - "text"：仅文本，无动画圆点
   */
  variant?: "full" | "inline" | "text";
  /** 自定义 className，追加到容器上 */
  className?: string;
  /** 自定义 style，追加到容器上 */
  style?: React.CSSProperties;
}

export default function Loading({
  text = "加载中…",
  variant = "full",
  className = "",
  style,
}: LoadingProps) {
  if (variant === "text") {
    return (
      <div className={`loading-text ${className}`.trim()} style={style}>
        {text}
      </div>
    );
  }

  const wrapperClass =
    variant === "full"
      ? `panel loading-panel ${className}`.trim()
      : `loading-inline ${className}`.trim();

  return (
    <div className={wrapperClass} style={style}>
      <div className="pulse-dot" />
      <span>{text}</span>
    </div>
  );
}
