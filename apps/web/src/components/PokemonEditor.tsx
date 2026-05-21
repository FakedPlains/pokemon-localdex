import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { api } from "../utils/api";
import type { DataResponse } from "../utils/apiTypes";
import { useScrollPagination } from "../hooks/useScrollPagination";
import { STAT_KEYS } from "@pokemon-localdex/store-types/constants";
import type { StatBlock, PokemonEntry, PokemonFormEntry, ItemEntry, LearnsetMeta, LearnsetRecord } from "@pokemon-localdex/store-types";
import type { PokemonConfig, PokemonConfigDraft } from "../utils/teamStorage";
import { createDefaultStats, getPokemonPreviewImage, calculateFinalStat } from "../utils/helpers";
import StatCalculator from "./StatCalculator";
import type { StatCalculatorInitialValues, StatCalculatorChangePayload } from "./StatCalculator";

type ActivePanel = "item" | "move-0" | "move-1" | "move-2" | "move-3" | "stats" | null;

interface MoveOption {
  value: string;
  label: string;
  moveId?: number | null;
  moveType: string;
  moveCategory: string;
  movePower: number | null;
  moveAccuracy: number | null;
  movePP: number | null;
  moveDescription: string;
}

interface ItemOption {
  value: string;
  label: string;
  sublabel: string;
  imageUrl: string;
  nameZh: string;
}

export interface PokemonEditorProps {
  config: PokemonConfigDraft;
  onChange: (updater: PokemonConfigDraft | ((prev: PokemonConfigDraft) => PokemonConfigDraft)) => void;
  onSave: () => void;
  onCancel?: () => void;
  saveLabel?: string;
}

/**
 * 宝可梦配置编辑器
 */
/** 将 ItemEntry 映射为面板用的 ItemOption */
const mapItemToOption = (item: ItemEntry): ItemOption | null => {
  const id = String(item.id);
  if (!id) return null;
  return {
    value: id,
    label: item.nameZh || item.slug || id,
    sublabel: item.effectSummary || "",
    imageUrl: item.imageUrl || "",
    nameZh: item.nameZh || "",
  };
};

/** 将 LearnsetRecord 映射为面板用的 MoveOption */
const mapLearnsetToMoveOption = (entry: LearnsetRecord): MoveOption | null => {
  const name = entry.moveNameZh || String(entry.moveId || "");
  if (!name) return null;
  return {
    value: name,
    label: name,
    moveId: entry.moveId ?? null,
    moveType: entry.moveType || "",
    moveCategory: entry.moveCategory || "",
    movePower: entry.movePower ?? null,
    moveAccuracy: entry.moveAccuracy ?? null,
    movePP: entry.movePP ?? null,
    moveDescription: entry.moveDescription || "",
  };
};

/** MoveOption 去重 key */
const moveDedupe = (m: MoveOption): string => m.value;

export default function PokemonEditor({ config, onChange, onSave, onCancel, saveLabel }: PokemonEditorProps) {
  const [pokemonDetail, setPokemonDetail] = useState<PokemonEntry | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isShiny, setIsShiny] = useState(config.isShiny || false);
  const [selectedFormKey, setSelectedFormKey] = useState<string | null>(config.formKey || null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [panelSearch, setPanelSearch] = useState("");
  const itemListRef = useRef<HTMLDivElement>(null);
  const moveListRef = useRef<HTMLDivElement>(null);
  const pokemonId = config.pokemonId;

  // ── 道具分页（列表 + 搜索共用一个 hook，通过 reset 切换路径） ──
  const itemsPagination = useScrollPagination<ItemEntry, ItemOption>("/items", {
    pageSize: 50,
    mapItem: mapItemToOption,
  });
  const itemsInitRef = useRef(false);
  // 追踪上次搜索值，避免面板初次打开时空搜索 effect 发起重复请求
  const prevItemSearchRef = useRef("");

  // 面板打开时加载首页道具
  useEffect(() => {
    if (activePanel === "item" && !itemsInitRef.current) {
      itemsInitRef.current = true;
      prevItemSearchRef.current = "";
      itemsPagination.reset("/items");
    }
  }, [activePanel]); // eslint-disable-line react-hooks/exhaustive-deps

  // 道具搜索（防抖，切换路径）
  useEffect(() => {
    if (activePanel !== "item") return;
    const trimmed = panelSearch.trim();
    if (!trimmed) {
      // 只有从非空搜索切回空时才恢复全量列表，避免与初始化 reset 重复
      if (prevItemSearchRef.current) {
        prevItemSearchRef.current = "";
        itemsPagination.reset("/items");
      }
      return;
    }
    const timer = setTimeout(() => {
      prevItemSearchRef.current = trimmed;
      itemsPagination.reset(`/items?q=${encodeURIComponent(trimmed)}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [panelSearch, activePanel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 招式分页（列表 + 搜索共用一个 hook，通过 reset 切换路径） ──
  const movesPagination = useScrollPagination<LearnsetRecord, MoveOption>(null, {
    pageSize: 50,
    extractItems: (data: unknown) => {
      const d = data as { moves?: unknown[] };
      return Array.isArray(d?.moves) ? d.moves as LearnsetRecord[] : [];
    },
    mapItem: mapLearnsetToMoveOption,
    dedupeKey: moveDedupe,
    // 服务端可能 fallback 形态（如超极巨化 -> default），首页返回实际 formKey
    // 后续追加分页需要使用 fallback 后的 formKey，否则查不到数据
    // onFirstPage 接收 (responseData, currentPath)，返回修正后的路径
    onFirstPage: (responseData: unknown, currentPath: string): string | undefined => {
      const d = responseData as { formKey?: string } | null;
      if (!d?.formKey) return undefined;
      const corrected = currentPath.replace(
        /([?&])form=[^&]*/,
        `$1form=${encodeURIComponent(d.formKey)}`,
      );
      return corrected !== currentPath ? corrected : undefined;
    },
  });
  // learnset 基础路径（pokemonDetail 变化时从 meta 推算世代，形态变化时更新路径）
  const [learnsetBasePath, setLearnsetBasePath] = useState<string | null>(null);
  const movesInitRef = useRef(false);
  const prevMoveSearchRef = useRef("");
  // 缓存 meta 中的最新世代，避免切换形态时重复请求 meta
  const learnsetGenRef = useRef<number | null>(null);

  // pokemonDetail 变化时请求 meta 获取世代信息
  useEffect(() => {
    if (!pokemonDetail) {
      learnsetGenRef.current = null;
      setLearnsetBasePath(null);
      movesInitRef.current = false;
      prevMoveSearchRef.current = "";
      return;
    }
    let cancelled = false;
    learnsetGenRef.current = null;
    setLearnsetBasePath(null);
    movesInitRef.current = false;
    prevMoveSearchRef.current = "";
    api<DataResponse<LearnsetMeta>>(`/pokemon/${pokemonDetail.id}/learnset/meta`).then((meta) => {
      if (cancelled) return;
      const gens = meta.data?.generations || [];
      const latestGen = (gens.length > 0 ? gens[gens.length - 1] : 9) ?? 9;
      learnsetGenRef.current = latestGen;
      const form = selectedFormKey || "default";
      setLearnsetBasePath(`/pokemon/${pokemonDetail.id}/learnset?generation=${latestGen}&form=${encodeURIComponent(form)}`);
    }).catch(() => { if (!cancelled) setLearnsetBasePath(null); });
    return () => { cancelled = true; };
  }, [pokemonDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  // 形态切换时更新 learnset 路径（不重新请求 meta）
  // 服务端会在该形态无独立招式表时自动 fallback 到默认形态
  useEffect(() => {
    if (!pokemonDetail || learnsetGenRef.current === null) return;
    const form = selectedFormKey || "default";
    const newPath = `/pokemon/${pokemonDetail.id}/learnset?generation=${learnsetGenRef.current}&form=${encodeURIComponent(form)}`;
    setLearnsetBasePath(newPath);
    // 形态切换后需要重新加载招式列表
    movesInitRef.current = false;
    prevMoveSearchRef.current = "";
  }, [selectedFormKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 面板打开时加载首页招式（learnsetBasePath 就绪后自动触发）
  useEffect(() => {
    if (activePanel?.startsWith("move-") && !movesInitRef.current && learnsetBasePath) {
      movesInitRef.current = true;
      prevMoveSearchRef.current = "";
      movesPagination.reset(learnsetBasePath);
    }
  }, [activePanel, learnsetBasePath]); // eslint-disable-line react-hooks/exhaustive-deps

  // 招式搜索（防抖，切换路径加 q 参数）
  useEffect(() => {
    if (!activePanel?.startsWith("move-")) return;
    if (!learnsetBasePath) return;
    const trimmed = panelSearch.trim();
    if (!trimmed) {
      // 只有从非空搜索切回空时才恢复全量列表
      if (prevMoveSearchRef.current) {
        prevMoveSearchRef.current = "";
        movesPagination.reset(learnsetBasePath);
      }
      return;
    }
    const timer = setTimeout(() => {
      prevMoveSearchRef.current = trimmed;
      movesPagination.reset(`${learnsetBasePath}&q=${encodeURIComponent(trimmed)}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [panelSearch, activePanel, learnsetBasePath]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pokemonId) { setPokemonDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    api<DataResponse<PokemonEntry>>(`/pokemon/${pokemonId}`).then((r) => {
      if (!cancelled) {
        setPokemonDetail(r.data);
        setDetailLoading(false);
        // 如果 config 中已有 formKey，使用它；否则默认选中第一个形态
        const forms = r.data?.forms || [];
        const initialFormKey = config.formKey || (forms[0]?.formKey ?? "default");
        setSelectedFormKey(initialFormKey);
        // 根据选中的形态保存闪光图片 URL 和 baseStats 到 config
        const selectedForm = forms.find((f) => f.formKey === initialFormKey) || forms[0];
        const imgs = selectedForm?.images;
        const shinyObj = imgs?.shiny || imgs?.shinyOfficial || imgs?.shinySprite;
        const shinyUrl = shinyObj?.url || (typeof shinyObj === "string" ? shinyObj : "");
        const detailBaseStats = selectedForm?.baseStats || r.data?.baseStats;
        const updates: Partial<PokemonConfig> = {};
        // 补全 formId（从盒子导入时可能只有 formKey 没有 formId）
        if (!config.formId && selectedForm?.id) updates.formId = String(selectedForm.id);
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
            const topAbilities: string[] = r.data?.abilities || [];
            if (topAbilities.length > 0) {
              updates.abilityId = "";
              updates.abilityName = topAbilities[0];
            }
          }
        }
        if (Object.keys(updates).length > 0) {
          onChange((prev): PokemonConfigDraft => ({ ...prev, ...updates }));
        }
      }
    }).catch(() => {
      if (!cancelled) { setPokemonDetail(null); setDetailLoading(false); }
    });
    return () => { cancelled = true; };
  }, [pokemonId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 当前选中的形态 ── */
  const currentForm = useMemo((): PokemonFormEntry | null => {
    if (!pokemonDetail) return null;
    const forms = pokemonDetail.forms || [];
    if (forms.length === 0) return null;
    return forms.find((f) => f.formKey === selectedFormKey) || forms[0] || null;
  }, [pokemonDetail, selectedFormKey]);

  /* ── 形态列表（用于选择器，过滤掉超极巨化形态） ── */
  const formOptions = useMemo((): Array<{ value: string; label: string; formType: string }> => {
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
  const handleFormChange = useCallback((formKey: string) => {
    setSelectedFormKey(formKey);
    if (!pokemonDetail) return;
    const forms = pokemonDetail.forms || [];
    const form = forms.find((f) => f.formKey === formKey) || forms[0];
    if (!form) return;
    // 更新 config 中的形态相关信息
    const imgs = form.images;
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
    const updates: Partial<PokemonConfig> = {
      formId: form.id ? String(form.id) : "",
      formKey,
      formName: form.nameZh || form.formKey || "",
      primaryType: form.primaryType || pokemonDetail.primaryType || "",
      secondaryType: form.secondaryType || pokemonDetail.secondaryType || "",
      baseStats: form.baseStats || pokemonDetail.baseStats || undefined,
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
    onChange((prev): PokemonConfigDraft => ({ ...prev, ...updates }));
  }, [pokemonDetail, onChange, config.formKey]);

  /* ── 特性列表（分普通 / 隐藏），返回 {id, name} 对象数组 ── */
  const abilityGroups = useMemo(() => {
    if (!pokemonDetail) return { normal: [] as Array<{ id: string; name: string }>, hidden: [] as Array<{ id: string; name: string }> };
    const abilities = currentForm?.abilities || [];
    if (abilities.length > 0) {
      return {
        normal: abilities.filter((ab) => !ab.isHidden).map((ab) => ({ id: ab.abilityId ? String(ab.abilityId) : "", name: ab.nameZh || String(ab.abilityId || "") })),
        hidden: abilities.filter((ab) => ab.isHidden).map((ab) => ({ id: ab.abilityId ? String(ab.abilityId) : "", name: ab.nameZh || String(ab.abilityId || "") })),
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

  /* ── 图片（普通 / 闪光） ── */
  const detailImages = currentForm?.images;
  const previewImage = useMemo((): { url: string } | null => {
    if (isShiny) {
      const shiny = detailImages?.shiny || detailImages?.shinyOfficial || detailImages?.shinySprite;
      if (shiny) return typeof shiny === "string" ? { url: shiny } : shiny;
    }
    if (currentForm?.images?.official) return currentForm.images.official;
    if (pokemonDetail) {
      const url = getPokemonPreviewImage(pokemonDetail);
      return url ? { url } : null;
    }
    return null;
  }, [pokemonDetail, currentForm, detailImages, isShiny]);

  const baseStats = useMemo((): StatBlock | null => {
    if (!pokemonDetail) return null;
    return currentForm?.baseStats || pokemonDetail.baseStats || null;
  }, [pokemonDetail, currentForm]);

  /* ── 属性 ── */
  const types = useMemo((): string[] => {
    if (!pokemonDetail) return [];
    const src = currentForm || pokemonDetail;
    const arr: string[] = [];
    if (src.primaryType) arr.push(src.primaryType);
    if (src.secondaryType) arr.push(src.secondaryType);
    if (arr.length > 0) return arr;
    return [];
  }, [pokemonDetail, currentForm]);

  const handleMove = (moveIndex: number, value: string, moveOpt: MoveOption | null) => {
    const moves = [...(config.moves || ["", "", "", ""])] as [string, string, string, string];
    moves[moveIndex] = value;
    const draft: PokemonConfigDraft = { ...config, moves };
    // 保存招式类型信息以便展示
    if (moveOpt && value) {
      const movesInfo = { ...(config._movesInfo || {}) };
      movesInfo[value] = { moveId: moveOpt.moveId ?? null, type: moveOpt.moveType || "", power: moveOpt.movePower ?? "", category: moveOpt.moveCategory || "" };
      draft._movesInfo = movesInfo;
    }
    onChange(draft);
  };

  const handleStatChange = useCallback((payload: StatCalculatorChangePayload) => {
    onChange((prev) => {
      if (prev.level === payload.level && prev.nature === payload.nature &&
          prev.statMode === payload.statMode &&
          JSON.stringify(prev.ivs) === JSON.stringify(payload.ivs) &&
          JSON.stringify(prev.evs) === JSON.stringify(payload.evs) &&
          JSON.stringify(prev.sps) === JSON.stringify(payload.sps)) {
        return prev;
      }
      return { ...prev, level: payload.level, nature: payload.nature, ivs: payload.ivs, evs: payload.evs, statMode: payload.statMode || "classic", sps: payload.sps || {}, champNature: payload.champNature || payload.nature };
    });
  }, [onChange]);

  const statInitialValues: StatCalculatorInitialValues = {
    level: config.level || 50,
    nature: config.nature || "认真",
    ivs: config.ivs || createDefaultStats("iv"),
    evs: config.evs || createDefaultStats("ev"),
    statMode: (config.statMode as "classic" | "champions") || "classic",
    sps: config.sps || {},
    champNature: config.champNature || config.nature || "认真",
  };

  // 当前形态是否绑定了道具（锁定道具选择）
  const isItemLocked = Boolean(currentForm?.requiredItem);

  const openPanel = (panel: ActivePanel | string) => {
    if (panel === "item" && isItemLocked) return;
    setActivePanel(panel as ActivePanel);
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
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
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
                    onClick={() => onChange((prev): PokemonConfigDraft => ({ ...prev, abilityId: ab.id ? String(ab.id) : "", abilityName: ab.name }))}
                  >{ab.name}</button>
                ))}
                {abilityGroups.hidden.map((ab) => (
                  <button
                    key={ab.name}
                    className={`te-ability-tab te-ability-tab-hidden${(config.abilityName || config.abilityId) === ab.name || config.abilityId === String(ab.id) ? " te-ability-tab-active" : ""}`}
                    onClick={() => onChange((prev): PokemonConfigDraft => ({ ...prev, abilityId: ab.id ? String(ab.id) : "", abilityName: ab.name }))}
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPanelSearch(e.target.value)}
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPanelSearch(e.target.value)}
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
              const savedInfo = config._movesInfo?.[moveName];
              const moveInfo = movesPagination.data.find((m) => m.value === moveName);
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
            <div className="cfg-item-panel-list" ref={itemListRef} onScroll={itemsPagination.onScroll}>
              {itemsPagination.data.map((opt) => (
                <div
                  key={opt.value}
                  className={`cfg-item-panel-row${config.itemId === opt.value ? " cfg-item-panel-row-active" : ""}`}
                  onClick={() => { const draft: PokemonConfigDraft = { ...config, itemId: opt.value, itemName: opt.nameZh || opt.label, itemImageUrl: opt.imageUrl }; onChange(draft); setActivePanel(null); setPanelSearch(""); }}
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
              {itemsPagination.loading && <div className="cfg-panel-empty">加载中…</div>}
              {!itemsPagination.loading && itemsPagination.data.length === 0 && <div className="cfg-panel-empty">无匹配结果</div>}
            </div>
          )}

          {/* 招式面板 */}
          {activePanel?.startsWith("move-") && (() => {
            const mi = Number(activePanel.split("-")[1]);
            return (
              <div className="cfg-move-panel-wrap" ref={moveListRef} onScroll={movesPagination.onScroll}>
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
                    {movesPagination.data.map((opt) => (
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
                {movesPagination.loading && <div className="cfg-panel-empty">加载中…</div>}
                {!movesPagination.loading && movesPagination.data.length === 0 && <div className="cfg-panel-empty">{detailLoading ? "加载中…" : "无匹配结果"}</div>}
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
