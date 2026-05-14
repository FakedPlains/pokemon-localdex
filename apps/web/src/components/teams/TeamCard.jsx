import { useEffect, useMemo, useRef, useState } from "react";
import { unifiedApi } from "../../utils/api.js";
import { getPokemonPreviewImage } from "../../utils/helpers.js";
import { resolveTeamMembers } from "../../utils/teamStorage.js";

export default function TeamCard({ team, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const resolved = useMemo(() => resolveTeamMembers(team), [team]);
  const [fetchedImages, setFetchedImages] = useState({});

  useEffect(() => {
    const missing = resolved.filter((m) => m.pokemonId && !m.imageUrl && !fetchedImages[m.pokemonId]);
    if (missing.length === 0) return;
    let cancelled = false;
    missing.forEach((m) => {
      unifiedApi(`/pokemon/${m.pokemonId}`).then((r) => {
        if (cancelled) return;
        const img = getPokemonPreviewImage(r.data);
        if (img?.url) {
          setFetchedImages((prev) => ({ ...prev, [m.pokemonId]: img.url }));
        }
      }).catch(() => {});
    });
    return () => { cancelled = true; };
  }, [resolved, fetchedImages]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div className="team-card">
      <div className="team-card-header">
        <div className="team-card-title-row">
          <strong className="team-card-name">{team.name || "未命名队伍"}</strong>
          <span className="team-card-format">{team.format === "doubles" ? "双打" : "单打"}</span>
        </div>
        <div className="box-card-menu" ref={menuRef}>
          <button className="box-card-menu-btn" onClick={() => setMenuOpen(!menuOpen)} title="操作">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="2" r="1.4"/><circle cx="7" cy="7" r="1.4"/><circle cx="7" cy="12" r="1.4"/></svg>
          </button>
          {menuOpen && (
            <div className="box-card-dropdown">
              <button onClick={() => { onEdit(team); setMenuOpen(false); }}>编辑</button>
              <button className="danger-text" onClick={() => { onDelete(team.teamId); setMenuOpen(false); }}>删除</button>
            </div>
          )}
        </div>
      </div>
      <div className="team-card-members">
        {resolved.length > 0 ? (
          resolved.map((m, i) => {
            const imgUrl = m.isShiny && m.shinyImageUrl
              ? (typeof m.shinyImageUrl === "string" ? m.shinyImageUrl : m.shinyImageUrl?.url || "")
              : (m.imageUrl || fetchedImages[m.pokemonId] || "");
            return (
              <div key={i} className="team-card-member">
                <div className="team-card-member-img">
                  {imgUrl ? <img src={imgUrl} alt={m.nameZh || ""} referrerPolicy="no-referrer" /> : <span>?</span>}
                  {m.itemImageUrl && <img className="team-card-item-overlay" src={m.itemImageUrl} alt={m.itemId || ""} title={m.itemId || ""} referrerPolicy="no-referrer" />}
                </div>
                <span className="team-card-member-name">{m.nameZh || m.pokemonId || "?"}</span>
              </div>
            );
          })
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>暂无成员</span>
        )}
      </div>
    </div>
  );
}
