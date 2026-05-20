import { useEffect, useMemo, useRef, useState } from "react";
import { unifiedApi } from "../../utils/api.js";
import { getPokemonPreviewImage } from "../../utils/helpers.js";
import { resolveTeamMembers } from "../../utils/teamStorage.js";
import type { Team, PokemonConfig } from "../../utils/teamStorage.js";
import type { PokemonConfigDisplay } from "./types.js";

/** resolveTeamMembers 返回的是 PokemonConfig[]，但运行时会附加展示字段 */
type ResolvedMember = PokemonConfig & Partial<PokemonConfigDisplay>;

export interface TeamCardProps {
  team: Team;
  onEdit: (team: Team) => void;
  onDelete: (teamId: string) => void;
}

export default function TeamCard({ team, onEdit, onDelete }: TeamCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const resolved: ResolvedMember[] = useMemo(() => resolveTeamMembers(team), [team]);
  const [fetchedImages, setFetchedImages] = useState<Record<string, string>>({});
  const imageRequestsRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useEffect(() => {
    const missing = resolved.filter((m) => {
      const pokemonId = String(m.pokemonId || "");
      return pokemonId && !m.imageUrl && !fetchedImages[pokemonId] && !imageRequestsRef.current.has(pokemonId);
    });
    if (missing.length === 0) return;
    missing.forEach((m) => {
      const pokemonId = String(m.pokemonId);
      imageRequestsRef.current.add(pokemonId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unifiedApi<any>(`/pokemon/${m.pokemonId}`).then((r) => {
        if (!mountedRef.current) return;
        const img = getPokemonPreviewImage(r.data);
        if (img) {
          setFetchedImages((prev) => ({ ...prev, [pokemonId]: img }));
        }
      }).catch(() => {}).finally(() => {
        imageRequestsRef.current.delete(pokemonId);
      });
    });
  }, [resolved]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
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
            const shinyVal: string | { url?: string } | undefined = m.shinyImageUrl;
            const imgUrl = m.isShiny && shinyVal
              ? (typeof shinyVal === "string" ? shinyVal : shinyVal?.url || "")
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
