import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { STAT_KEYS } from "@pokemon-localdex/store-types/constants";
import { unifiedApi } from "../../utils/api.js";
import { getPokemonPreviewImage } from "../../utils/helpers.js";
import { calculateFinalStat } from "../../utils/statCalcModel";

export default function BoxListRow({ config, onEdit, onDelete, onDuplicate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [fetchedInfo, setFetchedInfo] = useState(null);
  const [fetchedItemImageUrl, setFetchedItemImageUrl] = useState("");
  const menuRef = useRef(null);
  const btnRef = useRef(null);
  const dropdownRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      const inBtn = menuRef.current && menuRef.current.contains(e.target);
      const inDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!inBtn && !inDropdown) setMenuOpen(false);
    };
    const scrollHandler = () => setMenuOpen(false);
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", scrollHandler, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", scrollHandler, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    } else if (!menuOpen) {
      setDropdownPos(null);
    }
  }, [menuOpen]);

  useEffect(() => {
    if (config.imageUrl || !config.pokemonId) return;
    let cancelled = false;
    unifiedApi(`/pokemon/${config.pokemonId}`).then((r) => {
      if (cancelled) return;
      const p = r.data;
      const img = getPokemonPreviewImage(p);
      const shinyObj = p?.forms?.[0]?.images?.shiny || p?.images?.shiny;
      const shinyUrl = shinyObj?.url || (typeof shinyObj === "string" ? shinyObj : "");
      const baseStats = p?.forms?.[0]?.baseStats || p?.baseStats || null;
      setFetchedInfo({
        imageUrl: img?.url || "",
        shinyImageUrl: shinyUrl,
        primaryType: p?.primaryType || "",
        secondaryType: p?.secondaryType || "",
        baseStats,
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [config.pokemonId, config.imageUrl]);

  useEffect(() => {
    if (config.itemImageUrl || !config.itemId) return;
    let cancelled = false;
    unifiedApi(`/items/${config.itemId}`).then((r) => {
      if (cancelled) return;
      const item = r.data;
      if (item?.imageUrl) setFetchedItemImageUrl(item.imageUrl);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [config.itemId, config.itemImageUrl]);

  const resolveShinyUrl = (v) => (typeof v === "string" ? v : v?.url || "");
  const normalImageUrl = config.imageUrl || fetchedInfo?.imageUrl || "";
  const shinyImageUrl = resolveShinyUrl(config.shinyImageUrl) || resolveShinyUrl(fetchedInfo?.shinyImageUrl);
  const imageUrl = (config.isShiny && shinyImageUrl) ? shinyImageUrl : normalImageUrl;
  const types = [config.primaryType || fetchedInfo?.primaryType, config.secondaryType || fetchedInfo?.secondaryType].filter(Boolean);
  const itemImgUrl = config.itemImageUrl || fetchedItemImageUrl;
  const baseStats = config.baseStats || fetchedInfo?.baseStats;

  const finalStats = useMemo(() => {
    if (!baseStats) return null;
    const detail = { baseStats };
    return Object.fromEntries(
      STAT_KEYS.map((key) => [key, calculateFinalStat(config, detail, key)])
    );
  }, [baseStats, config]);

  return (
    <div className={`box-list-row${menuOpen ? " box-list-row-menu-open" : ""}`} onClick={() => onEdit(config)}>
      <div className="box-list-col box-list-col-img">
        <div className="box-list-thumb">
          {imageUrl ? <img src={imageUrl} alt={config.nameZh || ""} referrerPolicy="no-referrer" /> : <span className="box-list-thumb-empty">?</span>}
          {itemImgUrl && (
            <img className="box-list-item-overlay" src={itemImgUrl} alt={config.itemName || config.itemId} title={config.itemName || config.itemId} referrerPolicy="no-referrer" />
          )}
        </div>
      </div>

      <div className="box-list-col box-list-col-name">
        <span className="box-list-name-zh">{config.configName || config.nameZh || config.pokemonId || "未命名"}</span>
        <span className="box-list-config-name">{config.formName && config.formName !== config.nameZh ? config.formName : (config.nameZh || "")}</span>
      </div>

      <div className="box-list-col box-list-col-types">
        {types.map((t) => (
          <span key={t} className={`type-chip type-${t} box-list-type-chip`}>
            <img className="type-chip-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${t}@sm.png`} alt={t} />
            {t}
          </span>
        ))}
      </div>

      <div className="box-list-col box-list-col-ability">
        <span className="box-list-ability">{config.abilityName || config.abilityId || "—"}</span>
      </div>

      <div className="box-list-col box-list-col-nature">
        <span className="box-list-nature">{config.nature || "认真"}</span>
      </div>

      {STAT_KEYS.map((k) => (
        <div key={k} className="box-list-col box-list-col-combined-stat">
          <span className="box-list-base-val">{baseStats?.[k] ?? "—"}</span>
          <span className="box-list-combined-sep">/</span>
          <span className="box-list-stat-val">{finalStats?.[k] ?? "—"}</span>
        </div>
      ))}

      <div className="box-list-col box-list-col-actions" onClick={(e) => e.stopPropagation()}>
        <div className="box-card-menu" ref={menuRef}>
          <button className="box-card-menu-btn" ref={btnRef} onClick={() => setMenuOpen(!menuOpen)} title="操作">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="2" r="1.4"/><circle cx="7" cy="7" r="1.4"/><circle cx="7" cy="12" r="1.4"/></svg>
          </button>
          {menuOpen && dropdownPos && createPortal(
            <div className="box-card-dropdown box-list-dropdown-fixed" ref={dropdownRef} style={{ position: "fixed", top: dropdownPos.top, right: dropdownPos.right }}>
              <button onClick={() => { onEdit(config); setMenuOpen(false); }}>编辑</button>
              <button onClick={() => { onDuplicate(config.configId); setMenuOpen(false); }}>复制</button>
              <button className="danger-text" onClick={() => { onDelete(config.configId); setMenuOpen(false); }}>删除</button>
            </div>,
            document.body
          )}
        </div>
      </div>
    </div>
  );
}
