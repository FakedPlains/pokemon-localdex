import { useState, useEffect, useRef } from "react";

export interface CustomSelectOption {
  value: string;
  label: string;
}

export interface CustomSelectProps {
  id?: string;
  value: string;
  options: CustomSelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * 自定义下拉选择器（替代原生 select）
 * 胶囊形触发按钮 + 浮层下拉列表
 */
export default function CustomSelect({ id, value, options, placeholder, onChange, className, disabled = false }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected ? selected.label : (placeholder || "请选择…");

  return (
    <div className={`cs-wrap ${className || ""}`} ref={wrapRef}>
      <button
        id={id}
        type="button"
        className={`cs-trigger${!selected ? " cs-placeholder" : ""}`}
        disabled={disabled}
        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          if (!disabled) setOpen(!open);
        }}
      >
        <span className="cs-label">{displayLabel}</span>
        <svg className="cs-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && !disabled && (
        <div className="cs-dropdown">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`cs-option${opt.value === value ? " cs-option-active" : ""}`}
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
