/**
 * KO 分析目标管理面板
 * 管理用户手动添加的目标宝可梦列表
 */
import { useState, useEffect, useCallback } from "react";
import { unifiedApi } from "../../utils/api.js";
import { createDraftMember, getPokemonPreviewImage } from "../../utils/helpers.js";
import TypeChip from "../TypeChip.jsx";
import Modal from "../Modal.jsx";
import type { PokemonMember, TargetEntry } from "../../utils/koCalculation";

interface KoTargetPanelProps {
  targets: TargetEntry[];
  onTargetsChange: (targets: TargetEntry[]) => void;
}

interface PokemonSearchResult {
  id: number;
  nameZh?: string;
  primaryType?: string;
  secondaryType?: string;
  image?: { url?: string };
  images?: { official?: { url?: string }; sprite?: { url?: string }; shinyOfficial?: { url?: string }; shinySprite?: { url?: string } };
}

export default function KoTargetPanel({ targets, onTargetsChange }: KoTargetPanelProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PokemonSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // 搜索宝可梦（防抖）
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      unifiedApi(`/pokemon?q=${encodeURIComponent(search.trim())}&limit=20`)
        .then((r: any) => {
          setSearchResults(r.data || []);
          setSearching(false);
        })
        .catch(() => {
          setSearchResults([]);
          setSearching(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleAddTarget = useCallback((pokemon: PokemonSearchResult) => {
    const img = getPokemonPreviewImage(pokemon);
    const newTarget: PokemonMember = {
      ...createDraftMember(),
      pokemonId: String(pokemon.id),
      nameZh: pokemon.nameZh || "",
      primaryType: pokemon.primaryType || "",
      secondaryType: pokemon.secondaryType || "",
      imageUrl: img ? (img as any).url || "" : "",
      // 默认使用 champions 模式
      statMode: "champions",
      nature: "认真",
    } as PokemonMember;
    onTargetsChange([...targets, { member: newTarget, moves: [] }]);
    setShowPicker(false);
    setSearch("");
  }, [targets, onTargetsChange]);

  const handleRemoveTarget = useCallback((index: number) => {
    const next = [...targets];
    next.splice(index, 1);
    onTargetsChange(next);
  }, [targets, onTargetsChange]);

  return (
    <div className="ko-targets">
      <div className="ko-targets-header">
        <span className="ko-targets-title">目标宝可梦</span>
        <span className="ko-targets-count">{targets.length} 只</span>
      </div>

      {targets.length > 0 && (
        <div className="ko-targets-list">
          {targets.map((target, idx) => (
            <div key={idx} className="ko-target-item">
              {target.member.imageUrl && (
                <img className="ko-target-img" src={target.member.imageUrl} alt="" referrerPolicy="no-referrer" />
              )}
              <div className="ko-target-info">
                <div className="ko-target-name">
                  {target.member.nameZh || target.member.pokemonId}
                </div>
                <div className="ko-target-detail">
                  {target.member.primaryType && <TypeChip type={target.member.primaryType} size="xs" />}
                  {target.member.secondaryType && <TypeChip type={target.member.secondaryType} size="xs" />}
                  {target.member.nature !== "认真" && ` · ${target.member.nature}`}
                  {target.member.itemName && ` · ${target.member.itemName}`}
                </div>
              </div>
              <button
                className="ko-target-remove"
                onClick={() => handleRemoveTarget(idx)}
                title="移除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button className="ko-add-target-btn" onClick={() => setShowPicker(true)}>
        + 添加目标宝可梦
      </button>

      {/* 添加目标 Modal */}
      <Modal open={showPicker} title="添加目标宝可梦" onClose={() => { setShowPicker(false); setSearch(""); }}>
          <div className="ko-target-picker">
            <div className="ko-target-picker-search">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" />
              </svg>
              <input
                type="text"
                placeholder="搜索宝可梦名称 / 编号…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="ko-target-picker-list">
              {searching && <div style={{ textAlign: "center", padding: "1rem", color: "#999" }}>搜索中…</div>}
              {!searching && search.trim() && searchResults.length === 0 && (
                <div style={{ textAlign: "center", padding: "1rem", color: "#999" }}>未找到匹配的宝可梦</div>
              )}
              {searchResults.map((pokemon) => {
                const img = getPokemonPreviewImage(pokemon);
                return (
                  <div
                    key={pokemon.id}
                    className="ko-target-picker-item"
                    onClick={() => handleAddTarget(pokemon)}
                  >
                    {img && <img src={(img as any).url || ""} alt="" referrerPolicy="no-referrer" />}
                    <span>{pokemon.nameZh || pokemon.id}</span>
                    {pokemon.primaryType && <TypeChip type={pokemon.primaryType} size="xs" />}
                    {pokemon.secondaryType && <TypeChip type={pokemon.secondaryType} size="xs" />}
                  </div>
                );
              })}
            </div>
          </div>
      </Modal>
    </div>
  );
}
