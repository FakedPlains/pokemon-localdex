import { useEffect, useRef, useState } from "react";
import { getTeams, saveTeam } from "../../utils/teamStorage.js";

/* ─── Team Picker Modal ─── */
export default function TeamPickerModal({ onSelect, onClose }) {
  const teams = getTeams();
  const modalRef = useRef(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    const handleClick = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    const newTeam = saveTeam({ name, format: "singles", members: [] });
    onSelect(newTeam);
  };

  return (
    <div className="sc-team-picker-overlay">
      <div className="sc-team-picker" ref={modalRef}>
        <div className="sc-team-picker-header">
          <strong>选择队伍</strong>
          <button className="sc-team-picker-close" onClick={onClose}>✕</button>
        </div>
        <div className="sc-team-picker-list">
          {teams.map((t) => {
            const memberCount = (t.members || []).length;
            const isFull = memberCount >= 6;
            return (
              <button
                key={t.teamId}
                className={`sc-team-picker-item ${isFull ? "sc-team-picker-item-full" : ""}`}
                onClick={() => !isFull && onSelect(t)}
                disabled={isFull}
              >
                <span className="sc-team-picker-item-name">{t.name || "未命名队伍"}</span>
                <span className="sc-team-picker-item-count">{memberCount}/6</span>
                {isFull && <span className="sc-team-picker-item-tag">已满</span>}
              </button>
            );
          })}
        </div>
        <div className="sc-team-picker-footer">
          {creating ? (
            <div className="sc-team-picker-create-form">
              <input
                className="sc-team-picker-create-input"
                type="text"
                placeholder="输入队伍名称…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <button className="sc-team-picker-create-confirm" onClick={handleCreate}>确定</button>
              <button className="sc-team-picker-create-cancel" onClick={() => { setCreating(false); setNewName(""); }}>取消</button>
            </div>
          ) : (
            <button className="sc-team-picker-create-btn" onClick={() => setCreating(true)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M8 3v10M3 8h10" />
              </svg>
              创建新队伍
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
