/**
 * 通用表单字段组件
 *
 * 提供统一的 label + 输入控件布局，与项目全局样式一致。
 * 支持 input、select、number、自定义 children 等多种模式。
 *
 * @param {string}   label       - 字段标签
 * @param {string}   type        - 输入类型: "text" | "number" | "select" | "custom"（默认 "text"）
 * @param {string}   value       - 当前值
 * @param {Function} onChange    - 值变更回调 (value) => void
 * @param {string}   placeholder - 占位文字
 * @param {Array}    options     - select 模式下的选项 [{ value, label }]
 * @param {object}   inputProps  - 传递给 input/select 的额外属性（min, max, step 等）
 * @param {string}   className   - 额外 className
 * @param {string}   list        - datalist id（用于 input 的 autocomplete）
 * @param {ReactNode} children   - type="custom" 时渲染的自定义内容
 */
export default function FormField({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  options,
  inputProps,
  className,
  list,
  children
}) {
  const cls = `form-field${className ? ` ${className}` : ""}`;

  const handleChange = (e) => {
    if (!onChange) return;
    if (type === "number") {
      onChange(Number(e.target.value || 0));
    } else {
      onChange(e.target.value);
    }
  };

  return (
    <label className={cls}>
      {label && <span className="form-field-label">{label}</span>}
      {type === "custom" ? children : type === "select" ? (
        <select value={value ?? ""} onChange={handleChange} {...inputProps}>
          {(options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value ?? ""}
          onChange={handleChange}
          placeholder={placeholder}
          list={list}
          {...inputProps}
        />
      )}
    </label>
  );
}
