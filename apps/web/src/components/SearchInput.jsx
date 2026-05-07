import { useRef } from "react";

/**
 * 通用搜索输入框组件
 *
 * 带搜索图标和清除按钮，与项目导航栏搜索框风格一致。
 *
 * @param {string}   value       - 当前值
 * @param {Function} onChange    - 值变更回调 (value) => void
 * @param {string}   placeholder - 占位文字
 * @param {boolean}  autoFocus   - 是否自动聚焦
 * @param {string}   className   - 额外 className
 * @param {string}   size        - 尺寸: "sm" | "md"（默认 "md"）
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = "搜索…",
  autoFocus,
  className,
  size = "md"
}) {
  const inputRef = useRef(null);
  const cls = `search-input-wrap${size === "sm" ? " search-input-sm" : ""}${className ? ` ${className}` : ""}`;

  return (
    <div className={cls}>
      <svg className="search-input-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" />
      </svg>
      <input
        ref={inputRef}
        className="search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />
      {value && (
        <button
          type="button"
          className="search-input-clear"
          onClick={() => { onChange(""); inputRef.current?.focus(); }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
          </svg>
        </button>
      )}
    </div>
  );
}
