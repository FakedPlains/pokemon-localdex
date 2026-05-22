import { useState, useEffect, useRef } from "react";
import { api } from "../utils/api";
import type { DataResponse, LearnsetResponse, PaginatedResponse, MoveSearchItem } from "../utils/apiTypes";
import { STAT_KEYS } from "@pokemon-localdex/store-types/constants";
import type { StatBlock, PokemonEntry, ItemEntry, LearnsetMeta } from "@pokemon-localdex/store-types";
import type { PokemonConfigDraft } from "../utils/teamStorage";
import { getPokemonPreviewImage, calculateFinalStat } from "../utils/helpers";

interface MenuAction {
  label: string;
  onClick: () => void;
  className?: string;
}

interface FetchedInfo {
  imageUrl: string;
  shinyImageUrl: string;
  primaryType: string;
  secondaryType: string;
  baseStats: StatBlock | null;
}

interface MoveInfo {
  type: string;
  power: string;
}

export interface PokemonConfigCardProps {
  data: PokemonConfigDraft;
  menuActions?: MenuAction[];
  className?: string;
}

/**
 * 公共宝可梦配置卡片组件
 */
export default function PokemonConfigCard({ data, menuActions, className = "" }: PokemonConfigCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [fetchedInfo, setFetchedInfo] = useState<FetchedInfo | null>(null);
  const [fetchedMoves, setFetchedMoves] = useState<Record<string, MoveInfo>>({});
  const [fetchedItemImageUrl, setFetchedItemImageUrl] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // 按需获取宝可梦图片和类型信息
  useEffect(() => {
    if (data.imageUrl || !data.pokemonId) return;
    let cancelled = false;
    api<DataResponse<PokemonEntry>>(`/pokemon/${data.pokemonId}`).then((r) => {
      if (cancelled) return;
      const p = r.data;
      const img = getPokemonPreviewImage(p);
      const imgs = p?.forms?.[0]?.images;
      const shinyObj = imgs?.shiny || imgs?.shinyOfficial || imgs?.shinySprite;
      const shinyUrl = shinyObj?.url || (typeof shinyObj === "string" ? shinyObj : "");
      const baseStats = p?.forms?.[0]?.baseStats || p?.baseStats || null;
      setFetchedInfo({ imageUrl: img || "", shinyImageUrl: shinyUrl, primaryType: p?.primaryType || "", secondaryType: p?.secondaryType || "", baseStats });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [data.pokemonId, data.imageUrl]);

  // 按需获取道具图片
  useEffect(() => {
    if (data.itemImageUrl || !data.itemId) return;
    let cancelled = false;
    api<DataResponse<ItemEntry>>(`/items/${data.itemId}`).then((r) => {
      if (cancelled) return;
      const item = r.data;
      if (item?.imageUrl) setFetchedItemImageUrl(item.imageUrl);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [data.itemId, data.itemImageUrl]);

  // 按需获取招式类型信息
  useEffect(() => {
    const moves = (data.moves || []).filter(Boolean);
    if (moves.length === 0 || data._movesInfo) return;
    if (!data.pokemonId) return;
    let cancelled = false;
    api<DataResponse<PokemonEntry>>(`/pokemon/${data.pokemonId}`).then((r) => {
      if (cancelled) return;
      const pid = r.data?.id;
      if (!pid) return;
      return api<DataResponse<LearnsetMeta>>(`/pokemon/${pid}/learnset/meta`).then((meta) => {
        if (cancelled) return;
        const gens = meta.data?.generations || [];
        const latestGen = gens.length > 0 ? gens[gens.length - 1] : 9;
        const formKeys = meta.data?.formKeys || [];
        const form = formKeys[0] || "default";
        return api<LearnsetResponse>(`/pokemon/${pid}/learnset?generation=${latestGen}&form=${form}`);
      });
    }).then(async (r) => {
      if (cancelled || !r) return;
      const entries = Array.isArray(r.data?.moves) ? r.data.moves : [];
      const moveMap: Record<string, MoveInfo> = {};
      for (const entry of entries) {
        const name = entry.moveNameZh || String(entry.moveId || "");
        if (name && moves.includes(name)) {
          moveMap[name] = { type: entry.moveType || "", power: entry.movePower ? String(entry.movePower) : "" };
        }
      }
      const missing = moves.filter((m) => !moveMap[m]);
      if (missing.length > 0) {
        const results = await Promise.all(
          missing.map((name) => api<PaginatedResponse<MoveSearchItem>>(`/moves?q=${encodeURIComponent(name)}`).catch(() => null))
        );
        for (let i = 0; i < missing.length; i++) {
          if (cancelled) return;
          const moveName = missing[i];
          if (!moveName) continue;
          const d = results[i]?.data;
          if (d && d.length > 0) {
            const match = d.find((m) => m.nameZh === moveName) || d[0];
            if (match) {
              moveMap[moveName] = { type: match.type || "", power: match.power ? String(match.power) : "" };
            }
          }
        }
      }
      if (!cancelled) setFetchedMoves(moveMap);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [data.pokemonId, data.moves, data._movesInfo]);

  // ── 派生数据 ──
  const resolveShinyUrl = (v: string | { url?: string } | undefined): string => (typeof v === "string" ? v : v?.url || "");
  const normalImageUrl = data.imageUrl || fetchedInfo?.imageUrl || "";
  const shinyImageUrl = resolveShinyUrl(data.shinyImageUrl) || resolveShinyUrl(fetchedInfo?.shinyImageUrl);
  const imageUrl = (data.isShiny && shinyImageUrl) ? shinyImageUrl : normalImageUrl;
  const types = [data.primaryType || fetchedInfo?.primaryType, data.secondaryType || fetchedInfo?.secondaryType].filter(Boolean) as string[];
  const itemImgUrl = data.itemImageUrl || fetchedItemImageUrl;

  const movesWithType = (data.moves || []).filter(Boolean).map((moveName) => {
    const moveInfo = data._movesInfo?.[moveName];
    if (moveInfo) {
      return { name: moveName, type: moveInfo.type || "", power: moveInfo.power ? String(moveInfo.power) : "" };
    }
    const fetched = fetchedMoves[moveName];
    if (fetched) {
      return { name: moveName, type: fetched.type, power: fetched.power ? String(fetched.power) : "" };
    }
    return { name: moveName, type: "", power: "" };
  });

  // ── 能力值计算 ──
  const baseStats = data.baseStats || fetchedInfo?.baseStats;

  return (
    <div className={`box-card ${className}`.trim()}>
      {/* 顶栏：名称 + 等级 + 配置名 + 菜单 */}
      <div className="box-card-header">
        <div className="box-card-name">
          <strong>{data.configName || data.nameZh || data.pokemonId || "未命名"}</strong>
          <span className="box-card-level">Lv.{data.level || 50}</span>
        </div>
        <span className="box-card-title">{data.formName && data.formName !== data.nameZh ? data.formName : (data.nameZh || "")}</span>
        {menuActions && menuActions.length > 0 && (
          <div className="box-card-menu" ref={menuRef}>
            <button className="box-card-menu-btn" onClick={() => setMenuOpen(!menuOpen)} title="操作">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="2" r="1.4"/><circle cx="7" cy="7" r="1.4"/><circle cx="7" cy="12" r="1.4"/></svg>
            </button>
            {menuOpen && (
              <div className="box-card-dropdown">
                {menuActions.map((action, i) => (
                  <button
                    key={i}
                    className={action.className || ""}
                    onClick={() => { action.onClick(); setMenuOpen(false); }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 左右布局 */}
      <div className="box-card-body">
        {/* 左侧：图片 + 属性 + 特性/性格 */}
        <div className="box-card-left">
          <div className="box-card-thumb">
            {imageUrl ? <img src={imageUrl} alt={data.nameZh || ""} referrerPolicy="no-referrer" /> : <span className="box-card-thumb-empty">?</span>}
            {itemImgUrl && (
              <img className="box-card-item-overlay" src={itemImgUrl} alt={data.itemName || data.itemId} title={data.itemName || data.itemId} referrerPolicy="no-referrer" />
            )}
          </div>
          {types.length > 0 && (
            <div className="box-card-types">
              {types.map((t) => (
                <span key={t} className={`box-card-type-icon type-${t}`} title={t}>
                  <img src={`${import.meta.env.BASE_URL}assets/type-icons/type-${t}@sm.png`} alt={t} />
                </span>
              ))}
            </div>
          )}
          <div className="box-card-meta">
            {(data.abilityName || data.abilityId) && <span className="box-card-tag">{data.abilityName || data.abilityId}</span>}
            <span className="box-card-tag">{data.nature || "认真"}</span>
          </div>
        </div>

        {/* 右侧：招式 */}
        <div className="box-card-right">
          {movesWithType.length > 0 && (
            <div className="box-card-moves">
              {movesWithType.map((m, i) => (
                <div key={i} className={`box-card-move type-bg-${m.type || "unknown"}`}>
                  {m.type && (
                    <img className="box-card-move-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${m.type}@sm.png`} alt={m.type} />
                  )}
                  <span className="box-card-move-name">{m.name}</span>
                  {m.power && <span className="box-card-move-power">{m.power}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 能力值 — 横跨底部 */}
      {baseStats && (() => {
        const detail = { baseStats };
        const stats = Object.fromEntries(
          STAT_KEYS.map((key) => [key, calculateFinalStat(data, detail, key)])
        );
        const isChampions = data.statMode === "champions";
        return (
          <div className="box-card-stats">
            <div className="box-card-stats-header">
              <span></span>
              <span>HP</span><span>攻击</span><span>防御</span><span>特攻</span><span>特防</span><span>速度</span>
            </div>
            <div className="box-card-stats-row">
              <span className="box-card-stats-tag box-card-stats-tag-base">种族</span>
              {STAT_KEYS.map((k) => (
                <span key={k} className="box-card-stats-num box-card-stats-num-base">{baseStats[k] ?? "—"}</span>
              ))}
            </div>
            {isChampions ? (
              <div className="box-card-stats-row">
                <span className="box-card-stats-tag box-card-stats-tag-sp">SP</span>
                {STAT_KEYS.map((k) => (
                  <span key={k} className="box-card-stats-num box-card-stats-num-sp">{data.sps?.[k] || 0}</span>
                ))}
              </div>
            ) : (
              <>
                <div className="box-card-stats-row">
                  <span className="box-card-stats-tag box-card-stats-tag-iv">个体</span>
                  {STAT_KEYS.map((k) => (
                    <span key={k} className="box-card-stats-num box-card-stats-num-iv">{data.ivs?.[k] ?? 31}</span>
                  ))}
                </div>
                <div className="box-card-stats-row">
                  <span className="box-card-stats-tag box-card-stats-tag-ev">努力</span>
                  {STAT_KEYS.map((k) => (
                    <span key={k} className="box-card-stats-num box-card-stats-num-ev">{data.evs?.[k] || 0}</span>
                  ))}
                </div>
              </>
            )}
            <div className="box-card-stats-row">
              <span className="box-card-stats-tag">能力</span>
              {STAT_KEYS.map((k) => (
                <span key={k} className="box-card-stats-num has-val">{stats[k]}</span>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
