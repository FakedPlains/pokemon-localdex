import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { unifiedApi } from "../utils/api.js";
import { STAT_KEYS, NATURE_OPTIONS } from "../utils/constants.js";
import { createDraftMember, createDefaultStats, getPokemonPreviewImage, calculateFinalStat } from "../utils/helpers.js";
import {
  getBox, saveBoxConfig, deleteBoxConfig, duplicateBoxConfig,
  getTeams, saveTeam, deleteTeam,
  resolveTeamMembers
} from "../utils/teamStorage.js";
import StatCalculator from "../components/StatCalculator.jsx";
import { useToast } from "../components/Toast.jsx";

// ══════════════════════════════════════════════
//  宝可梦配置编辑器
// ══════════════════════════════════════════════

function PokemonEditor({ config, onChange, onSave, onCancel, saveLabel }) {
  const [pokemonDetail, setPokemonDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isShiny, setIsShiny] = useState(config.isShiny || false);
  const [configName, setConfigName] = useState(config.configName || "");
  const [activePanel, setActivePanel] = useState(null); // "item" | "move-0" | "move-1" | "move-2" | "move-3" | "stats" | null
  const [panelSearch, setPanelSearch] = useState("");
  const [items, setItems] = useState([]);
  const [itemsHasMore, setItemsHasMore] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemSearchResults, setItemSearchResults] = useState(null); // null = 使用分页列表
  const [moveSearchResults, setMoveSearchResults] = useState(null); // null = 使用宝可梦招式列表
  const [movesLoading, setMovesLoading] = useState(false);
  const itemsOffsetRef = useRef(0);
  const itemsInitRef = useRef(false);
  const itemListRef = useRef(null);
  const moveListRef = useRef(null);
  const itemSearchTimer = useRef(null);
  const pokemonId = config.pokemonId;

  // 道具分页加载（仅在面板打开时触发）
  const loadItemsPage = useCallback((reset) => {
    if (itemsLoading) return;
    if (!reset && !itemsHasMore) return;
    const offset = reset ? 0 : itemsOffsetRef.current;
    setItemsLoading(true);
    unifiedApi(`/items?limit=50&offset=${offset}`).then((r) => {
      const newItems = r.data || [];
      if (reset) {
        setItems(newItems);
      } else {
        setItems((prev) => [...prev, ...newItems]);
      }
      setItemsHasMore(r.hasMore ?? false);
      itemsOffsetRef.current = offset + newItems.length;
      setItemsLoading(false);
    }).catch(() => { setItemsLoading(false); });
  }, [itemsLoading, itemsHasMore]);

  // 面板打开时加载首页道具
  useEffect(() => {
    if (activePanel === "item" && !itemsInitRef.current) {
      itemsInitRef.current = true;
      loadItemsPage(true);
    }
  }, [activePanel]); // eslint-disable-line react-hooks/exhaustive-deps

  // 道具搜索（防抖，走 API）
  useEffect(() => {
    if (activePanel !== "item") return;
    if (!panelSearch.trim()) {
      setItemSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      setItemsLoading(true);
      unifiedApi(`/items?q=${encodeURIComponent(panelSearch.trim())}&limit=50`).then((r) => {
        setItemSearchResults(r.data || []);
        setItemsLoading(false);
      }).catch(() => { setItemSearchResults([]); setItemsLoading(false); });
    }, 300);
    return () => clearTimeout(timer);
  }, [panelSearch, activePanel]);

  // 招式搜索（防抖，走 /moves API）
  useEffect(() => {
    if (!activePanel?.startsWith("move-")) return;
    if (!panelSearch.trim()) {
      setMoveSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      setMovesLoading(true);
      unifiedApi(`/moves?q=${encodeURIComponent(panelSearch.trim())}&limit=50`).then((r) => {
        setMoveSearchResults(r.data || []);
        setMovesLoading(false);
      }).catch(() => { setMoveSearchResults([]); setMovesLoading(false); });
    }, 300);
    return () => clearTimeout(timer);
  }, [panelSearch, activePanel]);

  // 道具列表滚动加载更多（仅在非搜索模式下）
  const handleItemScroll = useCallback((e) => {
    if (panelSearch.trim()) return; // 搜索模式不分页
    const el = e.target;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      loadItemsPage(false);
    }
  }, [loadItemsPage, panelSearch]);

  useEffect(() => {
    if (!pokemonId) { setPokemonDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    unifiedApi(`/pokemon/${encodeURIComponent(pokemonId)}`).then((r) => {
      if (!cancelled) {
        setPokemonDetail(r.data);
        setDetailLoading(false);
        // 保存闪光图片 URL 和 baseStats 到 config
        const imgs = r.data?.forms?.[0]?.images || r.data?.images;
        const shinyObj = imgs?.shiny || imgs?.shinyOfficial || imgs?.shinySprite;
        const shinyUrl = shinyObj?.url || (typeof shinyObj === "string" ? shinyObj : "");
        const detailBaseStats = r.data?.forms?.[0]?.baseStats || r.data?.baseStats;
        const updates = {};
        if (shinyUrl && !config.shinyImageUrl) updates.shinyImageUrl = shinyUrl;
        if (detailBaseStats && !config.baseStats) updates.baseStats = detailBaseStats;
        if (Object.keys(updates).length > 0) {
          onChange((prev) => ({ ...prev, ...updates }));
        }
      }
    }).catch(() => {
      if (!cancelled) { setPokemonDetail(null); setDetailLoading(false); }
    });
    return () => { cancelled = true; };
  }, [pokemonId]);

  /* ── 特性列表（分普通 / 隐藏） ── */
  const abilityGroups = useMemo(() => {
    if (!pokemonDetail) return { normal: [], hidden: [] };
    const form = pokemonDetail.forms?.[0];
    const abilities = form?.abilities || [];
    if (abilities.length > 0) {
      return {
        normal: abilities.filter((ab) => !ab.isHidden).map((ab) => ab.nameZh || ab.abilityId || ""),
        hidden: abilities.filter((ab) => ab.isHidden).map((ab) => ab.nameZh || ab.abilityId || ""),
      };
    }
    const topAbilities = pokemonDetail.abilities || [];
    return {
      normal: topAbilities,
      hidden: pokemonDetail.hiddenAbility ? [pokemonDetail.hiddenAbility] : [],
    };
  }, [pokemonDetail]);

  const allAbilities = useMemo(() => [...abilityGroups.normal, ...abilityGroups.hidden], [abilityGroups]);

  const [movesList, setMovesList] = useState([]);
  useEffect(() => {
    if (!pokemonDetail) { setMovesList([]); return; }
    let cancelled = false;
    unifiedApi(`/pokemon/${pokemonDetail.id}/learnset/meta`).then((meta) => {
      if (cancelled) return;
      const gens = meta.data?.generations || [];
      const latestGen = gens.length > 0 ? gens[gens.length - 1] : 9;
      const formKeys = meta.data?.formKeys || [];
      const form = formKeys[0] || "default";
      return unifiedApi(`/pokemon/${pokemonDetail.id}/learnset?generation=${latestGen}&form=${form}`);
    }).then((r) => {
      if (cancelled || !r) return;
      const entries = r.data || [];
      const seen = new Set();
      const moves = [];
      for (const entry of entries) {
        const name = entry.moveNameZh || entry.moveId;
        if (name && !seen.has(name)) {
          seen.add(name);
          moves.push({
            value: name,
            label: name,
            moveType: entry.moveType || "",
            moveCategory: entry.moveCategory || "",
            movePower: entry.movePower ?? null,
            moveAccuracy: entry.moveAccuracy ?? null,
            movePP: entry.movePP ?? null,
            moveDescription: entry.moveDescription || "",
          });
        }
      }
      setMovesList(moves);
    }).catch(() => { if (!cancelled) setMovesList([]); });
    return () => { cancelled = true; };
  }, [pokemonDetail]);

  const itemOptions = useMemo(() => {
    return items.map((item) => ({
      value: item.slug || String(item.id),
      label: item.nameZh || item.slug || String(item.id),
      sublabel: item.effectSummary || "",
      imageUrl: item.imageUrl || "",
    }));
  }, [items]);

  /* ── 图片（普通 / 闪光） ── */
  const detailImages = pokemonDetail?.forms?.[0]?.images || pokemonDetail?.images;
  const previewImage = useMemo(() => {
    if (isShiny) {
      const shiny = detailImages?.shiny || detailImages?.shinyOfficial || detailImages?.shinySprite;
      if (shiny) return shiny;
    }
    if (pokemonDetail) return getPokemonPreviewImage(pokemonDetail);
    return null;
  }, [pokemonDetail, detailImages, isShiny]);

  const baseStats = useMemo(() => {
    if (!pokemonDetail) return null;
    const form = pokemonDetail.forms?.[0];
    return form?.baseStats || pokemonDetail.baseStats || null;
  }, [pokemonDetail]);

  /* ── 属性 ── */
  const types = useMemo(() => {
    if (!pokemonDetail) return [];
    const form = pokemonDetail.forms?.[0];
    // API uses primaryType/secondaryType instead of a types array
    const src = form || pokemonDetail;
    const arr = [];
    if (src.primaryType) arr.push(src.primaryType);
    if (src.secondaryType) arr.push(src.secondaryType);
    if (arr.length > 0) return arr;
    return form?.types || pokemonDetail.types || [];
  }, [pokemonDetail]);

  const handleField = (field, value) => {
    const draft = { ...config };
    draft[field] = field === "level" ? Number(value || 50) : value;
    onChange(draft);
  };

  const handleMove = (moveIndex, value, moveOpt) => {
    const draft = { ...config, moves: [...(config.moves || ["", "", "", ""])] };
    draft.moves[moveIndex] = value;
    // 保存招式类型信息以便展示
    if (moveOpt && value) {
      const movesInfo = { ...(config._movesInfo || {}) };
      movesInfo[value] = { type: moveOpt.moveType || "", power: moveOpt.movePower ?? "", category: moveOpt.moveCategory || "" };
      draft._movesInfo = movesInfo;
    }
    onChange(draft);
  };

  const handleStatChange = useCallback(({ level, nature, ivs, evs, statMode, sps, champNature }) => {
    onChange((prev) => {
      if (prev.level === level && prev.nature === nature &&
          prev.statMode === statMode &&
          JSON.stringify(prev.ivs) === JSON.stringify(ivs) &&
          JSON.stringify(prev.evs) === JSON.stringify(evs) &&
          JSON.stringify(prev.sps) === JSON.stringify(sps)) {
        return prev;
      }
      return { ...prev, level, nature, ivs, evs, statMode: statMode || "classic", sps: sps || {}, champNature: champNature || nature };
    });
  }, [onChange]);

  const statInitialValues = {
    level: config.level || 50,
    nature: config.nature || "认真",
    ivs: config.ivs || createDefaultStats("iv"),
    evs: config.evs || createDefaultStats("ev"),
    statMode: config.statMode || "classic",
    sps: config.sps || {},
    champNature: config.champNature || config.nature || "认真",
  };

  /* ── 下方面板：搜索过滤 ── */
  const panelFilteredItems = useMemo(() => {
    if (itemSearchResults !== null) {
      // 搜索模式：使用 API 返回的结果
      return itemSearchResults.map((item) => ({
        value: item.slug || String(item.id),
        label: item.nameZh || item.slug || String(item.id),
        sublabel: item.effectSummary || "",
        imageUrl: item.imageUrl || "",
      }));
    }
    return itemOptions;
  }, [itemOptions, itemSearchResults]);

  const panelFilteredMoves = useMemo(() => {
    if (moveSearchResults !== null) {
      // 搜索模式：使用 /moves API 返回的结果
      return moveSearchResults.map((m) => ({
        value: m.nameZh || String(m.id),
        label: m.nameZh || String(m.id),
        moveType: m.type || "",
        moveCategory: m.category || "",
        movePower: m.power ?? null,
        moveAccuracy: m.accuracy ?? null,
        movePP: m.pp ?? null,
        moveDescription: m.description || "",
      }));
    }
    return movesList;
  }, [movesList, moveSearchResults]);

  const openPanel = (panel) => {
    setActivePanel(panel);
    setPanelSearch("");
  };

  /* ── 计算实际能力值 ── */
  const finalStats = useMemo(() => {
    if (!baseStats) return null;
    const detail = { baseStats };
    return Object.fromEntries(
      STAT_KEYS.map((key) => [key, calculateFinalStat(config, detail, key)])
    );
  }, [baseStats, config]);

  const statTotal = useMemo(() => {
    if (!finalStats) return null;
    return STAT_KEYS.reduce((sum, key) => sum + (finalStats[key] || 0), 0);
  }, [finalStats]);

  return (
    <div className="cfg-editor">
      {/* ══ 上方：三等分配置区 ══ */}
      <div className="cfg-top">
        {/* 第一栏：图片 + 属性 + 闪光 + 特性 + 道具 */}
        <div className="cfg-col cfg-col-first">
          <div className="cfg-first-inner">
            <div className="cfg-first-img">
              <div className="cfg-preview-img">
                {previewImage?.url
                  ? <img src={previewImage.url} alt={config.nameZh || ""} referrerPolicy="no-referrer" />
                  : <span className="cfg-preview-empty">{pokemonId ? "…" : "?"}</span>}
                {config.itemImageUrl && (
                  <img className="cfg-item-overlay" src={config.itemImageUrl} alt={config.itemId || ""} referrerPolicy="no-referrer" />
                )}
              </div>
              <div className="cfg-types">
                {types.map((t) => (
                  <span key={t} className={`type-chip type-${t}`}>
                    <img className="type-chip-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${t}@sm.png`} alt="" />
                    {t}
                  </span>
                ))}
              </div>
              <div className="cfg-shiny-toggle">
                <button className={!isShiny ? "active" : ""} onClick={() => { setIsShiny(false); onChange({ ...config, isShiny: false }); }}>普通</button>
                <button className={isShiny ? "active" : ""} onClick={() => { setIsShiny(true); onChange({ ...config, isShiny: true }); }}>闪光</button>
              </div>
            </div>
            <div className="cfg-first-meta">
              <div className="cfg-section-label">特性</div>
              <div className="cfg-ability-tabs">
                {abilityGroups.normal.map((name) => (
                  <button
                    key={name}
                    className={`te-ability-tab${config.abilityId === name ? " te-ability-tab-active" : ""}`}
                    onClick={() => handleField("abilityId", name)}
                  >{name}</button>
                ))}
                {abilityGroups.hidden.map((name) => (
                  <button
                    key={name}
                    className={`te-ability-tab te-ability-tab-hidden${config.abilityId === name ? " te-ability-tab-active" : ""}`}
                    onClick={() => handleField("abilityId", name)}
                    title="隐藏特性"
                  >{name}<span className="te-ha-badge">HA</span></button>
                ))}
                {allAbilities.length === 0 && (
                  <span className="muted" style={{ fontSize: 12 }}>{detailLoading ? "加载中…" : "暂无"}</span>
                )}
              </div>
              <div className="cfg-section-label">道具</div>
              {activePanel === "item" ? (
                <div className="cfg-item-search-wrap">
                  <input
                    className="cfg-item-search-input"
                    placeholder="搜索道具…"
                    value={panelSearch}
                    onChange={(e) => setPanelSearch(e.target.value)}
                    autoFocus
                  />
                  {panelSearch && (
                    <button className="cfg-item-search-clear" onClick={() => setPanelSearch("")}>✕</button>
                  )}
                  <button className="cfg-item-search-close" onClick={() => setActivePanel(null)}>取消</button>
                </div>
              ) : (
                <button
                  className="cfg-slot-btn"
                  onClick={() => openPanel("item")}
                >
                  {config.itemId ? (
                    <span className="cfg-item-selected">
                      {config.itemImageUrl && <img className="cfg-item-selected-img" src={config.itemImageUrl} alt="" referrerPolicy="no-referrer" />}
                      <span>{config.itemId}</span>
                    </span>
                  ) : "选择道具…"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 第二栏：招式 */}
        <div className="cfg-col cfg-col-moves">
          <div className="cfg-section-label">招式</div>
          {[0, 1, 2, 3].map((mi) => {
            if (activePanel === `move-${mi}`) {
              return (
                <div key={mi} className="cfg-move-search-wrap">
                  <input
                    className="cfg-move-search-input"
                    placeholder={`搜索招式 ${mi + 1}…`}
                    value={panelSearch}
                    onChange={(e) => setPanelSearch(e.target.value)}
                    autoFocus
                  />
                  {panelSearch && (
                    <button className="cfg-move-search-clear" onClick={() => setPanelSearch("")}>✕</button>
                  )}
                  <button className="cfg-move-search-close" onClick={() => setActivePanel(null)}>取消</button>
                </div>
              );
            }
            const moveName = config.moves?.[mi];
            if (moveName) {
              // 优先从 config._movesInfo 获取，其次从 movesList 查找
              const savedInfo = config._movesInfo?.[moveName];
              const moveInfo = movesList.find((m) => m.value === moveName);
              const moveType = savedInfo?.type || moveInfo?.moveType || "";
              const movePower = savedInfo?.power || moveInfo?.movePower;
              return (
                <div
                  key={mi}
                  className={`box-card-move type-bg-${moveType || "unknown"} cfg-move-slot`}
                  onClick={() => openPanel(`move-${mi}`)}
                >
                  {moveType && (
                    <img className="box-card-move-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${moveType}@sm.png`} alt={moveType} />
                  )}
                  <span className="box-card-move-name">{moveName}</span>
                  {movePower && <span className="box-card-move-power">{movePower}</span>}
                </div>
              );
            }
            return (
              <button
                key={mi}
                className="cfg-slot-btn"
                onClick={() => openPanel(`move-${mi}`)}
              >
                {`招式 ${mi + 1}`}
              </button>
            );
          })}
        </div>

        {/* 第三栏：能力值概览 */}
        <div className="cfg-col cfg-col-stats" onClick={() => openPanel(activePanel === "stats" ? null : "stats")}>
          <div className="cfg-section-label">
            能力值
            {config.statMode === "champions" && <span className="cfg-section-mode-badge">🏆SP</span>}
          </div>
          {finalStats ? (
            <div className="cfg-stats-mini">
              {STAT_KEYS.map((key) => (
                <div key={key} className="cfg-stat-row">
                  <span className="cfg-stat-name">{key}</span>
                  <div className="cfg-stat-bar">
                    <div className="cfg-stat-fill" style={{ width: `${Math.min(100, (finalStats[key] || 0) / 2.55)}%` }} />
                  </div>
                  <span className="cfg-stat-val">{finalStats[key]}</span>
                </div>
              ))}
              <div className="cfg-stat-total">合计 {statTotal}</div>
            </div>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>{detailLoading ? "加载中…" : pokemonId ? "暂无数据" : "—"}</span>
          )}
        </div>
      </div>

      {/* ══ 下方：联动面板 ══ */}
      {activePanel && (
        <div className="cfg-bottom-panel">
          {/* 道具面板 */}
          {activePanel === "item" && (
            <div className="cfg-item-panel-list" ref={itemListRef} onScroll={handleItemScroll}>
              {panelFilteredItems.map((opt) => (
                <div
                  key={opt.value}
                  className={`cfg-item-panel-row${config.itemId === opt.value ? " cfg-item-panel-row-active" : ""}`}
                  onClick={() => { const draft = { ...config, itemId: opt.value, itemImageUrl: opt.imageUrl }; onChange(draft); setActivePanel(null); setPanelSearch(""); }}
                >
                  <div className="cfg-item-panel-img">
                    {opt.imageUrl && <img src={opt.imageUrl} alt="" referrerPolicy="no-referrer" />}
                  </div>
                  <div className="cfg-item-panel-info">
                    <span className="cfg-item-panel-name">{opt.label}</span>
                    {opt.sublabel && <span className="cfg-item-panel-desc">{opt.sublabel}</span>}
                  </div>
                </div>
              ))}
              {itemsLoading && <div className="cfg-panel-empty">加载中…</div>}
              {!itemsLoading && panelFilteredItems.length === 0 && <div className="cfg-panel-empty">无匹配结果</div>}
            </div>
          )}

          {/* 招式面板 */}
          {activePanel?.startsWith("move-") && (() => {
            const mi = Number(activePanel.split("-")[1]);
            return (
              <div className="cfg-move-panel-wrap" ref={moveListRef}>
                <table className="cfg-move-panel-table">
                  <thead>
                    <tr>
                      <th className="cfg-mth-name">招式</th>
                      <th className="cfg-mth-type">属性</th>
                      <th className="cfg-mth-cat">类型</th>
                      <th className="cfg-mth-num">威力</th>
                      <th className="cfg-mth-num">命中</th>
                      <th className="cfg-mth-num">PP</th>
                      <th className="cfg-mth-desc">描述</th>
                    </tr>
                  </thead>
                  <tbody>
                    {panelFilteredMoves.map((opt) => (
                      <tr
                        key={opt.value}
                        className={`cfg-move-panel-row${config.moves?.[mi] === opt.value ? " cfg-move-panel-row-active" : ""}`}
                        onClick={() => { handleMove(mi, opt.value, opt); setActivePanel(null); setPanelSearch(""); }}
                      >
                        <td className="cfg-mtd-name">{opt.label}</td>
                        <td className="cfg-mtd-type">
                          {opt.moveType && (
                            <span className={`type-chip type-${opt.moveType}`}>
                              <img className="type-chip-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${opt.moveType}@sm.png`} alt="" />
                              {opt.moveType}
                            </span>
                          )}
                        </td>
                        <td className="cfg-mtd-cat">
                          {opt.moveCategory && (
                            <span className={`cfg-move-cat-chip cfg-move-cat-${opt.moveCategory}`} title={opt.moveCategory}>
                              <img src={`${import.meta.env.BASE_URL}assets/type-icons/category-${opt.moveCategory}@sm.png`} alt="" />
                            </span>
                          )}
                        </td>
                        <td className="cfg-mtd-num">{opt.movePower ?? "—"}</td>
                        <td className="cfg-mtd-num">{opt.moveAccuracy != null ? `${opt.moveAccuracy}%` : "—"}</td>
                        <td className="cfg-mtd-num">{opt.movePP ?? "—"}</td>
                        <td className="cfg-mtd-desc" title={opt.moveDescription || ""}>{opt.moveDescription || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {movesLoading && <div className="cfg-panel-empty">加载中…</div>}
                {!movesLoading && panelFilteredMoves.length === 0 && <div className="cfg-panel-empty">{detailLoading ? "加载中…" : "无匹配结果"}</div>}
              </div>
            );
          })()}

          {/* 能力值面板 */}
          {activePanel === "stats" && baseStats && (
            <>
              <div className="cfg-panel-header">
                <span className="cfg-panel-title">能力值分配</span>
                <button className="cfg-panel-close" onClick={() => setActivePanel(null)}>✕</button>
              </div>
              <div className="cfg-panel-stats">
                <StatCalculator baseStats={baseStats} initialValues={statInitialValues} onChange={handleStatChange} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ 底部操作栏 ══ */}
      <div className="cfg-actions">
        <button onClick={onSave}>{saveLabel || "保存配置"}</button>
        {onCancel && <button className="secondary" onClick={onCancel}>取消</button>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  自定义下拉选择器（替代原生 select）
// ══════════════════════════════════════════════

function CustomSelect({ value, options, placeholder, onChange, className }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected ? selected.label : (placeholder || "请选择…");

  return (
    <div className={`cs-wrap ${className || ""}`} ref={wrapRef}>
      <button
        type="button"
        className={`cs-trigger${!selected ? " cs-placeholder" : ""}`}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        <span className="cs-label">{displayLabel}</span>
        <svg className="cs-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="cs-dropdown">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`cs-option${opt.value === value ? " cs-option-active" : ""}`}
              onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
//  宝可梦选择列表（横向表格样式，按需分页加载）
// ══════════════════════════════════════════════

const PAGE_SIZE = 50;

function PokemonPickerList({ search = "", onSelect }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("desc");
  const [allData, setAllData] = useState([]);       // 已加载的全部数据
  const [offset, setOffset] = useState(0);          // 当前加载偏移
  const [hasMore, setHasMore] = useState(true);     // 是否还有更多数据
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const tableWrapRef = useRef(null);
  const searchRef = useRef(search);

  // 加载一页数据
  const loadPage = useCallback(async (currentOffset, query, reset = false) => {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(currentOffset) });
      if (query.trim()) params.set("q", query.trim());
      const r = await unifiedApi(`/pokemon?${params.toString()}`);
      const list = r.data || [];
      if (reset) {
        setAllData(list);
      } else {
        setAllData((prev) => [...prev, ...list]);
      }
      setHasMore(list.length >= PAGE_SIZE);
      setOffset(currentOffset + list.length);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
      setInitialLoading(false);
    }
  }, []);

  // 搜索变化时重新加载
  useEffect(() => {
    searchRef.current = search;
    setAllData([]);
    setOffset(0);
    setHasMore(true);
    setInitialLoading(true);
    loadPage(0, search, true);
  }, [search, loadPage]);

  // 滚动加载更多
  useEffect(() => {
    const wrap = tableWrapRef.current;
    if (!wrap) return;
    const handleScroll = () => {
      if (loadingMore || !hasMore) return;
      if (wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 60) {
        loadPage(offset, searchRef.current, false);
      }
    };
    wrap.addEventListener("scroll", handleScroll, { passive: true });
    return () => wrap.removeEventListener("scroll", handleScroll);
  }, [offset, hasMore, loadingMore, loadPage]);

  // 前端排序
  const visible = useMemo(() => {
    if (!sortKey) return allData;
    return [...allData].sort((a, b) => {
      const va = (sortKey === "bst")
        ? STAT_KEYS.reduce((s, k) => s + (a.baseStats?.[k] || 0), 0)
        : (a.baseStats?.[sortKey] || 0);
      const vb = (sortKey === "bst")
        ? STAT_KEYS.reduce((s, k) => s + (b.baseStats?.[k] || 0), 0)
        : (b.baseStats?.[sortKey] || 0);
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [allData, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const statCols = [
    { key: "hp", label: "HP" },
    { key: "atk", label: "Atk" },
    { key: "def", label: "Def" },
    { key: "spa", label: "SpA" },
    { key: "spd", label: "SpD" },
    { key: "spe", label: "Spe" },
    { key: "bst", label: "BST" },
  ];

  return (
    <div className="cfg-picker">
      <div className="cfg-picker-table-wrap" ref={tableWrapRef}>
        <table className="cfg-picker-table">
          <thead>
            <tr>
              <th className="cfg-th-img"></th>
              <th className="cfg-th-name">名称</th>
              <th className="cfg-th-types">属性</th>
              <th className="cfg-th-abilities">特性</th>
              {statCols.map((col) => (
                <th
                  key={col.key}
                  className={`cfg-th-stat${sortKey === col.key ? " cfg-th-stat-active" : ""}`}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && <span className="cfg-sort-arrow">{sortDir === "desc" ? "▼" : "▲"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const img = getPokemonPreviewImage(p);
              const bst = STAT_KEYS.reduce((s, k) => s + (p.baseStats?.[k] || 0), 0);
              return (
                <tr key={p.slug || p.id} className="cfg-picker-row" onClick={() => onSelect(p)}>
                  <td className="cfg-td-img">
                    {img?.url && <img src={img.url} alt={p.nameZh || ""} referrerPolicy="no-referrer" />}
                  </td>
                  <td className="cfg-td-name">
                    <span className="cfg-td-name-zh">{p.nameZh || p.slug}</span>
                    <span className="cfg-td-name-en">{p.nameEn || ""}</span>
                  </td>
                  <td className="cfg-td-types">
                    {p.primaryType && (
                      <span className={`type-chip type-${p.primaryType}`}>
                        <img className="type-chip-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${p.primaryType}@sm.png`} alt="" />
                        {p.primaryType}
                      </span>
                    )}
                    {p.secondaryType && (
                      <span className={`type-chip type-${p.secondaryType}`}>
                        <img className="type-chip-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${p.secondaryType}@sm.png`} alt="" />
                        {p.secondaryType}
                      </span>
                    )}
                  </td>
                  <td className="cfg-td-abilities">
                    {(p.abilities || []).map((a) => <span key={a} className="cfg-ability-pill">{a}</span>)}
                    {p.hiddenAbility && <span className="cfg-ability-pill cfg-ability-ha">{p.hiddenAbility}</span>}
                  </td>
                  {STAT_KEYS.map((k) => (
                    <td key={k} className="cfg-td-stat">{p.baseStats?.[k] || "—"}</td>
                  ))}
                  <td className="cfg-td-stat cfg-td-bst">{bst}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {initialLoading && (
          <div className="cfg-picker-empty">加载中…</div>
        )}
        {!initialLoading && allData.length === 0 && (
          <div className="cfg-picker-empty">没有找到匹配的宝可梦</div>
        )}
        {loadingMore && !initialLoading && (
          <div className="cfg-picker-empty" style={{ padding: "8px 0" }}>加载更多…</div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  通用弹窗
// ══════════════════════════════════════════════

function Modal({ open, onClose, title, headerExtra, children }) {
  const backdropRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" ref={backdropRef} onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}>
      <div className="modal-container">
        <div className="modal-header">
          <strong className="modal-title">{title}</strong>
          {headerExtra && <div className="modal-header-extra">{headerExtra}</div>}
          <button className="modal-close-btn" onClick={onClose} title="关闭">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.11 3.05a.75.75 0 0 0-1.06 1.06L6.94 8l-3.89 3.89a.75.75 0 1 0 1.06 1.06L8 9.06l3.89 3.89a.75.75 0 1 0 1.06-1.06L9.06 8l3.89-3.89a.75.75 0 0 0-1.06-1.06L8 6.94 4.11 3.05z"/></svg>
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ══════════════════════════════════════════════
//  盒子卡片
// ══════════════════════════════════════════════

function BoxCard({ config, onEdit, onDelete, onDuplicate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [fetchedInfo, setFetchedInfo] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const [fetchedMoves, setFetchedMoves] = useState({});
  const [fetchedItemImageUrl, setFetchedItemImageUrl] = useState("");

  // 如果旧配置没有 imageUrl，按需获取宝可梦信息
  useEffect(() => {
    if (config.imageUrl || !config.pokemonId) return;
    let cancelled = false;
    unifiedApi(`/pokemon/${encodeURIComponent(config.pokemonId)}`).then((r) => {
      if (cancelled) return;
      const p = r.data;
      const img = getPokemonPreviewImage(p);
      const imgs = p?.forms?.[0]?.images || p?.images;
      const shinyObj = imgs?.shiny || imgs?.shinyOfficial || imgs?.shinySprite;
      const shinyUrl = shinyObj?.url || (typeof shinyObj === "string" ? shinyObj : "");
      const baseStats = p?.forms?.[0]?.baseStats || p?.baseStats || null;
      setFetchedInfo({ imageUrl: img?.url || "", shinyImageUrl: shinyUrl, primaryType: p?.primaryType || "", secondaryType: p?.secondaryType || "", baseStats });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [config.pokemonId, config.imageUrl]);

  // 如果旧配置没有 itemImageUrl 但有 itemId，按需获取道具图片
  useEffect(() => {
    if (config.itemImageUrl || !config.itemId) return;
    let cancelled = false;
    unifiedApi(`/items?q=${encodeURIComponent(config.itemId)}`).then((r) => {
      if (cancelled) return;
      const items = r.data || [];
      const match = items.find((it) => it.nameZh === config.itemId || it.slug === config.itemId) || items[0];
      if (match?.imageUrl) setFetchedItemImageUrl(match.imageUrl);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [config.itemId, config.itemImageUrl]);

  // 如果旧配置没有 _movesInfo，按需获取招式信息
  useEffect(() => {
    const moves = (config.moves || []).filter(Boolean);
    if (moves.length === 0 || config._movesInfo) return;
    if (!config.pokemonId) return;
    let cancelled = false;
    // 获取宝可梦的招式列表来匹配类型
    unifiedApi(`/pokemon/${encodeURIComponent(config.pokemonId)}`).then((r) => {
      if (cancelled) return;
      const pokemonId = r.data?.id;
      if (!pokemonId) return;
      return unifiedApi(`/pokemon/${pokemonId}/learnset/meta`).then((meta) => {
        if (cancelled) return;
        const gens = meta.data?.generations || [];
        const latestGen = gens.length > 0 ? gens[gens.length - 1] : 9;
        const formKeys = meta.data?.formKeys || [];
        const form = formKeys[0] || "default";
        return unifiedApi(`/pokemon/${pokemonId}/learnset?generation=${latestGen}&form=${form}`);
      });
    }).then(async (r) => {
      if (cancelled || !r) return;
      const entries = r.data || [];
      const moveMap = {};
      for (const entry of entries) {
        const name = entry.moveNameZh || entry.moveId;
        if (name && moves.includes(name)) {
          moveMap[name] = {
            type: entry.moveType || "",
            power: entry.movePower || "",
          };
        }
      }
      // 对于 learnset 中找不到的招式（如 TM/TR 招式），通过 moves API 补充查询
      const missing = moves.filter((m) => !moveMap[m]);
      if (missing.length > 0) {
        const results = await Promise.all(
          missing.map((name) => unifiedApi(`/moves?q=${encodeURIComponent(name)}`).catch(() => null))
        );
        for (let i = 0; i < missing.length; i++) {
          if (cancelled) return;
          const data = results[i]?.data;
          if (data && data.length > 0) {
            const match = data.find((m) => m.nameZh === missing[i]) || data[0];
            moveMap[missing[i]] = { type: match.type || "", power: match.power || "" };
          }
        }
      }
      if (!cancelled) setFetchedMoves(moveMap);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [config.pokemonId, config.moves, config._movesInfo]);

  const normalImageUrl = config.imageUrl || fetchedInfo?.imageUrl || "";
  const resolveShinyUrl = (v) => (typeof v === "string" ? v : v?.url || "");
  const shinyImageUrl = resolveShinyUrl(config.shinyImageUrl) || resolveShinyUrl(fetchedInfo?.shinyImageUrl);
  const imageUrl = (config.isShiny && shinyImageUrl) ? shinyImageUrl : normalImageUrl;
  const types = [config.primaryType || fetchedInfo?.primaryType, config.secondaryType || fetchedInfo?.secondaryType].filter(Boolean);

  const movesWithType = (config.moves || []).filter(Boolean).map((moveName) => {
    // 优先从 config._movesInfo 获取，否则从 fetchedMoves 获取
    const moveInfo = config._movesInfo?.[moveName];
    if (moveInfo) {
      // _movesInfo 格式: { type: "火", power: 90, category: "特殊" }
      return { name: moveName, type: moveInfo.type || "", power: moveInfo.power ? String(moveInfo.power) : "" };
    }
    const fetched = fetchedMoves[moveName];
    if (fetched) {
      return { name: moveName, type: fetched.type, power: fetched.power ? String(fetched.power) : "" };
    }
    return { name: moveName, type: "", power: "" };
  });

  return (
    <div className="box-card">
      {/* 顶栏：宝可梦名称 + 配置名称 + 三点菜单 */}
      <div className="box-card-header">
        <div className="box-card-name">
          <strong>{config.nameZh || config.pokemonId || "未命名"}</strong>
          <span className="box-card-level">Lv.{config.level || 50}</span>
        </div>
        <span className="box-card-title">{config.configName || ""}</span>
        <div className="box-card-menu" ref={menuRef}>
          <button className="box-card-menu-btn" onClick={() => setMenuOpen(!menuOpen)} title="操作">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="2" r="1.4"/><circle cx="7" cy="7" r="1.4"/><circle cx="7" cy="12" r="1.4"/></svg>
          </button>
          {menuOpen && (
            <div className="box-card-dropdown">
              <button onClick={() => { onEdit(config); setMenuOpen(false); }}>编辑</button>
              <button onClick={() => { onDuplicate(config.configId); setMenuOpen(false); }}>复制</button>
              <button className="danger-text" onClick={() => { onDelete(config.configId); setMenuOpen(false); }}>删除</button>
            </div>
          )}
        </div>
      </div>

      {/* 左右布局 */}
      <div className="box-card-body">
        {/* 左侧：宝可梦信息 */}
        <div className="box-card-left">
          {/* 图片区域 */}
          <div className="box-card-thumb">
            {imageUrl ? <img src={imageUrl} alt={config.nameZh || ""} referrerPolicy="no-referrer" /> : <span className="box-card-thumb-empty">?</span>}
            {(config.itemImageUrl || fetchedItemImageUrl) && (
              <img className="box-card-item-overlay" src={config.itemImageUrl || fetchedItemImageUrl} alt={config.itemId} title={config.itemId} referrerPolicy="no-referrer" />
            )}
          </div>

          {/* 属性图标 */}
          {types.length > 0 && (
            <div className="box-card-types">
              {types.map((t) => (
                <span key={t} className={`box-card-type-icon type-${t}`} title={t}>
                  <img src={`${import.meta.env.BASE_URL}assets/type-icons/type-${t}@sm.png`} alt={t} />
                </span>
              ))}
            </div>
          )}

          {/* 特性 + 性格 */}
          <div className="box-card-meta">
            {config.abilityId && <span className="box-card-tag">{config.abilityId}</span>}
            <span className="box-card-tag">{config.nature || "认真"}</span>
          </div>
        </div>

        {/* 右侧：招式 */}
        <div className="box-card-right">
          {/* 招式列表 */}
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
      {(() => {
        const bs = config.baseStats || fetchedInfo?.baseStats;
        if (!bs) return null;
        const detail = { baseStats: bs };
        const stats = Object.fromEntries(
          STAT_KEYS.map((key) => [key, calculateFinalStat(config, detail, key)])
        );
        const isChampions = config.statMode === "champions";
        return (
          <div className="box-card-stats">
            <div className="box-card-stats-header">
              <span></span>
              <span>HP</span><span>攻击</span><span>防御</span><span>特攻</span><span>特防</span><span>速度</span>
            </div>
            {isChampions ? (
              <div className="box-card-stats-row">
                <span className="box-card-stats-tag box-card-stats-tag-sp">SP</span>
                {STAT_KEYS.map((k) => (
                  <span key={k} className="box-card-stats-num">{config.sps?.[k] || 0}</span>
                ))}
              </div>
            ) : (
              <>
                <div className="box-card-stats-row">
                  <span className="box-card-stats-tag box-card-stats-tag-iv">个体</span>
                  {STAT_KEYS.map((k) => (
                    <span key={k} className="box-card-stats-num">{config.ivs?.[k] ?? 31}</span>
                  ))}
                </div>
                <div className="box-card-stats-row">
                  <span className="box-card-stats-tag box-card-stats-tag-ev">努力</span>
                  {STAT_KEYS.map((k) => (
                    <span key={k} className="box-card-stats-num">{config.evs?.[k] || 0}</span>
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

// ══════════════════════════════════════════════
//  队伍成员槽位
// ══════════════════════════════════════════════

function TeamSlot({ slot, member, boxConfigs, onSelectFromBox, onRemove, onInlineEdit, onEditMember }) {
  const hasMember = member && member.pokemonId;

  const boxOptions = useMemo(() => boxConfigs.map((c) => ({ value: c.configId, label: c.configName || c.nameZh || c.pokemonId || "未命名" })), [boxConfigs]);

  // hooks 必须在条件分支之前调用（React hooks 规则）
  const [fetchedInfo, setFetchedInfo] = useState(null);
  const [fetchedMoves, setFetchedMoves] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // 按需获取宝可梦图片和类型信息
  useEffect(() => {
    if (!hasMember || member.imageUrl || !member.pokemonId) return;
    let cancelled = false;
    unifiedApi(`/pokemon/${encodeURIComponent(member.pokemonId)}`).then((r) => {
      if (cancelled) return;
      const p = r.data;
      const img = getPokemonPreviewImage(p);
      const imgs = p?.forms?.[0]?.images || p?.images;
      const shinyObj = imgs?.shiny || imgs?.shinyOfficial || imgs?.shinySprite;
      const shinyUrl = shinyObj?.url || (typeof shinyObj === "string" ? shinyObj : "");
      const baseStats = p?.forms?.[0]?.baseStats || p?.baseStats || null;
      setFetchedInfo({ imageUrl: img?.url || "", shinyImageUrl: shinyUrl, primaryType: p?.primaryType || "", secondaryType: p?.secondaryType || "", baseStats });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [hasMember, member?.pokemonId, member?.imageUrl]);

  // 按需获取招式类型信息
  useEffect(() => {
    if (!hasMember) return;
    const moves = (member.moves || []).filter(Boolean);
    if (moves.length === 0 || member._movesInfo) return;
    if (!member.pokemonId) return;
    let cancelled = false;
    unifiedApi(`/pokemon/${encodeURIComponent(member.pokemonId)}`).then((r) => {
      if (cancelled) return;
      const pokemonId = r.data?.id;
      if (!pokemonId) return;
      return unifiedApi(`/pokemon/${pokemonId}/learnset/meta`).then((meta) => {
        if (cancelled) return;
        const gens = meta.data?.generations || [];
        const latestGen = gens.length > 0 ? gens[gens.length - 1] : 9;
        const formKeys = meta.data?.formKeys || [];
        const form = formKeys[0] || "default";
        return unifiedApi(`/pokemon/${pokemonId}/learnset?generation=${latestGen}&form=${form}`);
      });
    }).then(async (r) => {
      if (cancelled || !r) return;
      const entries = r.data || [];
      const moveMap = {};
      for (const entry of entries) {
        const name = entry.moveNameZh || entry.moveId;
        if (name && moves.includes(name)) {
          moveMap[name] = { type: entry.moveType || "", power: entry.movePower || "" };
        }
      }
      const missing = moves.filter((m) => !moveMap[m]);
      if (missing.length > 0) {
        const results = await Promise.all(
          missing.map((name) => unifiedApi(`/moves?q=${encodeURIComponent(name)}`).catch(() => null))
        );
        for (let i = 0; i < missing.length; i++) {
          if (cancelled) return;
          const data = results[i]?.data;
          if (data && data.length > 0) {
            const match = data.find((m) => m.nameZh === missing[i]) || data[0];
            moveMap[missing[i]] = { type: match.type || "", power: match.power || "" };
          }
        }
      }
      if (!cancelled) setFetchedMoves(moveMap);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [hasMember, member?.pokemonId, member?.moves, member?._movesInfo]);

  if (!hasMember) {
    return (
      <div className="te-slot te-slot-empty" onClick={() => onInlineEdit(slot)}>
        <div className="te-slot-empty-inner">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
          <span className="te-slot-empty-text">位置 {slot}</span>
          <CustomSelect
            className="te-slot-select"
            value=""
            placeholder="从盒子选择…"
            options={boxOptions}
            onChange={(val) => { if (val) onSelectFromBox(slot, val); }}
          />
        </div>
      </div>
    );
  }

  // 已填充的槽位 — 使用和盒子列表一样的 BoxCard 风格展示
  const resolveShinyUrl = (v) => (typeof v === "string" ? v : v?.url || "");
  const normalImageUrl = member.imageUrl || fetchedInfo?.imageUrl || "";
  const shinyUrl = resolveShinyUrl(member.shinyImageUrl) || resolveShinyUrl(fetchedInfo?.shinyImageUrl);
  const imageUrl = (member.isShiny && shinyUrl) ? shinyUrl : normalImageUrl;
  const types = [member.primaryType || fetchedInfo?.primaryType, member.secondaryType || fetchedInfo?.secondaryType].filter(Boolean);

  const movesWithType = (member.moves || []).filter(Boolean).map((moveName) => {
    const moveInfo = member._movesInfo?.[moveName];
    if (moveInfo) {
      // _movesInfo 格式: { type: "火", power: 90, category: "特殊" }
      return { name: moveName, type: moveInfo.type || "", power: moveInfo.power ? String(moveInfo.power) : "" };
    }
    const fetched = fetchedMoves[moveName];
    if (fetched) {
      return { name: moveName, type: fetched.type, power: fetched.power ? String(fetched.power) : "" };
    }
    return { name: moveName, type: "", power: "" };
  });

  return (
    <div className="box-card te-member-card">
      {/* 顶栏：宝可梦名称 + 配置名称 + 移除按钮 */}
      <div className="box-card-header">
        <div className="box-card-name">
          <strong>{member.nameZh || member.pokemonId || "未命名"}</strong>
          <span className="box-card-level">Lv.{member.level || 50}</span>
        </div>
        <span className="box-card-title">{member.configName || ""}</span>
        <div className="box-card-menu" ref={menuRef}>
          <button className="box-card-menu-btn" onClick={() => setMenuOpen(!menuOpen)} title="操作">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="2" r="1.4"/><circle cx="7" cy="7" r="1.4"/><circle cx="7" cy="12" r="1.4"/></svg>
          </button>
          {menuOpen && (
            <div className="box-card-dropdown">
              <button onClick={() => { onEditMember(slot, member); setMenuOpen(false); }}>编辑</button>
              <button className="danger-text" onClick={() => { onRemove(slot); setMenuOpen(false); }}>移除</button>
            </div>
          )}
        </div>
      </div>

      {/* 左右布局 — 和 BoxCard 一致 */}
      <div className="box-card-body">
        <div className="box-card-left">
          <div className="box-card-thumb">
            {imageUrl ? <img src={imageUrl} alt={member.nameZh || ""} referrerPolicy="no-referrer" /> : <span className="box-card-thumb-empty">?</span>}
            {member.itemImageUrl && (
              <img className="box-card-item-overlay" src={member.itemImageUrl} alt={member.itemId} title={member.itemId} referrerPolicy="no-referrer" />
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
          {/* 特性 + 性格 */}
          <div className="box-card-meta">
            {member.abilityId && <span className="box-card-tag">{member.abilityId}</span>}
            <span className="box-card-tag">{member.nature || "认真"}</span>
          </div>
        </div>

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
      {(member.baseStats || fetchedInfo?.baseStats) && (() => {
        const detail = { baseStats: member.baseStats || fetchedInfo?.baseStats };
        const stats = Object.fromEntries(
          STAT_KEYS.map((key) => [key, calculateFinalStat(member, detail, key)])
        );
        const isChampions = member.statMode === "champions";
        return (
          <div className="box-card-stats">
            <div className="box-card-stats-header">
              <span></span>
              <span>HP</span><span>攻击</span><span>防御</span><span>特攻</span><span>特防</span><span>速度</span>
            </div>
            {isChampions ? (
              <div className="box-card-stats-row">
                <span className="box-card-stats-tag box-card-stats-tag-sp">SP</span>
                {STAT_KEYS.map((k) => (
                  <span key={k} className="box-card-stats-num">{member.sps?.[k] || 0}</span>
                ))}
              </div>
            ) : (
              <>
                <div className="box-card-stats-row">
                  <span className="box-card-stats-tag box-card-stats-tag-iv">个体</span>
                  {STAT_KEYS.map((k) => (
                    <span key={k} className="box-card-stats-num">{member.ivs?.[k] ?? 31}</span>
                  ))}
                </div>
                <div className="box-card-stats-row">
                  <span className="box-card-stats-tag box-card-stats-tag-ev">努力</span>
                  {STAT_KEYS.map((k) => (
                    <span key={k} className="box-card-stats-num">{member.evs?.[k] || 0}</span>
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

// ══════════════════════════════════════════════
//  队伍卡片
// ══════════════════════════════════════════════

function TeamCard({ team, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const resolved = resolveTeamMembers(team);
  const [fetchedImages, setFetchedImages] = useState({});

  // 对于缺少 imageUrl 的成员，按需获取图片
  useEffect(() => {
    const missing = resolved.filter((m) => m.pokemonId && !m.imageUrl && !fetchedImages[m.pokemonId]);
    if (missing.length === 0) return;
    let cancelled = false;
    missing.forEach((m) => {
      unifiedApi(`/pokemon/${encodeURIComponent(m.pokemonId)}`).then((r) => {
        if (cancelled) return;
        const img = getPokemonPreviewImage(r.data);
        if (img?.url) {
          setFetchedImages((prev) => ({ ...prev, [m.pokemonId]: img.url }));
        }
      }).catch(() => {});
    });
    return () => { cancelled = true; };
  }, [resolved]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
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

// ══════════════════════════════════════════════
//  主页面
// ══════════════════════════════════════════════

export default function TeamsPage() {
  const toast = useToast();
const [boxConfigs, setBoxConfigs] = useState([]);
const [editingConfig, setEditingConfig] = useState(null);
const [isNewConfig, setIsNewConfig] = useState(false);

  const [teams, setTeams] = useState([]);
  const [editingTeam, setEditingTeam] = useState(null);
  const [isNewTeam, setIsNewTeam] = useState(false);
  const [inlineEditSlot, setInlineEditSlot] = useState(null);
  const [inlineEditDraft, setInlineEditDraft] = useState(null);
  const [inlineEditIsNew, setInlineEditIsNew] = useState(false); // true=新建空槽位, false=编辑已有成员
  const [inlinePickerSearch, setInlinePickerSearch] = useState("");
  const inlineEditorRef = useRef(null);

  const [activeTab, setActiveTab] = useState("box");
  const [pickerSearch, setPickerSearch] = useState("");

  const editorRef = useRef(null);
  const teamEditorRef = useRef(null);

  useEffect(() => {
    setBoxConfigs(getBox());
    setTeams(getTeams());
  }, []);

  // 新建/编辑时自动滚动到编辑区域
  useEffect(() => {
    if (editingConfig && editorRef.current) {
      setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  }, [editingConfig]);

  useEffect(() => {
    if (editingTeam && teamEditorRef.current) {
      setTimeout(() => teamEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  }, [editingTeam]);

  const refreshBox = useCallback(() => setBoxConfigs(getBox()), []);
  const refreshTeams = useCallback(() => setTeams(getTeams()), []);

  // ── 盒子操作 ──
  const handleNewConfig = useCallback(() => { setEditingConfig(createDraftMember()); setIsNewConfig(true); }, []);
  const handleEditConfig = useCallback((config) => { setEditingConfig({ ...config }); setIsNewConfig(false); }, []);
  const handleSaveConfig = useCallback(() => {
    if (!editingConfig?.pokemonId) { toast.error("请先选择一只宝可梦。"); return; }
    const configToSave = { ...editingConfig };
    // 如果没有填写配置名称，默认使用宝可梦名称
    const baseName = configToSave.configName?.trim() || configToSave.nameZh || configToSave.pokemonId || "未命名";
    // 检查盒子中是否已有同名配置（排除自身）
    const currentBox = getBox();
    const existingNames = currentBox
      .filter((c) => c.configId !== configToSave.configId)
      .map((c) => c.configName || c.nameZh || c.pokemonId || "");
    let finalName = baseName;
    if (existingNames.includes(finalName)) {
      let seq = 2;
      while (existingNames.includes(`${baseName} ${seq}`)) seq++;
      finalName = `${baseName} ${seq}`;
    }
    configToSave.configName = finalName;
    saveBoxConfig(configToSave); refreshBox(); setEditingConfig(null); setIsNewConfig(false);
  }, [editingConfig, refreshBox]);
  const handleDeleteConfig = useCallback((configId) => { if (!window.confirm("确定删除这个配置吗？")) return; deleteBoxConfig(configId); refreshBox(); }, [refreshBox]);
  const handleDuplicateConfig = useCallback((configId) => { duplicateBoxConfig(configId); refreshBox(); }, [refreshBox]);
  const handleCancelEdit = useCallback(() => { setEditingConfig(null); setIsNewConfig(false); }, []);
  const handleEditingConfigChange = useCallback((updater) => { setEditingConfig((prev) => (typeof updater === "function" ? updater(prev) : updater)); }, []);

  // ── 队伍操作 ──
  const handleNewTeam = useCallback(() => { setEditingTeam({ teamId: "", name: "", format: "singles", members: [] }); setIsNewTeam(true); setInlineEditSlot(null); setInlineEditDraft(null); }, []);
  const handleEditTeam = useCallback((team) => { setEditingTeam({ ...team, members: resolveTeamMembers(team) }); setIsNewTeam(false); setInlineEditSlot(null); setInlineEditDraft(null); }, []);
  const handleSaveTeam = useCallback(() => {
    if (!editingTeam) return;
    if (!editingTeam.name?.trim()) { toast.error("请输入队伍名称。"); return; }
    const validMembers = (editingTeam.members || []).filter((m) => m && m.pokemonId);
    if (validMembers.length === 0) { toast.error("请至少添加一只宝可梦。"); return; }
    const membersToSave = validMembers.map((m, i) => {
      if (m.configId) return { slot: i + 1, configId: m.configId };
      return {
        slot: i + 1, pokemonId: m.pokemonId, nameZh: m.nameZh, level: Number(m.level || 50),
        itemId: m.itemId || "", itemImageUrl: m.itemImageUrl || "",
        abilityId: m.abilityId || "", nature: m.nature || "认真",
        moves: (m.moves || []).filter(Boolean), _movesInfo: m._movesInfo || undefined,
        ivs: { ...createDefaultStats("iv"), ...(m.ivs || {}) },
        evs: { ...createDefaultStats("ev"), ...(m.evs || {}) },
        statMode: m.statMode || "classic", sps: m.sps || {}, champNature: m.champNature || m.nature || "认真",
        imageUrl: m.imageUrl || "", shinyImageUrl: m.shinyImageUrl || "", isShiny: m.isShiny || false,
        primaryType: m.primaryType || "", secondaryType: m.secondaryType || "",
        baseStats: m.baseStats || null,
      };
    });
    saveTeam({ ...editingTeam, members: membersToSave }); refreshTeams(); setEditingTeam(null); setIsNewTeam(false); setInlineEditSlot(null); setInlineEditDraft(null);
  }, [editingTeam, refreshTeams]);
  const handleDeleteTeam = useCallback((teamId) => { if (!window.confirm("确定删除这支队伍吗？")) return; deleteTeam(teamId); refreshTeams(); }, [refreshTeams]);
  const handleCancelTeamEdit = useCallback(() => { setEditingTeam(null); setIsNewTeam(false); setInlineEditSlot(null); setInlineEditDraft(null); }, []);
  const handleSelectFromBox = useCallback((slot, configId) => {
    if (!editingTeam) return;
    const config = boxConfigs.find((c) => c.configId === configId);
    if (!config) return;
    const members = [...(editingTeam.members || [])];
    // 检查是否已存在相同宝可梦（排除当前槽位）
    const duplicate = members.find((m) => m.slot !== slot && m.pokemonId === config.pokemonId);
    if (duplicate) {
      toast.error(`队伍中已存在「${config.nameZh || config.pokemonId}」，不能重复添加同一宝可梦。`);
      return;
    }
    const idx = members.findIndex((m) => m.slot === slot);
    const newMember = { ...config, slot, configId };
    if (idx >= 0) members[idx] = newMember; else members.push(newMember);
    setEditingTeam({ ...editingTeam, members });
  }, [editingTeam, boxConfigs]);
  const handleRemoveMember = useCallback((slot) => {
    if (!editingTeam) return;
    const remaining = (editingTeam.members || []).filter((m) => m.slot !== slot);
    // 重新排列 slot 编号，保持紧凑
    const reindexed = remaining.sort((a, b) => (a.slot || 0) - (b.slot || 0)).map((m, i) => ({ ...m, slot: i + 1 }));
    setEditingTeam({ ...editingTeam, members: reindexed });
  }, [editingTeam]);
  const handleStartInlineEdit = useCallback((slot) => { setInlineEditSlot(slot); setInlineEditDraft(createDraftMember()); setInlineEditIsNew(true); setInlinePickerSearch(""); }, []);
  const handleEditMember = useCallback((slot, member) => { setInlineEditSlot(slot); setInlineEditDraft({ ...member }); setInlineEditIsNew(false); setInlinePickerSearch(""); }, []);
  const handleInlineEditDraftChange = useCallback((updater) => { setInlineEditDraft((prev) => (typeof updater === "function" ? updater(prev) : updater)); }, []);
  const handleConfirmInlineEdit = useCallback(() => {
    if (!editingTeam || !inlineEditDraft?.pokemonId) { toast.error("请先选择一只宝可梦。"); return; }
    const members = [...(editingTeam.members || [])];
    // 检查是否已存在相同宝可梦（排除当前槽位）
    const duplicate = members.find((m) => m.slot !== inlineEditSlot && m.pokemonId === inlineEditDraft.pokemonId);
    if (duplicate) {
      toast.error(`队伍中已存在「${inlineEditDraft.nameZh || inlineEditDraft.pokemonId}」，不能重复添加同一宝可梦。`);
      return;
    }
    const newMember = { ...inlineEditDraft, slot: inlineEditSlot };
    const idx = members.findIndex((m) => m.slot === inlineEditSlot);
    if (idx >= 0) members[idx] = newMember; else members.push(newMember);
    setEditingTeam({ ...editingTeam, members }); setInlineEditSlot(null); setInlineEditDraft(null); setInlineEditIsNew(false);
  }, [editingTeam, inlineEditSlot, inlineEditDraft]);
  const handleCancelInlineEdit = useCallback(() => { setInlineEditSlot(null); setInlineEditDraft(null); setInlineEditIsNew(false); setInlinePickerSearch(""); }, []);

  // 打开内联编辑器时自动滚动到编辑卡片位置
  useEffect(() => {
    if (inlineEditSlot && inlineEditorRef.current) {
      setTimeout(() => {
        inlineEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }, [inlineEditSlot]);

  // 渐进式槽位：按顺序紧凑排列已有成员 + 1个空位（最多6个）
  const teamSlots = useMemo(() => {
    if (!editingTeam) return [];
    const members = editingTeam.members || [];
    // 按 slot 排序后紧凑排列
    const sorted = [...members].sort((a, b) => (a.slot || 0) - (b.slot || 0));
    const result = sorted.map((m, i) => ({ ...m, slot: i + 1 }));
    // 如果还没满6个，追加一个空位
    if (result.length < 6) {
      result.push(null);
    }
    return result;
  }, [editingTeam]);

  return (
    <section className="view-grid">
      {/* 主面板 */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">队伍构筑</h2>
            <p className="panel-subtitle">在盒子中配置宝可梦，然后组建你的对战队伍。</p>
          </div>
          <span className="chip">{boxConfigs.length} 个配置 · {teams.length} 支队伍</span>
        </div>

        <div className="team-builder">
          {/* Tab 切换 */}
          <div className="teams-tabs">
            <button
              className={`teams-tab${activeTab === "box" ? " teams-tab-active" : ""}`}
              onClick={() => setActiveTab("box")}
            >
              宝可梦盒子
              <span className="tab-count">{boxConfigs.length}</span>
            </button>
            <button
              className={`teams-tab${activeTab === "teams" ? " teams-tab-active" : ""}`}
              onClick={() => setActiveTab("teams")}
            >
              我的队伍
              <span className="tab-count">{teams.length}</span>
            </button>
          </div>

          {/* ── 盒子 Tab ── */}
          {activeTab === "box" && (
            <>
              {/* 编辑模式：内联展示 */}
              {editingConfig ? (
                <div className="cfg-inline-wrap" ref={editorRef}>
                  {/* 顶部栏：标题 + 搜索/宝可梦名 + 配置名称 + 取消 */}
                  <div className="cfg-toolbar">
                    <strong>{isNewConfig ? "新建配置" : "编辑配置"}</strong>
                    {!editingConfig.pokemonId ? (
                      <div className="cfg-toolbar-search">
                        <svg className="cfg-toolbar-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" />
                        </svg>
                        <input
                          className="cfg-toolbar-search-input"
                          placeholder="搜索宝可梦名称 / 编号…"
                          value={pickerSearch}
                          onChange={(e) => setPickerSearch(e.target.value)}
                          autoFocus
                        />
                        {pickerSearch && (
                          <button className="cfg-toolbar-search-clear" onClick={() => setPickerSearch("")}>✕</button>
                        )}
                      </div>
                    ) : (
                      <div className="cfg-toolbar-pokemon">
                        <span className="cfg-toolbar-pokemon-name">{editingConfig.nameZh || editingConfig.pokemonId}</span>
                        <button className="cfg-toolbar-pokemon-change" onClick={() => { handleEditingConfigChange({ ...editingConfig, pokemonId: "", nameZh: "" }); setPickerSearch(""); }}>更换</button>
                      </div>
                    )}
                    <input
                      className="cfg-toolbar-name"
                      value={editingConfig.configName || ""}
                      onChange={(e) => handleEditingConfigChange({ ...editingConfig, configName: e.target.value })}
                      placeholder="配置名称"
                    />
                    <button className="cfg-toolbar-cancel" onClick={handleCancelEdit}>取消</button>
                  </div>

                  {/* 未选择宝可梦时：展示宝可梦搜索列表 */}
                  {!editingConfig.pokemonId ? (
                    <PokemonPickerList
                      search={pickerSearch}
                      onSelect={(p) => {
                        const img = getPokemonPreviewImage(p);
                        handleEditingConfigChange({
                          ...editingConfig,
                          pokemonId: p.slug || String(p.id),
                          nameZh: p.nameZh || "",
                          primaryType: p.primaryType || "",
                          secondaryType: p.secondaryType || "",
                          imageUrl: img?.url || "",
                        });
                        setPickerSearch("");
                      }}
                    />
                  ) : (
                    <PokemonEditor
                      config={editingConfig}
                      onChange={handleEditingConfigChange}
                      onSave={handleSaveConfig}
                      onCancel={handleCancelEdit}
                      saveLabel={isNewConfig ? "添加到盒子" : "保存修改"}
                    />
                  )}
                </div>
              ) : (
                <button className="cfg-new-btn" onClick={handleNewConfig}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
                  <span>新建配置</span>
                </button>
              )}

              {boxConfigs.length > 0 ? (
                <div className="te-card-grid">
                  {boxConfigs.map((config) => (
                    <BoxCard
                      key={config.configId}
                      config={config}
                      onEdit={handleEditConfig}
                      onDelete={handleDeleteConfig}
                      onDuplicate={handleDuplicateConfig}
                    />
                  ))}
                </div>
              ) : (
                !editingConfig && (
                  <div className="detail-empty" style={{ textAlign: "center", padding: "40px 0" }}>
                    <p>盒子里还没有宝可梦配置。</p>
                    <p>点击「新建配置」来添加你的第一只宝可梦。</p>
                  </div>
                )
              )}
            </>
          )}

          {/* ── 队伍 Tab ── */}
          {activeTab === "teams" && (
            <>
              {editingTeam ? (
                <div className="cfg-inline-wrap" ref={teamEditorRef}>
                  <div className="cfg-toolbar">
                    <strong>{isNewTeam ? "新建队伍" : "编辑队伍"}</strong>
                    <div className="team-edit-fields">
                      <input
                        className="team-edit-name"
                        value={editingTeam.name || ""}
                        onChange={(e) => setEditingTeam({ ...editingTeam, name: e.target.value })}
                        placeholder="队伍名称"
                      />
                      <CustomSelect
                        className="team-edit-format"
                        value={editingTeam.format || "singles"}
                        options={[{ value: "singles", label: "单打" }, { value: "doubles", label: "双打" }]}
                        onChange={(val) => setEditingTeam({ ...editingTeam, format: val })}
                      />
                    </div>
                    <button className="cfg-toolbar-cancel" onClick={handleCancelTeamEdit}>取消</button>
                  </div>

                  {/* 内联编辑器在 grid 上方展示（和盒子编辑一致） */}
                  {inlineEditSlot && inlineEditDraft && (
                    <div className="cfg-inline-wrap te-slot-inline-standalone" ref={inlineEditorRef}>
                      <div className="cfg-toolbar">
                        <strong>位置 {inlineEditSlot} — {inlineEditIsNew ? "手动添加" : "编辑配置"}</strong>
                        {!inlineEditDraft.pokemonId ? (
                          <div className="cfg-toolbar-search">
                            <svg className="cfg-toolbar-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" />
                            </svg>
                            <input
                              className="cfg-toolbar-search-input"
                              placeholder="搜索宝可梦名称 / 编号…"
                              value={inlinePickerSearch}
                              onChange={(e) => setInlinePickerSearch(e.target.value)}
                              autoFocus
                            />
                            {inlinePickerSearch && (
                              <button className="cfg-toolbar-search-clear" onClick={() => setInlinePickerSearch("")}>✕</button>
                            )}
                          </div>
                        ) : (
                          <div className="cfg-toolbar-pokemon">
                            <span className="cfg-toolbar-pokemon-name">{inlineEditDraft.nameZh || inlineEditDraft.pokemonId}</span>
                            <button className="cfg-toolbar-pokemon-change" onClick={() => { handleInlineEditDraftChange({ ...inlineEditDraft, pokemonId: "", nameZh: "" }); setInlinePickerSearch(""); }}>更换</button>
                          </div>
                        )}
                        <input
                          className="cfg-toolbar-name"
                          value={inlineEditDraft.configName || ""}
                          onChange={(e) => handleInlineEditDraftChange({ ...inlineEditDraft, configName: e.target.value })}
                          placeholder="配置名称"
                        />
                        <button className="cfg-toolbar-cancel" onClick={handleCancelInlineEdit}>取消</button>
                      </div>

                      {/* 未选择宝可梦时：展示宝可梦搜索列表 */}
                      {!inlineEditDraft.pokemonId ? (
                        <PokemonPickerList
                          search={inlinePickerSearch}
                          onSelect={(p) => {
                            const img = getPokemonPreviewImage(p);
                            handleInlineEditDraftChange({
                              ...inlineEditDraft,
                              pokemonId: p.slug || String(p.id),
                              nameZh: p.nameZh || "",
                              primaryType: p.primaryType || "",
                              secondaryType: p.secondaryType || "",
                              imageUrl: img?.url || "",
                            });
                            setInlinePickerSearch("");
                          }}
                        />
                      ) : (
                        <PokemonEditor
                          config={inlineEditDraft}
                          onChange={handleInlineEditDraftChange}
                          onSave={handleConfirmInlineEdit}
                          onCancel={handleCancelInlineEdit}
                          saveLabel={inlineEditIsNew ? "确认添加" : "保存修改"}
                        />
                      )}
                    </div>
                  )}

                  <div className="team-slot-grid">
                    {teamSlots.map((member, i) => {
                      const slot = i + 1;
                      // 新建空槽位时隐藏该槽位；编辑已有成员时保留卡片展示
                      if (inlineEditSlot === slot && inlineEditDraft && inlineEditIsNew) return null;
                      return (
                        <TeamSlot
                          key={slot}
                          slot={slot}
                          member={member}
                          boxConfigs={boxConfigs}
                          onSelectFromBox={handleSelectFromBox}
                          onRemove={handleRemoveMember}
                          onInlineEdit={handleStartInlineEdit}
                          onEditMember={handleEditMember}
                        />
                      );
                    })}
                  </div>

                  <div className="cfg-actions">
                    <button onClick={handleSaveTeam}>{isNewTeam ? "创建队伍" : "保存队伍"}</button>
                    <button className="secondary" onClick={handleCancelTeamEdit}>取消</button>
                  </div>
                </div>
              ) : (
                <button className="cfg-new-btn" onClick={handleNewTeam}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
                  <span>新建队伍</span>
                </button>
              )}

{!editingTeam && (
                teams.length > 0 ? (
                <div className="te-card-grid te-team-grid">
                  {teams.map((team) => (
                    <TeamCard
                        key={team.teamId}
                        team={team}
                        onEdit={handleEditTeam}
                        onDelete={handleDeleteTeam}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="detail-empty" style={{ textAlign: "center", padding: "40px 0" }}>
                    <p>还没有创建队伍。</p>
                    <p>先在「宝可梦盒子」中配置好宝可梦，然后在这里组建队伍。</p>
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
