import { useState, useEffect, useMemo, useRef } from "react";

export interface SearchSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface SearchSelectProps {
  value: string;
  options: SearchSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  renderOption?: (opt: SearchSelectOption) => React.ReactNode;
}

/**
 * 模糊搜索下拉选择组件
 */
export default function SearchSelect({ value, options, onChange, placeholder, renderOption }: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((opt) => {
      const text = (opt.label || "") + " " + (opt.sublabel || "");
      return text.toLowerCase().includes(q);
    });
  }, [options, search]);

  const selectedLabel = useMemo(() => {
    if (!value) return "";
    const found = options.find((o) => o.value === value);
    return found ? found.label : value;
  }, [value, options]);

  return (
    <div className="ss-wrap" ref={wrapRef}>
      <button
        type="button"
        className="ss-trigger"
        onClick={() => {
          setOpen(!open);
          setSearch("");
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
      >
        <span className={selectedLabel ? "ss-val" : "ss-placeholder"}>
          {selectedLabel || placeholder || "请选择…"}
        </span>
        <svg className="ss-arrow" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M2.5 3.75L5 6.25L7.5 3.75" />
        </svg>
      </button>
      {open && (
        <div className="ss-dropdown">
          <input
            ref={inputRef}
            className="ss-search"
            placeholder="搜索…"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />
          <div className="ss-list">
            {filtered.length === 0 && <div className="ss-empty">无匹配结果</div>}
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`ss-option${opt.value === value ? " ss-option-active" : ""}`}
                onClick={() => { onChange(opt.value); setOpen(false); setSearch(""); }}
              >
                {renderOption ? renderOption(opt) : (
                  <>
                    <span className="ss-option-label">{opt.label}</span>
                    {opt.sublabel && <span className="ss-option-sub">{opt.sublabel}</span>}
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
