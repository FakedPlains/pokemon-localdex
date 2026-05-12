/**
 * 视图切换组件（卡片/列表）
 * 通用于图鉴页和盒子页
 *
 * @param {"card"|"list"} mode - 当前视图模式
 * @param {Function} onChange - 模式切换回调
 */
export default function ViewToggle({ mode, onChange }) {
  return (
    <div className="box-view-toggle">
      <button
        className={`box-view-btn${mode === "card" ? " box-view-btn-active" : ""}`}
        onClick={() => onChange("card")}
        title="卡片视图"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>
      </button>
      <button
        className={`box-view-btn${mode === "list" ? " box-view-btn-active" : ""}`}
        onClick={() => onChange("list")}
        title="列表视图"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2.5" rx="1"/><rect x="1" y="6.75" width="14" height="2.5" rx="1"/><rect x="1" y="11.5" width="14" height="2.5" rx="1"/></svg>
      </button>
    </div>
  );
}
