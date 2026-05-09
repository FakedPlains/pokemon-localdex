import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { unifiedApi } from "../utils/api.js";
import { STAT_KEYS } from "../utils/constants.js";
import { createDefaultStats, getPokemonPreviewImage, calculateFinalStat } from "../utils/helpers.js";
import StatCalculator from "./StatCalculator.jsx";

/**
 * 宝可梦配置编辑器
 *
 * 用于新建和编辑宝可梦配置，包含：
 * - 图片预览（普通/闪光）
 * - 形态切换
 * - 属性展示
 * - 特性选择
 * - 道具选择（支持搜索、分页）
 * - 招式选择（支持搜索）
 * - 能力值分配（经典/冠军模式）
 *
 * Props:
 *   config    - 当前配置对象
 *   onChange  - 配置变更回调
 *   onSave    - 保存回调
 *   onCancel  - 取消回调（可选）
 *   saveLabel - 保存按钮文案（默认 "保存配置"）
 */
export default function PokemonEditor({ config, onChange, onSave, onCancel, saveLabel }) {
  const [pokemonDetail, setPokemonDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isShiny, setIsShiny] = useState(config.isShiny || false);
  const [configName, setConfigName] = useState(config.configName || "");
  const [selectedFormKey, setSelectedFormKey] = useState(config.formKey || null); // 当前选中的形态 key
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
    unifiedApi(`/pokemon/${pokemonId}`).then((r) => {
      if (!cancelled) {
        setPokemonDetail(r.data);
        setDetailLoading(false);
        // 如果 config 中已有 formKey，使用它；否则默认选中第一个形态
        const forms = r.data?.forms || [];
        const initialFormKey = config.formKey || (forms[0]?.formKey ?? "default");
        setSelectedFormKey(initialFormKey);
        // 根据选中的形态保存闪光图片 URL 和 baseStats 到 config
        const selectedForm = forms.find((f) => f.formKey === initialFormKey) || forms[0];
        const imgs = selectedForm?.images || r.data?.images;
        const shinyObj = imgs?.shiny || imgs?.shinyOfficial || imgs?.shinySprite;
        const shinyUrl = shinyObj?.url || (typeof shinyObj === "string" ? shinyObj : "");
        const detailBaseStats = selectedForm?.baseStats || r.data?.baseStats;
        const updates = {};
        // 补全 formId（从盒子导入时可能只有 formKey 没有 formId）
        if (!config.formId && selectedForm?.id) updates.formId = selectedForm.id;
        if (shinyUrl && !config.shinyImageUrl) updates.shinyImageUrl = shinyUrl;
        if (detailBaseStats && !config.baseStats) updates.baseStats = detailBaseStats;
        // 默认选中第一个特性
        if (!config.abilityId) {
          const formAbilities = selectedForm?.abilities || [];
          const normalAbilities = formAbilities.filter((ab) => !ab.isHidden);
          const firstAbility = normalAbilities[0] || formAbilities[0];
          if (firstAbility) {
            updates.abilityId = firstAbility.abilityId ? String(firstAbility.abilityId) : "";
            updates.abilityName = firstAbility.nameZh || "";
          } else {
            const topAbilities = r.data?.abilities || [];
            if (topAbilities.length > 0) {
              updates.abilityId = "";
              updates.abilityName = topAbilities[0];
            }
          }
        }
        if (Object.keys(updates).length > 0) {
          onChange((prev) => ({ ...prev, ...updates }));
        }
      }
    }).catch(() => {
      if (!cancelled) { setPokemonDetail(null); setDetailLoading(false); }
    });
    return () => { cancelled = true; };
  }, [pokemonId]);

  /* ── 当前选中的形态 ── */
  const currentForm = useMemo(() => {
    if (!pokemonDetail) return null;
    const forms = pokemonDetail.forms || [];
    if (forms.length === 0) return null;
    return forms.find((f) => f.formKey === selectedFormKey) || forms[0];
  }, [pokemonDetail, selectedFormKey]);

  /* ── 形态列表（用于选择器，过滤掉超极巨化形态） ── */
  const formOptions = useMemo(() => {
    if (!pokemonDetail) return [];
    const forms = pokemonDetail.forms || [];
    return forms
      .filter((f) => f.formType !== "gmax" && !/超极巨化/.test(f.nameZh || ""))
      .map((f) => ({
        value: f.formKey,
        label: f.nameZh || f.formKey || "默认形态",
        formType: f.formType || "default",
      }));
  }, [pokemonDetail]);

  /* ── 切换形态时更新 config ── */
  const handleFormChange = useCallback((formKey) => {
    setSelectedFormKey(formKey);
    if (!pokemonDetail) return;
    const forms = pokemonDetail.forms || [];
    const form = forms.find((f) => f.formKey === formKey) || forms[0];
    if (!form) return;
    // 更新 config 中的形态相关信息
    const imgs = form.images || pokemonDetail.images;
    const officialImg = imgs?.official || imgs?.sprite;
    const shinyObj = imgs?.shiny || imgs?.shinyOfficial || imgs?.shinySprite;
    const shinyUrl = shinyObj?.url || (typeof shinyObj === "string" ? shinyObj : "");
    // 切换形态时默认选中第一个特性
    const formAbilities = form.abilities || [];
    const normalAbilities = formAbilities.filter((ab) => !ab.isHidden);
    const firstAbility = normalAbilities[0] || formAbilities[0];
    const defaultAbilityId = firstAbility
      ? (firstAbility.abilityId ? String(firstAbility.abilityId) : "")
      : "";
    const defaultAbilityName = firstAbility
      ? (firstAbility.nameZh || "")
      : (pokemonDetail.abilities?.[0] || "");
    const updates = {
      formId: form.id || "",
      formKey,
      formName: form.nameZh || form.formKey || "",
      primaryType: form.primaryType || pokemonDetail.primaryType || "",
      secondaryType: form.secondaryType || pokemonDetail.secondaryType || "",
      baseStats: form.baseStats || pokemonDetail.baseStats || null,
      imageUrl: officialImg?.url || "",
      shinyImageUrl: shinyUrl,
      abilityId: defaultAbilityId,
      abilityName: defaultAbilityName,
    };
    // 形态绑定道具：自动设置/清除道具
    if (form.requiredItem) {
      updates.itemId = form.requiredItem.id ? String(form.requiredItem.id) : (form.requiredItem.slug || "");
      updates.itemName = form.requiredItem.nameZh || "";
      updates.itemImageUrl = form.requiredItem.imageUrl || "";
    } else {
      // 切换到无绑定道具的形态时，如果之前的道具是被形态锁定的，则清除
      const prevForm = forms.find((f) => f.formKey === config.formKey);
      if (prevForm?.requiredItem) {
        updates.itemId = "";
        updates.itemImageUrl = "";
      }
    }
    onChange((prev) => ({ ...prev, ...updates }));
  }, [pokemonDetail, onChange, config.formKey]);

  /* ── 特性列表（分普通 / 隐藏），返回 {id, name} 对象数组 ── */
  const abilityGroups = useMemo(() => {
    if (!pokemonDetail) return { normal: [], hidden: [] };
    const abilities = currentForm?.abilities || [];
    if (abilities.length > 0) {
      return {
        normal: abilities.filter((ab) => !ab.isHidden).map((ab) => ({ id: ab.abilityId || "", name: ab.nameZh || ab.abilityId || "" })),
        hidden: abilities.filter((ab) => ab.isHidden).map((ab) => ({ id: ab.abilityId || "", name: ab.nameZh || ab.abilityId || "" })),
      };
    }
    const topAbilities = (pokemonDetail.abilities || []).map((a) => ({ id: "", name: a }));
    const hiddenAbility = pokemonDetail.hiddenAbility ? [{ id: "", name: pokemonDetail.hiddenAbility }] : [];
    return {
      normal: topAbilities,
      hidden: hiddenAbility,
    };
  }, [pokemonDetail, currentForm]);

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
      value: String(item.id),
      label: item.nameZh || item.slug || String(item.id),
      sublabel: item.effectSummary || "",
      imageUrl: item.imageUrl || "",
      nameZh: item.nameZh || "",
    }));
  }, [items]);

  /* ── 图片（普通 / 闪光） ── */
  const detailImages = currentForm?.images || pokemonDetail?.images;
  const previewImage = useMemo(() => {
    if (isShiny) {
      const shiny = detailImages?.shiny || detailImages?.shinyOfficial || detailImages?.shinySprite;
      if (shiny) return shiny;
    }
    if (currentForm?.images?.official) return currentForm.images.official;
    if (pokemonDetail) return getPokemonPreviewImage(pokemonDetail);
    return null;
  }, [pokemonDetail, currentForm, detailImages, isShiny]);

  const baseStats = useMemo(() => {
    if (!pokemonDetail) return null;
    return currentForm?.baseStats || pokemonDetail.baseStats || null;
  }, [pokemonDetail, currentForm]);

  /* ── 属性 ── */
  const types = useMemo(() => {
    if (!pokemonDetail) return [];
    const src = currentForm || pokemonDetail;
    const arr = [];
    if (src.primaryType) arr.push(src.primaryType);
    if (src.secondaryType) arr.push(src.secondaryType);
    if (arr.length > 0) return arr;
    return pokemonDetail.types || [];
  }, [pokemonDetail, currentForm]);

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
        value: String(item.id),
        label: item.nameZh || item.slug || String(item.id),
        sublabel: item.effectSummary || "",
        imageUrl: item.imageUrl || "",
        nameZh: item.nameZh || "",
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

  // 当前形态是否绑定了道具（锁定道具选择）
  const isItemLocked = Boolean(currentForm?.requiredItem);

  const openPanel = (panel) => {
    if (panel === "item" && isItemLocked) return; // 道具被形态锁定时不允许打开面板
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

  /* ── 形态滑块 Portal（渲染到 toolbar 中） ── */
  const [portalTarget, setPortalTarget] = useState(null);
  useEffect(() => {
    const el = document.getElementById("cfg-form-slider-portal");
    setPortalTarget(el);
  }, [pokemonId]);

  const formSliderPortal = (formOptions.length > 1 && portalTarget)
    ? createPortal(
        <span className="cfg-form-slider-inline">
          {formOptions.map((opt) => (
            <button
              key={opt.value}
              className={`cfg-form-slider-item${selectedFormKey === opt.value ? " cfg-form-slider-active" : ""}`}
              onClick={() => handleFormChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </span>,
        portalTarget
      )
    : null;

  return (
    <div className="cfg-editor">
      {formSliderPortal}
      {/* ══ 上方：三等分配置区 ══ */}
      <div className="cfg-top">
        {/* 第一栏：图片 + 属性 + 特性 + 道具 */}
        <div className="cfg-col cfg-col-first">
          <div className="cfg-first-inner">
            <div className="cfg-first-img">
              <div className="cfg-preview-img">
                {previewImage?.url
                  ? <img src={previewImage.url} alt={config.nameZh || ""} referrerPolicy="no-referrer" />
                  : <span className="cfg-preview-empty">{pokemonId ? "…" : "?"}</span>}
                {config.itemImageUrl && (
                  <img className="cfg-item-overlay" src={config.itemImageUrl} alt={config.itemName || config.itemId || ""} referrerPolicy="no-referrer" />
                )}
                <span
                  className={`cfg-shiny-badge${isShiny ? " cfg-shiny-badge-active" : ""}`}
                  onClick={() => { const next = !isShiny; setIsShiny(next); onChange({ ...config, isShiny: next }); }}
                  title={isShiny ? "切换为普通" : "切换为闪光"}
                >✨</span>
              </div>
              <div className="cfg-types">
                {types.map((t) => (
                  <span key={t} className={`type-chip type-${t}`}>
                    <img className="type-chip-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${t}@sm.png`} alt="" />
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="cfg-first-meta">
              <div className="cfg-section-label">特性</div>
              <div className="cfg-ability-tabs">
                {abilityGroups.normal.map((ab) => (
                  <button
                    key={ab.name}
                    className={`te-ability-tab${(config.abilityName || config.abilityId) === ab.name || config.abilityId === String(ab.id) ? " te-ability-tab-active" : ""}`}
                    onClick={() => onChange((prev) => ({ ...prev, abilityId: ab.id ? String(ab.id) : "", abilityName: ab.name }))}
                  >{ab.name}</button>
                ))}
                {abilityGroups.hidden.map((ab) => (
                  <button
                    key={ab.name}
                    className={`te-ability-tab te-ability-tab-hidden${(config.abilityName || config.abilityId) === ab.name || config.abilityId === String(ab.id) ? " te-ability-tab-active" : ""}`}
                    onClick={() => onChange((prev) => ({ ...prev, abilityId: ab.id ? String(ab.id) : "", abilityName: ab.name }))}
                    title="隐藏特性"
                  >{ab.name}<span className="te-ha-badge">HA</span></button>
                ))}
                {allAbilities.length === 0 && (
                  <span className="muted" style={{ fontSize: 12 }}>{detailLoading ? "加载中…" : "暂无"}</span>
                )}
              </div>
              <div className="cfg-section-label">道具{isItemLocked && <span className="cfg-section-lock-badge">🔒 形态绑定</span>}</div>
              {isItemLocked ? (
                <div className="cfg-slot-btn cfg-slot-locked" title="该形态必须携带此道具">
                  <span className="cfg-item-selected">
                    {config.itemImageUrl && <img className="cfg-item-selected-img" src={config.itemImageUrl} alt="" referrerPolicy="no-referrer" />}
                    <span>{currentForm?.requiredItem?.nameZh || config.itemName || config.itemId}</span>
                  </span>
                </div>
              ) : activePanel === "item" ? (
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
                      <span>{config.itemName || config.itemId}</span>
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
                  onClick={() => { const draft = { ...config, itemId: opt.value, itemName: opt.nameZh || opt.label, itemImageUrl: opt.imageUrl }; onChange(draft); setActivePanel(null); setPanelSearch(""); }}
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
