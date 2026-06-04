/**
 * Wiki 外链图标组件
 * 通用于招式页、特性页、道具页、图鉴页
 */
interface WikiLinkProps {
  /** 链接地址 */
  url?: string | null;
  /** 链接 title 属性 */
  title?: string;
  /** 额外的 CSS 类名 */
  className?: string;
}

export default function WikiLink({ url, title = "Wiki", className = "" }: WikiLinkProps) {
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`shared-wiki-link ${className}`.trim()}
      title={title}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10" />
        <path d="M9 2h5v5" /><path d="M14 2 7.5 8.5" />
      </svg>
    </a>
  );
}
