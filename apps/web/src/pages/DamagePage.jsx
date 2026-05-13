import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { api, unifiedApi } from "../utils/api.js";
import { STAT_KEYS, STAT_LABELS, NATURE_OPTIONS, NATURE_EFFECTS, GENERATION_OPTIONS } from "@pokemon-localdex/store-types/constants";
import {
  createDraftMember, createDefaultStats, buildDerivedStats,
  resolveMoveGenerationRecord, getPokemonPreviewImage, evToSp,
  calculateFinalStat, getNatureMultiplier
} from "../utils/helpers.js";
import TypeChip from "../components/TypeChip.jsx";
import Loading from "../components/Loading.jsx";
import SearchSelect from "../components/SearchSelect.jsx";
import { getBox, getTeams, resolveTeamMembers } from "../utils/teamStorage.js";

// ── 常量 ──
const BOOST_STATS = ["atk", "def", "spa", "spd", "spe"]; // HP 不参与增减修正
const DEFAULT_BOOSTS = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const SP_MAX = 32;
const SP_TOTAL_MAX = 66;
const EV_MAX = 252;
const EV_TOTAL_MAX = 510;
const IV_MAX = 31;

// SP → EV 转换（与 StatCalculator 中逻辑一致）
function spToEv(sp) {
  if (sp <= 0) return 0;
  return Math.min(252, 4 + (sp - 1) * 8);
}
const NATURE_SELECT_OPTIONS = NATURE_OPTIONS.map((n) => {
  const eff = NATURE_EFFECTS[n];
  return {
    value: n,
    label: n,
    sublabel: eff ? `+${STAT_LABELS[eff.up]} -${STAT_LABELS[eff.down]}` : "无修正",
  };
});


// ══════════════════════════════════════════════════════════════
//  子组件：简化能力值编辑器（无进度条）
// ══════════════════════════════════════════════════════════════

function SimpleStatEditor({ member, detail, isChampions, onChange, boosts, onBoostChange, level }) {
  const baseStats = detail?.baseStats || {};
  // 使用共享等级覆盖 member.level
  const memberWithLevel = useMemo(() => ({ ...member, level: level || member.level || 50 }), [member, level]);

  const handleStatChange = (key, value) => {
    if (isChampions) {
      const sps = { ...(member.sps || {}), [key]: Math.max(0, Math.min(SP_MAX, Number(value) || 0)) };
      onChange({ ...member, sps });
    } else {
      const evs = { ...(member.evs || {}), [key]: Math.max(0, Math.min(EV_MAX, Number(value) || 0)) };
      onChange({ ...member, evs });
    }
  };

  const handleIvChange = (key, value) => {
    const ivs = { ...(member.ivs || {}), [key]: Math.max(0, Math.min(IV_MAX, Number(value) || 0)) };
    onChange({ ...member, ivs });
  };

  const evTotal = isChampions ? 0 : STAT_KEYS.reduce((s, k) => s + (member.evs?.[k] || 0), 0);

  return (
    <div className={"dc-stat-editor" + (isChampions ? " dc-stat-champions" : "")}>
      <div className="dc-stat-header-row">
        <span className="dc-stat-col-label">能力</span>
        <span className="dc-stat-col-base">种族</span>
        {!isChampions && <span className="dc-stat-col-iv">个体</span>}
        <span className="dc-stat-col-ev">{isChampions ? "SP" : "努力"}</span>
        <span className="dc-stat-col-final">实际</span>
        <span className="dc-stat-col-boost">等级</span>
      </div>
      {STAT_KEYS.map((key) => {
        const base = baseStats[key] || 0;
        const iv = member.ivs?.[key] ?? 31;
        const sp = member.sps?.[key] || 0;
        const ev = member.evs?.[key] || 0;
        const final = calculateFinalStat(memberWithLevel, detail, key);
        const isBoostable = BOOST_STATS.includes(key);
        return (
          <div key={key} className="dc-stat-row">
            <span className="dc-stat-col-label">{STAT_LABELS[key]}</span>
            <span className="dc-stat-col-base">{base}</span>
            {!isChampions && (
              <input
                className="dc-stat-input dc-stat-col-iv"
                type="number"
                min={0}
                max={IV_MAX}
                value={iv}
                onChange={(e) => handleIvChange(key, e.target.value)}
              />
            )}
            <input
              className="dc-stat-input dc-stat-col-ev"
              type="number"
              min={0}
              max={isChampions ? SP_MAX : EV_MAX}
              value={isChampions ? sp : ev}
              onChange={(e) => handleStatChange(key, e.target.value)}
            />
            <span className={"dc-stat-col-final" + (final ? "" : " dc-stat-na")}>{final ?? "—"}</span>
            {/* 能力等级：HP 无增减，显示占位 */}
            {isBoostable ? (
              <span className="dc-stat-col-boost dc-boost-inline">
                <button
                  className="dc-boost-btn-sm"
                  disabled={(boosts?.[key] || 0) <= -6}
                  onClick={() => onBoostChange(key, (boosts?.[key] || 0) - 1)}
                >−</button>
                <span className={"dc-boost-val" + ((boosts?.[key] || 0) > 0 ? " dc-boost-pos" : (boosts?.[key] || 0) < 0 ? " dc-boost-neg" : "")}>
                  {(boosts?.[key] || 0) > 0 ? "+" : ""}{boosts?.[key] || 0}
                </span>
                <button
                  className="dc-boost-btn-sm"
                  disabled={(boosts?.[key] || 0) >= 6}
                  onClick={() => onBoostChange(key, (boosts?.[key] || 0) + 1)}
                >+</button>
              </span>
            ) : (
              <span className="dc-stat-col-boost dc-boost-inline dc-boost-placeholder">—</span>
            )}
          </div>
        );
      })}
      {!isChampions && (
        <div className="dc-stat-total">
          努力值合计: <strong>{evTotal}</strong> / {EV_TOTAL_MAX}
          {evTotal > EV_TOTAL_MAX && <span className="dc-stat-over"> (超出!)</span>}
        </div>
      )}
      {Object.values(boosts || DEFAULT_BOOSTS).some((v) => v !== 0) && (
        <button className="dc-boost-reset" onClick={() => { BOOST_STATS.forEach((k) => onBoostChange(k, 0)); }}>重置等级</button>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
//  子组件：招式槽位面板（4个招式，样式与盒子一致）
// ══════════════════════════════════════════════════════════════

function MoveSlotPanel({ moves, movesInfo, selectedIndex, onSelectSlot, onSetMove, pokemonId, generation }) {
  const [editingSlot, setEditingSlot] = useState(null);
  const [query, setQuery] = useState("");
  const [learnset, setLearnset] = useState([]);
  const [learnsetLoaded, setLearnsetLoaded] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const searchTimer = useRef(null);
  const learnsetPokemonRef = useRef(null);

  // pokemonId 变化时重置 learnset 缓存标记
  useEffect(() => {
    if (pokemonId !== learnsetPokemonRef.current) {
      setLearnset([]);
      setLearnsetLoaded(false);
      learnsetPokemonRef.current = pokemonId;
    }
  }, [pokemonId]);

  // 懒加载：仅在打开编辑面板且尚未加载时请求 learnset
  useEffect(() => {
    if (editingSlot === null || !pokemonId || learnsetLoaded) return;
    let cancelled = false;
    setLoading(true);
    unifiedApi(`/pokemon/${pokemonId}/learnset/meta`).then((meta) => {
      if (cancelled) return;
      const gens = meta.data?.generations || [];
      const latestGen = gens.length > 0 ? gens[gens.length - 1] : 9;
      const formKeys = meta.data?.formKeys || [];
      const form = formKeys[0] || "default";
      return unifiedApi(`/pokemon/${pokemonId}/learnset?generation=${latestGen}&form=${form}`);
    }).then((r) => {
      if (cancelled || !r) return;
      const entries = r.data || [];
      const seen = new Set();
      const list = [];
      for (const entry of entries) {
        const name = entry.moveNameZh || entry.moveId;
        if (name && !seen.has(name)) {
          seen.add(name);
          list.push({
            value: name,
            label: name,
            moveId: entry.moveId ?? null,
            moveType: entry.moveType || "",
            moveCategory: entry.moveCategory || "",
            movePower: entry.movePower ?? null,
            moveAccuracy: entry.moveAccuracy ?? null,
            movePP: entry.movePP ?? null,
            moveDescription: entry.moveDescription || "",
          });
        }
      }
      setLearnset(list);
      setLearnsetLoaded(true);
      setLoading(false);
    }).catch(() => { if (!cancelled) { setLearnset([]); setLearnsetLoaded(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [editingSlot, pokemonId, learnsetLoaded]);

  // 搜索招式（防抖，走 /moves API）
  useEffect(() => {
    if (editingSlot === null) return;
    if (!query.trim()) { setSearchResults(null); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setLoading(true);
    searchTimer.current = setTimeout(() => {
      unifiedApi(`/moves?q=${encodeURIComponent(query.trim())}&limit=50`).then((r) => {
        setSearchResults((r.data || []).map((m) => ({
          value: m.nameZh || String(m.id),
          label: m.nameZh || String(m.id),
          moveId: m.id || null,
          moveType: m.type || "",
          moveCategory: m.category || "",
          movePower: m.power ?? null,
          moveAccuracy: m.accuracy ?? null,
          movePP: m.pp ?? null,
          moveDescription: m.description || "",
        })));
        setLoading(false);
      }).catch(() => { setSearchResults([]); setLoading(false); });
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, editingSlot]);

  // 点击外部关闭编辑
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setEditingSlot(null);
        setQuery("");
        setSearchResults(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayedMoves = searchResults !== null ? searchResults : learnset;

  const handleSlotClick = (index) => {
    if (moves[index]) {
      onSelectSlot(index);
    } else {
      setEditingSlot(index);
      setQuery("");
      setSearchResults(null);
    }
  };

  const handleEditSlot = (index, e) => {
    e.stopPropagation();
    setEditingSlot(index);
    setQuery("");
    setSearchResults(null);
  };

  const handlePickMove = (opt) => {
    if (editingSlot !== null) {
      onSetMove(editingSlot, opt);
      setEditingSlot(null);
      setQuery("");
      setSearchResults(null);
    }
  };

  const handleClearSlot = (index, e) => {
    e.stopPropagation();
    onSetMove(index, null);
    if (selectedIndex === index) onSelectSlot(null);
  };

  return (
    <div className="dc-move-slots" ref={wrapRef}>
      {/* 4个招式槽位（盒子样式） */}
      <div className="dc-move-slots-grid">
        {[0, 1, 2, 3].map((i) => {
          const moveName = moves[i];
          const info = movesInfo?.[moveName] || {};
          const moveType = info.type || info.moveType || "";
          const isSelected = selectedIndex === i && !!moveName;
          if (moveName) {
            return (
              <div
                key={i}
                className={`box-card-move type-bg-${moveType || "unknown"} dc-move-slot-card${isSelected ? " dc-move-slot-card-active" : ""}`}
                onClick={() => handleSlotClick(i)}
              >
                {moveType && (
                  <img className="box-card-move-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${moveType}@sm.png`} alt={moveType} />
                )}
                <span className="box-card-move-name">{moveName}</span>
                {info.power > 0 && <span className="box-card-move-power">{info.power}</span>}
                <button className="dc-move-slot-clear-btn" onClick={(e) => handleClearSlot(i, e)} title="清除">×</button>
              </div>
            );
          }
          return (
            <button
              key={i}
              className="dc-move-slot-empty-btn"
              onClick={() => handleSlotClick(i)}
            >
              招式 {i + 1}
            </button>
          );
        })}
      </div>

      {/* 招式搜索面板 */}
      {editingSlot !== null && (
        <div className="dc-move-panel-overlay">
          <div className="dc-move-panel-header">
            <input
              className="dc-move-panel-search-input"
              placeholder="搜索招式…"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && <button className="dc-move-panel-search-clear" onClick={() => { setQuery(""); setSearchResults(null); }}>✕</button>}
            <button className="dc-move-panel-close" onClick={() => { setEditingSlot(null); setQuery(""); setSearchResults(null); }}>取消</button>
          </div>
          <div className="dc-move-panel-list">
            {loading && <div className="dc-move-panel-hint">加载中…</div>}
            {!loading && displayedMoves.length === 0 && <div className="dc-move-panel-hint">{query.trim() ? "无匹配结果" : "暂无招式数据"}</div>}
            {!loading && displayedMoves.map((opt) => (
              <div
                key={opt.value}
                className={`dc-move-panel-item${moves.includes(opt.value) ? " dc-move-panel-item-selected" : ""}`}
                onClick={() => handlePickMove(opt)}
              >
                <span className={`dc-move-panel-item-type type-bg-${opt.moveType || "unknown"}`}>
                  {opt.moveType && <img className="box-card-move-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${opt.moveType}@sm.png`} alt="" />}
                  {opt.moveType || "—"}
                </span>
                <span className="dc-move-panel-item-name">{opt.label}</span>
                <span className="dc-move-panel-item-cat">
                  {opt.moveCategory === "physical" ? "物理" : opt.moveCategory === "special" ? "特殊" : "变化"}
                </span>
                <span className="dc-move-panel-item-power">{opt.movePower ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  子组件：简洁宝可梦选择列表（图片 + 名称 + 属性）
// ══════════════════════════════════════════════════════════════

function SimplePokemonList({ search, onSelect }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const listRef = useRef(null);
  const searchRef = useRef(search);

  const loadPage = useCallback(async (currentOffset, query, reset = false) => {
    try {
      const params = new URLSearchParams({ limit: "40", offset: String(currentOffset) });
      if (query.trim()) params.set("q", query.trim());
      const r = await unifiedApi(`/pokemon?${params.toString()}`);
      const list = r.data || [];
      if (reset) setData(list); else setData((prev) => [...prev, ...list]);
      setHasMore(list.length >= 40);
      setOffset(currentOffset + list.length);
    } catch { setHasMore(false); }
    setLoading(false);
  }, []);

  useEffect(() => {
    searchRef.current = search;
    setData([]);
    setOffset(0);
    setHasMore(true);
    setLoading(true);
    loadPage(0, search, true);
  }, [search, loadPage]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!hasMore || loading) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
        loadPage(offset, searchRef.current, false);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [offset, hasMore, loading, loadPage]);

  return (
    <div className="dc-simple-list" ref={listRef}>
      {data.map((p) => {
        const img = getPokemonPreviewImage(p);
        return (
          <button key={p.slug || p.id} className="dc-simple-list-item" onClick={() => onSelect(p)}>
            {img?.url && <img className="dc-simple-list-img" src={img.url} alt="" referrerPolicy="no-referrer" />}
            <span className="dc-simple-list-name">{p.nameZh || p.slug}</span>
            <span className="dc-simple-list-types">
              {p.primaryType && <TypeChip type={p.primaryType} size="xs" />}
              {p.secondaryType && <TypeChip type={p.secondaryType} size="xs" />}
            </span>
          </button>
        );
      })}
      {loading && <div className="dc-simple-list-hint">加载中…</div>}
      {!loading && data.length === 0 && <div className="dc-simple-list-hint">没有找到匹配的宝可梦</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  子组件：宝可梦配置面板（攻击方/防守方通用）
// ══════════════════════════════════════════════════════════════

const TERA_TYPE_OPTIONS = [
  { value: "none", label: "无" },
  ...[ "一般","火","水","电","草","冰","格斗","毒","地面","飞行","超能力","虫","岩石","幽灵","龙","恶","钢","妖精","星晶"].map((t) => ({ value: t, label: t })),
];

function PokemonConfigPanel({ title, member, detail, isChampions, onChange, onClear, boosts, onBoostChange, level, onMovesSync, curHP, onCurHPChange, teraType, setTeraType, generation }) {
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTab, setPickerTab] = useState("search"); // "search" | "box" | "team"
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState([]);
  const [itemOpen, setItemOpen] = useState(false);
  const itemWrapRef = useRef(null);
  const img = member.imageUrl || (detail ? getPokemonPreviewImage(detail)?.url : "") || "";

  // detail 加载后：
  // 1. 如果 member 已有 formKey（如从盒子导入），补全 formId 并触发道具绑定
  // 2. 否则自动设置默认形态
  useEffect(() => {
    if (!detail) return;
    const forms = detail.forms || [];
    if (member.formId) return; // 已有完整 formId，无需处理

    if (member.formKey) {
      // 从盒子导入时有 formKey 但无 formId，补全 formId 并绑定道具
      const matchedForm = forms.find((f) => f.formKey === member.formKey) || forms[0];
      if (matchedForm) {
        const updates = { formId: matchedForm.id || "", formKey: matchedForm.formKey };
        // 自动绑定形态道具
        if (matchedForm.requiredItem) {
          updates.itemId = matchedForm.requiredItem.id ? String(matchedForm.requiredItem.id) : (matchedForm.requiredItem.slug || "");
          updates.itemName = matchedForm.requiredItem.nameZh || "";
          updates.itemImageUrl = matchedForm.requiredItem.imageUrl || "";
        }
        onChange({ ...member, ...updates });
      }
    } else {
      // 无形态信息，设置默认形态
      const defaultForm = forms.find((f) => f.isDefault) || forms[0];
      if (defaultForm?.id) {
        onChange({ ...member, formId: defaultForm.id, formKey: defaultForm.formKey });
      }
    }
  }, [detail]); // eslint-disable-line react-hooks/exhaustive-deps

  // 形态列表（过滤超极巨化）
  const formOptions = useMemo(() => {
    if (!detail) return [];
    const forms = detail.forms || [];
    return forms
      .filter((f) => f.formType !== "gmax" && !/超极巨化/.test(f.nameZh || ""))
      .map((f) => ({
        value: f.formKey,
        formId: f.id,
        label: f.nameZh || f.formKey || "默认形态",
      }));
  }, [detail]);

  const handleFormChange = (formKey) => {
    if (!detail) return;
    const forms = detail.forms || [];
    const form = forms.find((f) => f.formKey === formKey) || forms[0];
    if (!form) return;
    const imgs = form.images || detail.images;
    const officialImg = imgs?.official || imgs?.sprite;
    // 切换形态时默认选中第一个特性
    const formAbilities = form.abilities || [];
    const normalAbilities = formAbilities.filter((ab) => !ab.isHidden);
    const firstAbility = normalAbilities[0] || formAbilities[0];
    const defaultAbilityId = firstAbility
      ? (firstAbility.nameZh || firstAbility.abilityId || "")
      : (detail.abilities?.[0] || "");
    const updates = {
      formId: form.id || "",
      formKey,
      formName: form.nameZh || form.formKey || "",
      primaryType: form.primaryType || detail.primaryType || "",
      secondaryType: form.secondaryType || detail.secondaryType || "",
      imageUrl: officialImg?.url || member.imageUrl || "",
      abilityId: defaultAbilityId,
      abilityName: defaultAbilityId,
    };
    // 形态绑定道具：自动设置/清除道具
    if (form.requiredItem) {
      updates.itemId = form.requiredItem.id ? String(form.requiredItem.id) : (form.requiredItem.slug || "");
      updates.itemName = form.requiredItem.nameZh || "";
      updates.itemImageUrl = form.requiredItem.imageUrl || "";
    } else {
      // 切换到无绑定道具的形态时，如果之前的道具是被形态锁定的，则清除
      const prevForm = forms.find((f) => f.formKey === member.formKey);
      if (prevForm?.requiredItem) {
        updates.itemId = "";
        updates.itemImageUrl = "";
      }
    }
    onChange({ ...member, ...updates });
  };

  // 当前形态
  const currentForm = useMemo(() => {
    if (!detail) return null;
    const forms = detail.forms || [];
    if (forms.length === 0) return null;
    const fk = member.formKey || formOptions[0]?.value || "";
    return forms.find((f) => f.formKey === fk) || forms[0];
  }, [detail, member.formKey, formOptions]);

  // 道具是否被形态锁定
  const isItemLocked = Boolean(currentForm?.requiredItem);

  // 特性列表（分普通/隐藏）— 使用 ref 防止切换形态时闪烁
  const abilityListRef = useRef([]);
  const abilityList = useMemo(() => {
    if (!detail) return abilityListRef.current;
    const abilities = currentForm?.abilities || [];
    let result;
    if (abilities.length > 0) {
      result = abilities.map((ab) => ({
        id: ab.abilityId ? String(ab.abilityId) : "",
        name: ab.nameZh || ab.abilityId || "",
        isHidden: !!ab.isHidden,
      }));
    } else {
      const topAbilities = (detail.abilities || []).map((a) => ({ id: "", name: a, isHidden: false }));
      if (detail.hiddenAbility) topAbilities.push({ id: "", name: detail.hiddenAbility, isHidden: true });
      result = topAbilities;
    }
    // 只有当列表内容真正变化时才更新（避免空数组闪烁）
    if (result.length > 0 || abilityListRef.current.length === 0) {
      abilityListRef.current = result;
    }
    return abilityListRef.current;
  }, [detail, currentForm]);

  // 道具搜索（防抖）
  useEffect(() => {
    if (!itemQuery.trim()) { setItemResults([]); return; }
    const timer = setTimeout(() => {
      unifiedApi(`/items?q=${encodeURIComponent(itemQuery.trim())}&limit=20`).then((r) => {
        setItemResults(r.data || []);
      }).catch(() => setItemResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [itemQuery]);

  // 道具下拉框点击外部关闭
  useEffect(() => {
    const handler = (e) => {
      if (itemWrapRef.current && !itemWrapRef.current.contains(e.target)) setItemOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handlePickPokemon = (p) => {
    const pImg = getPokemonPreviewImage(p);
    onChange({
      ...createDraftMember(),
      pokemonId: String(p.id),
      nameZh: p.nameZh || "",
      primaryType: p.primaryType || "",
      secondaryType: p.secondaryType || "",
      imageUrl: pImg ? pImg.url || "" : "",
      statMode: isChampions ? "champions" : "classic",
      sps: isChampions ? createDefaultStats("ev") : {},
    });
    setPickerSearch("");
  };

  // 从盒子/队伍配置中选择，带入完整配置（等级、性格、努力值、形态、特性、道具等）
  // 根据当前页面模式（经典/Champions）自动转换 EV↔SP，转换规则与队伍配置页一致
  const handlePickFromConfig = (cfg) => {
    const draft = createDraftMember();
    const cfgMode = cfg.statMode || "classic";
    const targetMode = isChampions ? "champions" : "classic";

    let finalIvs = cfg.ivs && Object.keys(cfg.ivs).length > 0 ? cfg.ivs : draft.ivs;
    let finalEvs = cfg.evs && Object.keys(cfg.evs).length > 0 ? cfg.evs : draft.evs;
    let finalSps = cfg.sps && Object.keys(cfg.sps).length > 0 ? cfg.sps : {};
    let finalNature = cfg.nature || cfg.champNature || "认真";

    if (cfgMode === "classic" && targetMode === "champions") {
      // 经典 → Champions：EV 转 SP
      const converted = {};
      for (const k of STAT_KEYS) {
        converted[k] = evToSp(finalEvs[k] || 0);
      }
      // 总量限制 66
      let t = STAT_KEYS.reduce((s, k) => s + converted[k], 0);
      if (t > SP_TOTAL_MAX) {
        const scale = SP_TOTAL_MAX / t;
        for (const k of STAT_KEYS) {
          converted[k] = Math.floor(converted[k] * scale);
        }
      }
      finalSps = converted;
      finalNature = cfg.nature || "认真";
    } else if (cfgMode === "champions" && targetMode === "classic") {
      // Champions → 经典：SP 转 EV
      const converted = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
      const sorted = [...STAT_KEYS]
        .filter((k) => (finalSps[k] || 0) > 0)
        .sort((a, b) => (finalSps[b] || 0) - (finalSps[a] || 0));
      let budget = EV_TOTAL_MAX;
      for (const k of sorted) {
        const ideal = spToEv(finalSps[k] || 0);
        if (ideal <= budget) {
          converted[k] = ideal;
          budget -= ideal;
        } else {
          converted[k] = Math.min(EV_MAX, Math.floor(budget / 4) * 4);
          budget -= converted[k];
        }
      }
      finalEvs = converted;
      finalIvs = Object.fromEntries(STAT_KEYS.map((k) => [k, 31]));
      finalNature = cfg.champNature || cfg.nature || "认真";
    }

    onChange({
      ...draft,
      pokemonId: cfg.pokemonId || "",
      nameZh: cfg.nameZh || "",
      primaryType: cfg.primaryType || "",
      secondaryType: cfg.secondaryType || "",
      imageUrl: cfg.imageUrl || "",
      level: cfg.level || 50,
      nature: finalNature,
      abilityId: cfg.abilityId || "",
      abilityName: cfg.abilityName || "",
      itemId: cfg.itemId || "",
      itemName: cfg.itemName || "",
      itemImageUrl: cfg.itemImageUrl || "",
      formId: cfg.formId || "",
      formKey: cfg.formKey || "",
      formName: cfg.formName || "",
      ivs: finalIvs,
      evs: finalEvs,
      sps: finalSps,
      statMode: targetMode,
    });
    // 同步招式到槽位
    if (onMovesSync) onMovesSync(cfg);
    setPickerSearch("");
  };

  // 获取盒子和队伍数据
  const boxConfigs = useMemo(() => getBox(), [pickerTab]);
  const teams = useMemo(() => getTeams(), [pickerTab]);

  return (
    <div className="dc-pokemon-panel">
      <div className="dc-panel-title-row">
        <strong>{title}</strong>
        {member.pokemonId && (
          <button className="dc-btn-text" onClick={() => { onClear(); setPickerSearch(""); }}>更换</button>
        )}
      </div>

      {!member.pokemonId ? (
        <div className="dc-picker-wrap">
          {/* 来源切换标签 */}
          <div className="dc-picker-tabs">
            <button className={"dc-picker-tab" + (pickerTab === "search" ? " dc-picker-tab-active" : "")} onClick={() => setPickerTab("search")}>搜索</button>
            <button className={"dc-picker-tab" + (pickerTab === "box" ? " dc-picker-tab-active" : "")} onClick={() => setPickerTab("box")}>盒子{boxConfigs.length > 0 && <span className="dc-picker-tab-count">{boxConfigs.length}</span>}</button>
            <button className={"dc-picker-tab" + (pickerTab === "team" ? " dc-picker-tab-active" : "")} onClick={() => setPickerTab("team")}>队伍{teams.length > 0 && <span className="dc-picker-tab-count">{teams.length}</span>}</button>
          </div>

          {/* 搜索模式 */}
          {pickerTab === "search" && (
            <>
              <div className="cfg-toolbar-search">
                <svg className="cfg-toolbar-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" />
                </svg>
                <input
                  className="cfg-toolbar-search-input"
                  placeholder={"搜索" + title + "宝可梦名称 / 编号…"}
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                />
                {pickerSearch && (
                  <button className="cfg-toolbar-search-clear" onClick={() => setPickerSearch("")}>✕</button>
                )}
              </div>
              <SimplePokemonList search={pickerSearch} onSelect={handlePickPokemon} />
            </>
          )}

          {/* 盒子模式 */}
          {pickerTab === "box" && (
            <div className="dc-simple-list">
              {boxConfigs.length === 0 && <div className="dc-simple-list-hint">盒子中没有配置，请先在“宝可梦配置”页面添加</div>}
              {boxConfigs.map((cfg) => (
                <button key={cfg.configId} className="dc-simple-list-item" onClick={() => handlePickFromConfig(cfg)}>
                  {cfg.imageUrl && <img className="dc-simple-list-img" src={cfg.imageUrl} alt="" referrerPolicy="no-referrer" />}
                  <span className="dc-simple-list-name">{cfg.nameZh || cfg.pokemonId}</span>
                  <span className="dc-simple-list-types">
                    {cfg.primaryType && <TypeChip type={cfg.primaryType} size="xs" />}
                    {cfg.secondaryType && <TypeChip type={cfg.secondaryType} size="xs" />}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* 队伍模式 */}
          {pickerTab === "team" && (
            <div className="dc-simple-list">
              {teams.length === 0 && <div className="dc-simple-list-hint">没有队伍，请先在“我的队伍”页面创建</div>}
              {teams.map((team) => {
                const members = resolveTeamMembers(team);
                return (
                  <div key={team.teamId} className="dc-team-group">
                    <div className="dc-team-group-title">{team.name || "未命名队伍"}</div>
                    {members.filter((m) => m.pokemonId).map((m, i) => (
                      <button key={m.configId || i} className="dc-simple-list-item" onClick={() => handlePickFromConfig(m)}>
                        {m.imageUrl && <img className="dc-simple-list-img" src={m.imageUrl} alt="" referrerPolicy="no-referrer" />}
                        <span className="dc-simple-list-name">{m.nameZh || m.pokemonId}</span>
                        <span className="dc-simple-list-types">
                          {m.primaryType && <TypeChip type={m.primaryType} size="xs" />}
                          {m.secondaryType && <TypeChip type={m.secondaryType} size="xs" />}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="dc-pokemon-config">
          {/* 宝可梦头部信息 */}
          <div className="dc-pokemon-header">
            <div className="dc-pokemon-avatar-wrap">
              {img && <img className="dc-pokemon-avatar" src={img} alt="" referrerPolicy="no-referrer" />}
              {member.itemImageUrl && (
                <img className="dc-item-overlay" src={member.itemImageUrl} alt="" referrerPolicy="no-referrer" />
              )}
            </div>
            <div className="dc-pokemon-info">
              <div className="dc-pokemon-name-row">
                <span className="dc-pokemon-name">{member.nameZh || member.pokemonId}</span>
                <span className="dc-pokemon-types dc-pokemon-types-sm">
                  {(member.primaryType || detail?.primaryType) && <TypeChip type={member.primaryType || detail?.primaryType} size="xs" />}
                  {(member.secondaryType || detail?.secondaryType) && <TypeChip type={member.secondaryType || detail?.secondaryType} size="xs" />}
                </span>
                {Number(generation) >= 9 && (
                  <div className="dc-tera-inline">
                    <SearchSelect
                      value={teraType || "none"}
                      options={TERA_TYPE_OPTIONS}
                      onChange={(val) => setTeraType(val)}
                      placeholder="太晶"
                    />
                  </div>
                )}
              </div>
              {/* 特性按钮紧跟属性后面 */}
              <div className="dc-ability-inline">
                {abilityList.length > 0 ? abilityList.map((ab) => {
                  const isActive = (ab.id && member.abilityId === ab.id) || member.abilityName === ab.name || member.abilityId === ab.name;
                  return (
                    <button
                      key={ab.name}
                      className={"dc-ability-btn" + (isActive ? " dc-ability-btn-active" : "") + (ab.isHidden ? " dc-ability-btn-hidden" : "")}
                      onClick={() => onChange({ ...member, abilityId: ab.id || ab.name, abilityName: ab.name })}
                    >
                      {ab.name}{ab.isHidden ? " (隐)" : ""}
                    </button>
                  );
                }) : (
                  <input
                    className="dc-ability-input"
                    type="text"
                    value={member.abilityId || ""}
                    placeholder="输入特性"
                    onChange={(e) => onChange({ ...member, abilityId: e.target.value })}
                  />
                )}
              </div>
            </div>
          </div>

          {/* 形态切换 */}
          {formOptions.length > 1 && (
            <div className="dc-form-switcher">
              {formOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={"dc-form-btn" + ((member.formKey || formOptions[0]?.value) === opt.value ? " dc-form-btn-active" : "")}
                  onClick={() => handleFormChange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* 性格 + 道具（一行） */}
          <div className="dc-config-row dc-nature-item-row">
            <div className="dc-config-field dc-nature-field">
              <span>性格</span>
              <SearchSelect
                value={member.nature || "认真"}
                options={NATURE_SELECT_OPTIONS}
                onChange={(val) => onChange({ ...member, nature: val })}
                placeholder="选择性格"
              />
            </div>
            <div className="dc-config-field">
              <span>道具</span>
              {isItemLocked ? (
<div className="dc-item-locked">
                {member.itemImageUrl && <img className="dc-item-locked-img" src={member.itemImageUrl} alt="" referrerPolicy="no-referrer" />}
{member.itemName || member.itemId || "—"}
</div>
              ) : (
                <div className="dc-item-search-wrap" ref={itemWrapRef}>
{member.itemId && !itemOpen ? (
<div className="dc-item-selected" onClick={() => setItemOpen(true)}>
                {member.itemImageUrl && <img className="dc-item-selected-img" src={member.itemImageUrl} alt="" referrerPolicy="no-referrer" />}
<span className="dc-item-selected-name">{member.itemName || member.itemId}</span>
<button className="dc-item-clear" onClick={(e) => { e.stopPropagation(); onChange({ ...member, itemId: "", itemName: "", itemImageUrl: "" }); setItemQuery(""); }}>×</button>
                    </div>
                  ) : (
                    <input
                      className="dc-item-search-input"
                      type="text"
                      placeholder="搜索道具…"
                      value={itemQuery}
                      onChange={(e) => { setItemQuery(e.target.value); setItemOpen(true); }}
                      onFocus={() => setItemOpen(true)}
                    />
                  )}
                  {itemOpen && itemQuery.trim() && itemResults.length > 0 && (
                    <div className="dc-item-dropdown">
                      {itemResults.map((item) => (
                        <button
                          key={item.id}
                          className="dc-item-option"
                          onClick={() => {
                            onChange({ ...member, itemId: String(item.id), itemName: item.nameZh || "", itemImageUrl: item.imageUrl || "" });
                            setItemQuery("");
                            setItemOpen(false);
                          }}
                        >
                          {item.imageUrl && <img className="dc-item-option-img" src={item.imageUrl} alt="" referrerPolicy="no-referrer" />}
                          <span>{item.nameZh || item.slug}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {itemOpen && itemQuery.trim() && itemResults.length === 0 && (
                    <div className="dc-item-dropdown"><div className="dc-item-dropdown-hint">无匹配道具</div></div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 能力值 */}
          <SimpleStatEditor
            member={member}
            detail={(() => {
              // 使用当前形态的 baseStats
              if (!detail) return null;
              const forms = detail.forms || [];
              const currentFormKey = member.formKey || formOptions[0]?.value || "";
              const form = forms.find((f) => f.formKey === currentFormKey);
              if (form && form.baseStats) return { ...detail, baseStats: form.baseStats };
              return detail;
            })()}
            isChampions={isChampions}
            onChange={onChange}
            boosts={boosts}
            onBoostChange={onBoostChange}
            level={level}
          />

          {/* 当前 HP */}
          {detail && (() => {
            const memberWithLevel = { ...member, level: level || member.level || 50 };
            const maxHP = calculateFinalStat(memberWithLevel, detail, "hp") || 1;
            const hpVal = curHP > 0 ? curHP : maxHP;
            const pct = Math.round((hpVal / maxHP) * 100);
            return (
              <div className="dc-curhp-section">
                <span className="dc-curhp-label">HP</span>
                <input
                  className="dc-curhp-num"
                  type="number"
                  min={0}
                  max={maxHP}
                  value={hpVal}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(maxHP, Number(e.target.value) || 0));
                    onCurHPChange(v >= maxHP ? 0 : v);
                  }}
                />
                <span className="dc-curhp-sep">/</span>
                <span className="dc-curhp-max">{maxHP}</span>
                <span className="dc-curhp-paren">(</span>
                <input
                  className="dc-curhp-pct"
                  type="number"
                  min={0}
                  max={100}
                  value={pct}
                  onChange={(e) => {
                    const p = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    const v = Math.round((p / 100) * maxHP);
                    onCurHPChange(v >= maxHP ? 0 : v);
                  }}
                />
                <span className="dc-curhp-paren">%)</span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  子组件：状态效果面板
// ══════════════════════════════════════════════════════════════

function StatusPanel({ label, side, status, setStatus, toxicCounter, setToxicCounter,
  stealthRock, setStealthRock, spikes, setSpikes, steelsurge, setSteelsurge,
  reflect, setReflect, lightScreen, setLightScreen, auroraVeil, setAuroraVeil,
  protect, setProtect, helpingHand, setHelpingHand, tailwind, setTailwind,
  friendGuard, setFriendGuard, switchingOut, setSwitchingOut,
  seeded, setSeeded, saltCured, setSaltCured, foresight, setForesight,
  flowerGift, setFlowerGift, powerTrick, setPowerTrick, steelySpirit, setSteelySpirit,
  battery, setBattery, powerSpot, setPowerSpot,
  isDynamaxed, setIsDynamaxed, alliesFainted, setAlliesFainted,
  generation }) {
  const STATUS_SELECT_OPTIONS = [
    { value: "none", label: "健康" },
    { value: "burn", label: "烧伤" },
    { value: "paralysis", label: "麻痹" },
    { value: "poison", label: "中毒" },
    { value: "tox", label: "剧毒" },
    { value: "sleep", label: "睡眠" },
    { value: "freeze", label: "冰冻" },
  ];
  return (
    <div className={"dc-status-panel" + (side === "atk" ? " dc-status-panel-atk" : side === "def" ? " dc-status-panel-def" : "")}>
      <div className="dc-sp-header">
        <span className="dc-sp-title">{label}</span>
        <div className="dc-sp-status-row">
          <div className="dc-status-select-wrap">
            <SearchSelect
              value={status || "none"}
              options={STATUS_SELECT_OPTIONS}
              onChange={(val) => setStatus(val)}
              placeholder="健康"
            />
          </div>
          {status === "tox" && (
            <span className="dc-toxic-counter">
              <span>回合</span>
              <input type="number" className="dc-toxic-input" min={0} max={15} value={toxicCounter || 0} onChange={(e) => setToxicCounter(Math.max(0, Math.min(15, Number(e.target.value) || 0)))} />
            </span>
          )}
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">场地</span>
        <div className="dc-sp-chips">
          <button className={"dc-chip" + (stealthRock ? " dc-chip-on" : "")} onClick={() => setStealthRock(!stealthRock)}>隐石</button>
          <button className={"dc-chip" + (spikes > 0 ? " dc-chip-on" : "")} onClick={() => setSpikes(spikes >= 3 ? 0 : spikes + 1)}>撒菱{spikes > 0 ? `×${spikes}` : ""}</button>
          <button className={"dc-chip" + (steelsurge ? " dc-chip-on" : "")} onClick={() => setSteelsurge(!steelsurge)}>钢刺</button>
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">屏障</span>
        <div className="dc-sp-chips">
          <button className={"dc-chip" + (reflect ? " dc-chip-on" : "")} onClick={() => setReflect(!reflect)}>反射壁</button>
          <button className={"dc-chip" + (lightScreen ? " dc-chip-on" : "")} onClick={() => setLightScreen(!lightScreen)}>光墙</button>
          <button className={"dc-chip" + (auroraVeil ? " dc-chip-on" : "")} onClick={() => setAuroraVeil(!auroraVeil)}>极光幕</button>
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">辅助</span>
        <div className="dc-sp-chips">
          <button className={"dc-chip" + (protect ? " dc-chip-on" : "")} onClick={() => setProtect(!protect)}>守住</button>
          <button className={"dc-chip" + (helpingHand ? " dc-chip-on" : "")} onClick={() => setHelpingHand(!helpingHand)}>帮助</button>
          <button className={"dc-chip" + (tailwind ? " dc-chip-on" : "")} onClick={() => setTailwind(!tailwind)}>顺风</button>
          <button className={"dc-chip" + (friendGuard ? " dc-chip-on" : "")} onClick={() => setFriendGuard(!friendGuard)}>友情防守</button>
          <button className={"dc-chip" + (switchingOut ? " dc-chip-on" : "")} onClick={() => setSwitchingOut(!switchingOut)}>换入中</button>
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">异常</span>
        <div className="dc-sp-chips">
          <button className={"dc-chip" + (seeded ? " dc-chip-on" : "")} onClick={() => setSeeded(!seeded)}>寄生种子</button>
          <button className={"dc-chip" + (saltCured ? " dc-chip-on" : "")} onClick={() => setSaltCured(!saltCured)}>盐腌</button>
          <button className={"dc-chip" + (foresight ? " dc-chip-on" : "")} onClick={() => setForesight(!foresight)}>识破</button>
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">队友</span>
        <div className="dc-sp-chips">
          <button className={"dc-chip" + (flowerGift ? " dc-chip-on" : "")} onClick={() => setFlowerGift(!flowerGift)}>花之礼</button>
          <button className={"dc-chip" + (steelySpirit ? " dc-chip-on" : "")} onClick={() => setSteelySpirit(!steelySpirit)}>钢之意志</button>
          <button className={"dc-chip" + (battery ? " dc-chip-on" : "")} onClick={() => setBattery(!battery)}>蓄电池</button>
          <button className={"dc-chip" + (powerSpot ? " dc-chip-on" : "")} onClick={() => setPowerSpot(!powerSpot)}>能量点</button>
          <button className={"dc-chip" + (powerTrick ? " dc-chip-on" : "")} onClick={() => setPowerTrick(!powerTrick)}>力量戏法</button>
        </div>
      </div>
      {/* 极巨化/倒下队友 */}
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">特殊</span>
        <div className="dc-sp-chips">
          {Number(generation) === 8 && (
            <button className={"dc-chip" + (isDynamaxed ? " dc-chip-on" : "")} onClick={() => setIsDynamaxed(!isDynamaxed)}>极巨化</button>
          )}
          <div className="dc-sp-inline-field">
            <span className="dc-sp-inline-label">倒下队友</span>
            <input type="number" className="dc-sp-mini-input" min={0} max={5} value={alliesFainted || 0} onChange={(e) => setAlliesFainted(Math.max(0, Math.min(5, Number(e.target.value) || 0)))} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  主页面
// ══════════════════════════════════════════════════════════════

export default function DamagePage() {
  // ── 世代 ──
  const [generation, setGeneration] = useState("0");
  const isChampions = Number(generation) === 0;

  // ── 攻守双方 ──
  const [attacker, setAttacker] = useState(() => ({ ...createDraftMember(), statMode: "classic" }));
  const [defender, setDefender] = useState(() => ({ ...createDraftMember(), statMode: "classic" }));

  // ── 等级（攻守共享） ──
  const [level, setLevel] = useState(50);

  // ── 招式（攻守双方各4个槽位） ──
  const [atkMoves, setAtkMoves] = useState(["", "", "", ""]);
  const [atkMovesInfo, setAtkMovesInfo] = useState({});
  const [atkSelectedSlot, setAtkSelectedSlot] = useState(null);
  const [defMoves, setDefMoves] = useState(["", "", "", ""]);
  const [defMovesInfo, setDefMovesInfo] = useState({});
  const [defSelectedSlot, setDefSelectedSlot] = useState(null);
  const [selectedMove, setSelectedMove] = useState(null);
  const [calcDirection, setCalcDirection] = useState("atk"); // "atk" = 攻击方→防守方, "def" = 防守方→攻击方
  const [critical, setCritical] = useState(false);
  const [moveHits, setMoveHits] = useState(0); // 0 = 默认（由招式决定）
  const [defCritical, setDefCritical] = useState(false);
  const [defMoveHits, setDefMoveHits] = useState(0);
  // 招式额外参数
  const [useZ, setUseZ] = useState(false);
  const [useMax, setUseMax] = useState(false);
  const [timesUsed, setTimesUsed] = useState(0);
  const [timesUsedWithMetronome, setTimesUsedWithMetronome] = useState(0);
  const [isStellarFirstUse, setIsStellarFirstUse] = useState(false);
  const [defUseZ, setDefUseZ] = useState(false);
  const [defUseMax, setDefUseMax] = useState(false);
  const [defTimesUsed, setDefTimesUsed] = useState(0);
  const [defTimesUsedWithMetronome, setDefTimesUsedWithMetronome] = useState(0);
  const [defIsStellarFirstUse, setDefIsStellarFirstUse] = useState(false);

  // ── 当前 HP ──
  const [atkCurHP, setAtkCurHP] = useState(0);  // 0 = 满血
  const [defCurHP, setDefCurHP] = useState(0);  // 0 = 满血

  // ── 场地环境 ──
  const [battleMode, setBattleMode] = useState("doubles");
  const [weather, setWeather] = useState("none");
  const [terrain, setTerrain] = useState("none");
  const [gravity, setGravity] = useState(false);
  const [magicRoom, setMagicRoom] = useState(false);
  const [wonderRoom, setWonderRoom] = useState(false);

  // ── 灾厄四宝 ──
  const [beadsOfRuin, setBeadsOfRuin] = useState(false);
  const [tabletsOfRuin, setTabletsOfRuin] = useState(false);
  const [swordOfRuin, setSwordOfRuin] = useState(false);
  const [vesselOfRuin, setVesselOfRuin] = useState(false);

  // ── 攻击方额外属性 ──
  const [atkTeraType, setAtkTeraType] = useState("none");
  const [atkIsDynamaxed, setAtkIsDynamaxed] = useState(false);
  const [atkAlliesFainted, setAtkAlliesFainted] = useState(0);

  // ── 防守方额外属性 ──
  const [defTeraType, setDefTeraType] = useState("none");
  const [defIsDynamaxed, setDefIsDynamaxed] = useState(false);
  const [defAlliesFainted, setDefAlliesFainted] = useState(0);

  // ── 攻击方状态 ──
  const [atkStatus, setAtkStatus] = useState("none");
  const [atkToxicCounter, setAtkToxicCounter] = useState(0);
  const [atkStealthRock, setAtkStealthRock] = useState(false);
  const [atkSpikes, setAtkSpikes] = useState(0);
  const [atkSteelsurge, setAtkSteelsurge] = useState(false);
  const [atkReflect, setAtkReflect] = useState(false);
  const [atkLightScreen, setAtkLightScreen] = useState(false);
  const [atkAuroraVeil, setAtkAuroraVeil] = useState(false);
  const [atkProtect, setAtkProtect] = useState(false);
  const [atkHelpingHand, setAtkHelpingHand] = useState(false);
  const [atkTailwind, setAtkTailwind] = useState(false);
  const [atkFriendGuard, setAtkFriendGuard] = useState(false);
  const [atkBoost, setAtkBoost] = useState({ ...DEFAULT_BOOSTS });
  const [atkSwitchingOut, setAtkSwitchingOut] = useState(false);
  const [atkSeeded, setAtkSeeded] = useState(false);
  const [atkSaltCured, setAtkSaltCured] = useState(false);
  const [atkForesight, setAtkForesight] = useState(false);
  const [atkFlowerGift, setAtkFlowerGift] = useState(false);
  const [atkPowerTrick, setAtkPowerTrick] = useState(false);
  const [atkSteelySpirit, setAtkSteelySpirit] = useState(false);
  const [atkBattery, setAtkBattery] = useState(false);
  const [atkPowerSpot, setAtkPowerSpot] = useState(false);

  // ── 防守方状态 ──
  const [defStatus, setDefStatus] = useState("none");
  const [defToxicCounter, setDefToxicCounter] = useState(0);
  const [defStealthRock, setDefStealthRock] = useState(false);
  const [defSpikes, setDefSpikes] = useState(0);
  const [defSteelsurge, setDefSteelsurge] = useState(false);
  const [defReflect, setDefReflect] = useState(false);
  const [defLightScreen, setDefLightScreen] = useState(false);
  const [defAuroraVeil, setDefAuroraVeil] = useState(false);
  const [defProtect, setDefProtect] = useState(false);
  const [defHelpingHand, setDefHelpingHand] = useState(false);
  const [defTailwind, setDefTailwind] = useState(false);
  const [defFriendGuard, setDefFriendGuard] = useState(false);
  const [defBoost, setDefBoost] = useState({ ...DEFAULT_BOOSTS });
  const [defSwitchingOut, setDefSwitchingOut] = useState(false);
  const [defSeeded, setDefSeeded] = useState(false);
  const [defSaltCured, setDefSaltCured] = useState(false);
  const [defForesight, setDefForesight] = useState(false);
  const [defFlowerGift, setDefFlowerGift] = useState(false);
  const [defPowerTrick, setDefPowerTrick] = useState(false);
  const [defSteelySpirit, setDefSteelySpirit] = useState(false);
  const [defBattery, setDefBattery] = useState(false);
  const [defPowerSpot, setDefPowerSpot] = useState(false);

  // ── 计算结果 ──
  const [result, setResult] = useState(null);
  const [calculating, setCalculating] = useState(false);

  // ── 全局数据 ──
  const [attackerDetail, setAttackerDetail] = useState(null);
  const [defenderDetail, setDefenderDetail] = useState(null);

  // 攻击方设置招式槽位（opt 来自 learnset 或 /moves 搜索结果）
  const handleAtkSetMove = useCallback((index, opt) => {
    if (!opt) {
      setAtkMoves((prev) => { const next = [...prev]; next[index] = ""; return next; });
      setAtkSelectedSlot(null);
      setSelectedMove(null);
      return;
    }
    const name = opt.value || opt.label || "";
    const moveId = opt.moveId || null;
    setAtkMoves((prev) => { const next = [...prev]; next[index] = name; return next; });
    setAtkMovesInfo((prev) => ({
      ...prev,
      [name]: { moveId, type: opt.moveType || "", power: opt.movePower ?? 0, category: opt.moveCategory || "", _opt: opt }
    }));
    // 自动选中刚设置的招式
    setAtkSelectedSlot(index);
    // 获取完整 move 对象用于计算（优先用 moveId）
    const fetchMove = moveId
      ? unifiedApi(`/moves/${moveId}`)
      : unifiedApi(`/moves?q=${encodeURIComponent(name)}&limit=5`);
    fetchMove.then((r) => {
      const found = moveId ? r.data : (r.data || []).find((m) => m.nameZh === name || m.slug === name);
      if (found) setSelectedMove(found);
    }).catch(() => {});
  }, []);

  // 攻击方选中招式槽位
  const handleAtkSelectSlot = useCallback((index) => {
    if (index === null) { setAtkSelectedSlot(null); setSelectedMove(null); return; }
    setAtkSelectedSlot(index);
    setCalcDirection("atk");
    setDefSelectedSlot(null); // 取消防守方选中
    const moveName = atkMoves[index];
    if (!moveName) return;
    const info = atkMovesInfo[moveName];
    if (info?._opt?._moveObj) {
      setSelectedMove(info._opt._moveObj);
    } else {
      const moveId = info?.moveId;
      const fetchMove = moveId
        ? unifiedApi(`/moves/${moveId}`)
        : unifiedApi(`/moves?q=${encodeURIComponent(moveName)}&limit=5`);
      fetchMove.then((r) => {
        const found = moveId ? r.data : (r.data || []).find((m) => m.nameZh === moveName || m.slug === moveName);
        if (found) setSelectedMove(found);
      }).catch(() => {});
    }
  }, [atkMoves, atkMovesInfo]);

  // 防守方选中招式槽位（反向计算：防守方→攻击方）
  const handleDefSelectSlot = useCallback((index) => {
    if (index === null) { setDefSelectedSlot(null); setSelectedMove(null); return; }
    setDefSelectedSlot(index);
    setCalcDirection("def");
    setAtkSelectedSlot(null); // 取消攻击方选中
    const moveName = defMoves[index];
    if (!moveName) return;
    const info = defMovesInfo[moveName];
    if (info?._opt?._moveObj) {
      setSelectedMove(info._opt._moveObj);
    } else {
      const moveId = info?.moveId;
      const fetchMove = moveId
        ? unifiedApi(`/moves/${moveId}`)
        : unifiedApi(`/moves?q=${encodeURIComponent(moveName)}&limit=5`);
      fetchMove.then((r) => {
        const found = moveId ? r.data : (r.data || []).find((m) => m.nameZh === moveName || m.slug === moveName);
        if (found) setSelectedMove(found);
      }).catch(() => {});
    }
  }, [defMoves, defMovesInfo]);

  // 防守方设置招式槽位（设置后自动选中并触发反向计算）
  const handleDefSetMove = useCallback((index, opt) => {
    if (!opt) {
      setDefMoves((prev) => { const next = [...prev]; next[index] = ""; return next; });
      setDefSelectedSlot(null);
      setSelectedMove(null);
      return;
    }
    const name = opt.value || opt.label || "";
    const moveId = opt.moveId || null;
    setDefMoves((prev) => { const next = [...prev]; next[index] = name; return next; });
    setDefMovesInfo((prev) => ({
      ...prev,
      [name]: { moveId, type: opt.moveType || "", power: opt.movePower ?? 0, category: opt.moveCategory || "", _opt: opt }
    }));
    // 自动选中刚设置的招式，并设置为反向计算
    setDefSelectedSlot(index);
    setCalcDirection("def");
    setAtkSelectedSlot(null);
    // 获取完整 move 对象用于计算
    const fetchMove = moveId
      ? unifiedApi(`/moves/${moveId}`)
      : unifiedApi(`/moves?q=${encodeURIComponent(name)}&limit=5`);
    fetchMove.then((r) => {
      const found = moveId ? r.data : (r.data || []).find((m) => m.nameZh === name || m.slug === name);
      if (found) setSelectedMove(found);
    }).catch(() => {});
  }, []);

  // 从盒子导入时同步招式到槽位（补全缺失的招式信息）
  const syncMovesFromConfig = useCallback((cfg, side) => {
    const moves = cfg.moves || ["", "", "", ""];
    const info = { ...(cfg._movesInfo || {}) };

    if (side === "atk") {
      setAtkMoves(moves);
      setAtkMovesInfo(info);
      setAtkSelectedSlot(null);
    } else {
      setDefMoves(moves);
      setDefMovesInfo(info);
      setDefSelectedSlot(null);
    }

    // 找出有招式名但缺少 type 信息的招式，通过 API 补全
    const missing = moves.filter((name) => name && (!info[name] || !info[name].type));
    if (missing.length === 0) return;

    // 优先用 moveId 查询，降级用名称搜索
    for (const name of missing) {
      const moveId = info[name]?.moveId;
      const fetchPromise = moveId
        ? unifiedApi(`/moves/${moveId}`)
        : unifiedApi(`/moves?q=${encodeURIComponent(name)}&limit=5`);

      fetchPromise.then((r) => {
        // /moves/:id 返回 { data: {...} }，/moves?q= 返回 { data: [...] }
        const found = moveId
          ? r.data
          : (r.data || []).find((m) => m.nameZh === name || m.slug === name);
        if (found) {
          const patch = { moveId: found.id || moveId, type: found.type || "", power: found.power ?? 0, category: found.category || "" };
          if (side === "atk") {
            setAtkMovesInfo((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));
          } else {
            setDefMovesInfo((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));
          }
        }
      }).catch(() => {});
    }
  }, []);

  // 加载攻击方详情
  useEffect(() => {
    if (!attacker.pokemonId) { setAttackerDetail(null); return; }
    let cancelled = false;
    unifiedApi("/pokemon/" + attacker.pokemonId).then((r) => {
      if (!cancelled) setAttackerDetail(r.data);
    }).catch(() => { if (!cancelled) setAttackerDetail(null); });
    return () => { cancelled = true; };
  }, [attacker.pokemonId]);

  // 加载防守方详情
  useEffect(() => {
    if (!defender.pokemonId) { setDefenderDetail(null); return; }
    let cancelled = false;
    unifiedApi("/pokemon/" + defender.pokemonId).then((r) => {
      if (!cancelled) setDefenderDetail(r.data);
    }).catch(() => { if (!cancelled) setDefenderDetail(null); });
    return () => { cancelled = true; };
  }, [defender.pokemonId]);

  // 世代切换时更新 statMode 并自动转换 EV↔SP
  useEffect(() => {
    const targetMode = isChampions ? "champions" : "classic";
    const convert = (prev) => {
      if (prev.statMode === targetMode) return { ...prev, statMode: targetMode };
      if (prev.statMode === "classic" && targetMode === "champions") {
        // 经典 → Champions：EV 转 SP
        const converted = {};
        for (const k of STAT_KEYS) {
          converted[k] = evToSp(prev.evs?.[k] || 0);
        }
        let t = STAT_KEYS.reduce((s, k) => s + converted[k], 0);
        if (t > SP_TOTAL_MAX) {
          const scale = SP_TOTAL_MAX / t;
          for (const k of STAT_KEYS) {
            converted[k] = Math.floor(converted[k] * scale);
          }
        }
        return { ...prev, sps: converted, statMode: targetMode };
      }
      if (prev.statMode === "champions" && targetMode === "classic") {
        // Champions → 经典：SP 转 EV
        const converted = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
        const sorted = [...STAT_KEYS]
          .filter((k) => (prev.sps?.[k] || 0) > 0)
          .sort((a, b) => (prev.sps?.[b] || 0) - (prev.sps?.[a] || 0));
        let budget = EV_TOTAL_MAX;
        for (const k of sorted) {
          const ideal = spToEv(prev.sps?.[k] || 0);
          if (ideal <= budget) {
            converted[k] = ideal;
            budget -= ideal;
          } else {
            converted[k] = Math.min(EV_MAX, Math.floor(budget / 4) * 4);
            budget -= converted[k];
          }
        }
        return { ...prev, evs: converted, ivs: Object.fromEntries(STAT_KEYS.map((k) => [k, 31])), statMode: targetMode };
      }
      return { ...prev, statMode: targetMode };
    };
    setAttacker(convert);
    setDefender(convert);
  }, [isChampions]);

  // ── 伤害计算（支持双向：calcDirection 决定谁攻谁守） ──
  const handleCalculate = useCallback(async () => {
    if (!selectedMove || !attacker.pokemonId || !defender.pokemonId) return;

    // 根据计算方向决定实际的攻击方和防守方
    const isReverse = calcDirection === "def"; // 防守方→攻击方
    const realAttacker = isReverse ? defender : attacker;
    const realDefender = isReverse ? attacker : defender;
    const realAtkDetail = isReverse ? defenderDetail : attackerDetail;
    const realDefDetail = isReverse ? attackerDetail : defenderDetail;
    const realAtkBoost = isReverse ? defBoost : atkBoost;
    const realDefBoost = isReverse ? atkBoost : defBoost;
    const realAtkCurHP = isReverse ? defCurHP : atkCurHP;
    const realDefCurHP = isReverse ? atkCurHP : defCurHP;
    const realAtkStatus = isReverse ? defStatus : atkStatus;
    const realDefStatus = isReverse ? atkStatus : defStatus;
    const realAtkToxicCounter = isReverse ? defToxicCounter : atkToxicCounter;
    const realDefToxicCounter = isReverse ? atkToxicCounter : defToxicCounter;
    const realCritical = isReverse ? defCritical : critical;
    const realMoveHits = isReverse ? defMoveHits : moveHits;
    const realUseZ = isReverse ? defUseZ : useZ;
    const realUseMax = isReverse ? defUseMax : useMax;
    const realTimesUsed = isReverse ? defTimesUsed : timesUsed;
    const realTimesUsedWithMetronome = isReverse ? defTimesUsedWithMetronome : timesUsedWithMetronome;
    const realIsStellarFirstUse = isReverse ? defIsStellarFirstUse : isStellarFirstUse;
    const realAtkTeraType = isReverse ? defTeraType : atkTeraType;
    const realDefTeraType = isReverse ? atkTeraType : defTeraType;
    const realAtkIsDynamaxed = isReverse ? defIsDynamaxed : atkIsDynamaxed;
    const realDefIsDynamaxed = isReverse ? atkIsDynamaxed : defIsDynamaxed;
    const realAtkAlliesFainted = isReverse ? defAlliesFainted : atkAlliesFainted;
    const realDefAlliesFainted = isReverse ? atkAlliesFainted : defAlliesFainted;

    // 场地 side 也要交换
    const realAtkSide = isReverse ? {
      isSR: defStealthRock, spikes: defSpikes, steelsurge: defSteelsurge,
      isReflect: defReflect, isLightScreen: defLightScreen, isAuroraVeil: defAuroraVeil,
      isProtected: defProtect, isHelpingHand: defHelpingHand, isTailwind: defTailwind,
      isFriendGuard: defFriendGuard, isSwitching: defSwitchingOut ? "out" : undefined,
      isSeeded: defSeeded, isSaltCured: defSaltCured, isForesight: defForesight,
      isFlowerGift: defFlowerGift, isPowerTrick: defPowerTrick, isSteelySpirit: defSteelySpirit,
      isBattery: defBattery, isPowerSpot: defPowerSpot,
    } : {
      isSR: atkStealthRock, spikes: atkSpikes, steelsurge: atkSteelsurge,
      isReflect: atkReflect, isLightScreen: atkLightScreen, isAuroraVeil: atkAuroraVeil,
      isProtected: atkProtect, isHelpingHand: atkHelpingHand, isTailwind: atkTailwind,
      isFriendGuard: atkFriendGuard, isSwitching: atkSwitchingOut ? "out" : undefined,
      isSeeded: atkSeeded, isSaltCured: atkSaltCured, isForesight: atkForesight,
      isFlowerGift: atkFlowerGift, isPowerTrick: atkPowerTrick, isSteelySpirit: atkSteelySpirit,
      isBattery: atkBattery, isPowerSpot: atkPowerSpot,
    };
    const realDefSide = isReverse ? {
      isSR: atkStealthRock, spikes: atkSpikes, steelsurge: atkSteelsurge,
      isReflect: atkReflect, isLightScreen: atkLightScreen, isAuroraVeil: atkAuroraVeil,
      isProtected: atkProtect, isHelpingHand: atkHelpingHand, isTailwind: atkTailwind,
      isFriendGuard: atkFriendGuard, isSwitching: atkSwitchingOut ? "in" : undefined,
      isSeeded: atkSeeded, isSaltCured: atkSaltCured, isForesight: atkForesight,
      isFlowerGift: atkFlowerGift, isPowerTrick: atkPowerTrick, isSteelySpirit: atkSteelySpirit,
      isBattery: atkBattery, isPowerSpot: atkPowerSpot,
    } : {
      isSR: defStealthRock, spikes: defSpikes, steelsurge: defSteelsurge,
      isReflect: defReflect, isLightScreen: defLightScreen, isAuroraVeil: defAuroraVeil,
      isProtected: defProtect, isHelpingHand: defHelpingHand, isTailwind: defTailwind,
      isFriendGuard: defFriendGuard, isSwitching: defSwitchingOut ? "in" : undefined,
      isSeeded: defSeeded, isSaltCured: defSaltCured, isForesight: defForesight,
      isFlowerGift: defFlowerGift, isPowerTrick: defPowerTrick, isSteelySpirit: defSteelySpirit,
      isBattery: defBattery, isPowerSpot: defPowerSpot,
    };

    setCalculating(true);
    try {
      const gen = Number(generation);
      function resolveEvs(member) {
        if (!isChampions) return member.evs || {};
        if (member.sps && Object.keys(member.sps).length > 0) return member.sps;
        const evs = member.evs || {};
        const converted = {};
        for (const key of Object.keys(evs)) converted[key] = evToSp(evs[key]);
        return converted;
      }

      const calcResult = await api("/battle/damage", {
        method: "POST",
        body: JSON.stringify({
          generation: gen,
          attacker: {
            pokemonId: realAttacker.pokemonId || "",
            formId: realAttacker.formId || "",
            formKey: realAttacker.formKey || "",
            name: realAttacker.nameZh || (realAtkDetail?.nameZh) || "",
            level: Number(level || 50),
            nature: realAttacker.nature || "认真",
            abilityId: realAttacker.abilityId || "",
            ability: realAttacker.abilityName || "",
            itemId: realAttacker.itemId || "",
            item: realAttacker.itemName || "",
            evs: resolveEvs(realAttacker),
            ivs: realAttacker.ivs || {},
            boosts: Object.values(realAtkBoost).some((v) => v !== 0) ? realAtkBoost : undefined,
            curHP: realAtkCurHP > 0 ? realAtkCurHP : undefined,
            status: realAtkStatus !== "none" ? realAtkStatus : "",
            toxicCounter: realAtkStatus === "tox" ? realAtkToxicCounter : undefined,
            teraType: realAtkTeraType !== "none" ? realAtkTeraType : undefined,
            isDynamaxed: realAtkIsDynamaxed || undefined,
            alliesFainted: realAtkAlliesFainted > 0 ? realAtkAlliesFainted : undefined,
          },
          defender: {
            pokemonId: realDefender.pokemonId || "",
            formId: realDefender.formId || "",
            formKey: realDefender.formKey || "",
            name: realDefender.nameZh || (realDefDetail?.nameZh) || "",
            level: Number(level || 50),
            nature: realDefender.nature || "认真",
            abilityId: realDefender.abilityId || "",
            ability: realDefender.abilityName || "",
            itemId: realDefender.itemId || "",
            item: realDefender.itemName || "",
            evs: resolveEvs(realDefender),
            ivs: realDefender.ivs || {},
            boosts: Object.values(realDefBoost).some((v) => v !== 0) ? realDefBoost : undefined,
            curHP: realDefCurHP > 0 ? realDefCurHP : undefined,
            status: realDefStatus !== "none" ? realDefStatus : "",
            toxicCounter: realDefStatus === "tox" ? realDefToxicCounter : undefined,
            teraType: realDefTeraType !== "none" ? realDefTeraType : undefined,
            isDynamaxed: realDefIsDynamaxed || undefined,
            alliesFainted: realDefAlliesFainted > 0 ? realDefAlliesFainted : undefined,
          },
          move: {
            id: selectedMove.id || "",
            name: selectedMove.nameZh || selectedMove.slug || "",
            isCrit: realCritical,
            hits: realMoveHits > 0 ? realMoveHits : undefined,
            useZ: realUseZ || undefined,
            useMax: realUseMax || undefined,
            timesUsed: realTimesUsed > 0 ? realTimesUsed : undefined,
            timesUsedWithMetronome: realTimesUsedWithMetronome > 0 ? realTimesUsedWithMetronome : undefined,
            isStellarFirstUse: realIsStellarFirstUse || undefined,
          },
          field: {
            gameType: battleMode,
            weather,
            terrain,
            isGravity: gravity,
            isMagicRoom: magicRoom,
            isWonderRoom: wonderRoom,
            isBeadsOfRuin: beadsOfRuin,
            isTabletsOfRuin: tabletsOfRuin,
            isSwordOfRuin: swordOfRuin,
            isVesselOfRuin: vesselOfRuin,
            attackerSide: realAtkSide,
            defenderSide: realDefSide,
          },
        })
      });

      const data = calcResult.data;
      const record = resolveMoveGenerationRecord(selectedMove, generation);
      const mType = record?.type || selectedMove.type || "";
      const cat = record?.category || selectedMove.category || "physical";

      setResult({
        min: data.min,
        max: data.max,
        average: data.average,
        description: data.description || "",
        damageRolls: data.damageRolls || [],
        moveName: selectedMove.nameZh || selectedMove.slug || "",
        moveType: mType,
        category: cat,
        attackerName: realAttacker.nameZh || (isReverse ? "防守方" : "攻击方"),
        defenderName: realDefender.nameZh || (isReverse ? "攻击方" : "防守方"),
        defHp: data.defenderHp || 0,
        minPercent: data.minPercent || 0,
        maxPercent: data.maxPercent || 0,
        direction: calcDirection,
      });
    } catch (err) {
      window.alert("计算失败: " + (err.message || "未知错误"));
    }
    setCalculating(false);
  }, [selectedMove, calcDirection, attacker, attackerDetail, defender, defenderDetail, generation, isChampions, level,
    critical, moveHits, defCritical, defMoveHits,
    useZ, useMax, timesUsed, timesUsedWithMetronome, isStellarFirstUse,
    defUseZ, defUseMax, defTimesUsed, defTimesUsedWithMetronome, defIsStellarFirstUse,
    battleMode, weather, terrain, gravity, magicRoom, wonderRoom,
    beadsOfRuin, tabletsOfRuin, swordOfRuin, vesselOfRuin,
    atkTeraType, atkIsDynamaxed, atkAlliesFainted,
    defTeraType, defIsDynamaxed, defAlliesFainted,
    atkCurHP, atkStatus, atkToxicCounter, atkStealthRock, atkSpikes, atkSteelsurge,
    atkReflect, atkLightScreen, atkAuroraVeil, atkProtect, atkHelpingHand, atkTailwind,
    atkFriendGuard, atkBoost, atkSwitchingOut,
    atkSeeded, atkSaltCured, atkForesight, atkFlowerGift, atkPowerTrick, atkSteelySpirit, atkBattery, atkPowerSpot,
    defCurHP, defStatus, defToxicCounter, defStealthRock, defSpikes, defSteelsurge,
    defReflect, defLightScreen, defAuroraVeil, defProtect, defHelpingHand, defTailwind,
    defFriendGuard, defBoost, defSwitchingOut,
    defSeeded, defSaltCured, defForesight, defFlowerGift, defPowerTrick, defSteelySpirit, defBattery, defPowerSpot]);

  // 用 ref 保存最新的 handleCalculate，避免 useEffect 因引用变化过度触发
  const calcRef = useRef(handleCalculate);
  calcRef.current = handleCalculate;

  // 选中招式后立即计算（仅 selectedMove 变化时触发）
  useEffect(() => {
    if (selectedMove && attacker.pokemonId && defender.pokemonId) {
      calcRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMove]);

  // 其他参数变化时防抖重新计算（500ms）
  const depsForRecalc = JSON.stringify([
    attacker.pokemonId, attacker.formId, attacker.nature, attacker.abilityId, attacker.itemId,
    attacker.evs, attacker.sps, attacker.ivs,
    defender.pokemonId, defender.formId, defender.nature, defender.abilityId, defender.itemId,
    defender.evs, defender.sps, defender.ivs,
    level, generation, isChampions, calcDirection, critical, moveHits, defCritical, defMoveHits,
    useZ, useMax, timesUsed, timesUsedWithMetronome, isStellarFirstUse,
    defUseZ, defUseMax, defTimesUsed, defTimesUsedWithMetronome, defIsStellarFirstUse,
    battleMode, weather, terrain, gravity, magicRoom, wonderRoom,
    beadsOfRuin, tabletsOfRuin, swordOfRuin, vesselOfRuin,
    atkTeraType, atkIsDynamaxed, atkAlliesFainted,
    defTeraType, defIsDynamaxed, defAlliesFainted,
    atkCurHP, atkStatus, atkToxicCounter, atkBoost,
    atkStealthRock, atkSpikes, atkSteelsurge, atkReflect, atkLightScreen, atkAuroraVeil,
    atkProtect, atkHelpingHand, atkTailwind, atkFriendGuard, atkSwitchingOut,
    atkSeeded, atkSaltCured, atkForesight, atkFlowerGift, atkPowerTrick, atkSteelySpirit, atkBattery, atkPowerSpot,
    defCurHP, defStatus, defToxicCounter, defBoost,
    defStealthRock, defSpikes, defSteelsurge, defReflect, defLightScreen, defAuroraVeil,
    defProtect, defHelpingHand, defTailwind, defFriendGuard, defSwitchingOut,
    defSeeded, defSaltCured, defForesight, defFlowerGift, defPowerTrick, defSteelySpirit, defBattery, defPowerSpot,
  ]);
  useEffect(() => {
    if (!selectedMove || !attacker.pokemonId || !defender.pokemonId) return;
    const timer = setTimeout(() => calcRef.current(), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsForRecalc]);

  const handleReset = useCallback(() => {
    setAttacker({ ...createDraftMember(), statMode: isChampions ? "champions" : "classic" });
    setDefender({ ...createDraftMember(), statMode: isChampions ? "champions" : "classic" });
    setAtkMoves(["", "", "", ""]);
    setAtkMovesInfo({});
    setAtkSelectedSlot(null);
    setDefMoves(["", "", "", ""]);
    setDefMovesInfo({});
    setDefSelectedSlot(null);
    setSelectedMove(null);
    setCalcDirection("atk");
    setCritical(false);
    setMoveHits(0);
    setDefCritical(false);
    setDefMoveHits(0);
    setUseZ(false); setUseMax(false); setTimesUsed(0); setTimesUsedWithMetronome(0); setIsStellarFirstUse(false);
    setDefUseZ(false); setDefUseMax(false); setDefTimesUsed(0); setDefTimesUsedWithMetronome(0); setDefIsStellarFirstUse(false);
    setAtkTeraType("none"); setAtkIsDynamaxed(false); setAtkAlliesFainted(0);
    setDefTeraType("none"); setDefIsDynamaxed(false); setDefAlliesFainted(0);
    setResult(null);
  }, [isChampions]);


  return (
    <section className="view-grid">
      <div className="panel dc-page">
        {/* ── 页面标题栏 ── */}
        <div className="dc-header">
          <div className="dc-header-left">
            <h2 className="dc-title">伤害计算器</h2>
            <span className="dc-subtitle">{isChampions ? "Champions 模式 (SP)" : `第${generation}世代`}</span>
          </div>
          <div className="dc-header-right">
            <select className="dc-gen-select" value={generation} onChange={(e) => { setGeneration(e.target.value); setResult(null); }}>
              {GENERATION_OPTIONS.map((g) => <option key={g} value={g}>{g}世代</option>)}
              <option value="0">Champions</option>
            </select>
            {!isChampions && (
              <div className="dc-level-inline">
                <span className="dc-level-inline-label">Lv.</span>
                <input
                  className="dc-level-inline-input"
                  type="number"
                  min={1}
                  max={100}
                  value={level}
                  onChange={(e) => setLevel(Math.max(1, Math.min(100, Number(e.target.value) || 50)))}
                />
              </div>
            )}
            <div className="dc-battle-mode-toggle">
              <button className={"dc-mode-btn" + (battleMode === "singles" ? " dc-mode-btn-active" : "")} onClick={() => setBattleMode("singles")}>单打</button>
              <button className={"dc-mode-btn" + (battleMode === "doubles" ? " dc-mode-btn-active" : "")} onClick={() => setBattleMode("doubles")}>双打</button>
            </div>
            <button className="dc-btn-reset" onClick={handleReset}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 1 3 6.36" /><path d="M3 21v-6h6" />
              </svg>
              重置
            </button>
          </div>
        </div>

        {/* ── 三栏主体：攻击方 | 中栏(场地+结果) | 防守方 ── */}
        <div className="dc-main-layout">

          {/* ═══ 左栏：攻击方招式 + 宝可梦 ═══ */}
          <div className="dc-side-col">
            {/* 攻击方招式槽位 */}
            {attacker.pokemonId && (
              <div className="dc-move-section dc-move-section-side">
                <span className="dc-section-title">攻击方招式</span>
                <MoveSlotPanel
                  moves={atkMoves}
                  movesInfo={atkMovesInfo}
                  selectedIndex={atkSelectedSlot}
                  onSelectSlot={handleAtkSelectSlot}
                  pokemonId={attacker.pokemonId}
                  generation={generation}
                  onSetMove={handleAtkSetMove}
                />
                <div className="dc-move-extras">
                  <button className={"dc-chip" + (critical ? " dc-chip-on" : "")} onClick={() => setCritical(!critical)}>暴击</button>
                  <span className="dc-move-extras-sep">|</span>
                  <span className="dc-move-extras-label">连击</span>
                  <input type="number" className="dc-hits-input" min={0} max={10} value={moveHits} onChange={(e) => setMoveHits(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
                  <span className="dc-hits-hint">{moveHits === 0 ? "默认" : `${moveHits}次`}</span>
                  <span className="dc-move-extras-sep">|</span>
                  <span className="dc-move-extras-label">已用</span>
                  <input type="number" className="dc-hits-input" min={0} max={10} value={timesUsed} onChange={(e) => setTimesUsed(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
                </div>
                <div className="dc-move-extras">
                  {Number(generation) === 7 && (
                    <button className={"dc-chip" + (useZ ? " dc-chip-on" : "")} onClick={() => setUseZ(!useZ)}>Z招式</button>
                  )}
                  {Number(generation) === 8 && (
                    <button className={"dc-chip" + (useMax ? " dc-chip-on" : "")} onClick={() => setUseMax(!useMax)}>极巨招式</button>
                  )}
                  {atkTeraType === "星晶" && (
                    <button className={"dc-chip" + (isStellarFirstUse ? " dc-chip-on" : "")} onClick={() => setIsStellarFirstUse(!isStellarFirstUse)}>星晶首次</button>
                  )}
                  {(attacker.itemName === "节拍器" || attacker.itemId === "item-节拍器") && (<>
                  <span className="dc-move-extras-sep">|</span>
                  <span className="dc-move-extras-label">节拍器</span>
                  <input type="number" className="dc-hits-input" min={0} max={10} value={timesUsedWithMetronome} onChange={(e) => setTimesUsedWithMetronome(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
                  </>)}
                </div>
              </div>
            )}
            <PokemonConfigPanel
              title="攻击方"
              member={attacker}
              detail={attackerDetail}
              isChampions={isChampions}
              onChange={setAttacker}
              onClear={() => { setAttacker({ ...createDraftMember(), statMode: isChampions ? "champions" : "classic" }); setAtkMoves(["", "", "", ""]); setAtkMovesInfo({}); setAtkSelectedSlot(null); setSelectedMove(null); setResult(null); }}
              boosts={atkBoost}
              onBoostChange={(key, val) => setAtkBoost((prev) => ({ ...prev, [key]: Math.max(-6, Math.min(6, val)) }))}
              level={level}
              onMovesSync={(cfg) => syncMovesFromConfig(cfg, "atk")}
              curHP={atkCurHP}
              onCurHPChange={setAtkCurHP}
              teraType={atkTeraType}
              setTeraType={setAtkTeraType}
              generation={generation}
            />
          </div>

          {/* ═══ 中栏：结果 + 等级 + 场地 + 状态 ═══ */}
          <div className="dc-center-col">
            {/* 计算结果（顶部） */}
            <div className="dc-result-section">
              {result ? (
                <div className={`dc-result-card${calculating ? " dc-result-updating" : ""}`}>
                  <div className="dc-result-headline">
                    <strong>{result.attackerName}</strong>
                    <span> 的 {result.moveName}</span>
                    {result.moveType && <TypeChip type={result.moveType} size="sm" />}
                    <span className="dc-result-category">{result.category === "physical" ? "物理" : "特殊"}</span>
                    <span> → </span>
                    <strong>{result.defenderName}</strong>
                  </div>
                  <div className="dc-result-numbers">
                    <div className="dc-result-num">
                      <span className="dc-result-label">最小</span>
                      <span className="dc-result-value">{result.min}</span>
                    </div>
                    <div className="dc-result-num dc-result-num-main">
                      <span className="dc-result-label">平均</span>
                      <span className="dc-result-value">{result.average}</span>
                    </div>
                    <div className="dc-result-num">
                      <span className="dc-result-label">最大</span>
                      <span className="dc-result-value">{result.max}</span>
                    </div>
                  </div>
                  {result.defHp > 0 && (
                    <div className="dc-result-percent">
                      {((result.min / result.defHp) * 100).toFixed(1)}% - {((result.max / result.defHp) * 100).toFixed(1)}% HP
                    </div>
                  )}
                  {result.description && (
                    <div className="dc-result-desc"><code>{result.description}</code></div>
                  )}
                </div>
              ) : calculating ? (
                <div className="dc-result-card dc-result-loading">
                  <span>计算中...</span>
                </div>
              ) : (
                <div className="dc-result-empty">
                  <p>选择攻守双方宝可梦并点击招式开始计算</p>
                </div>
              )}
            </div>


            {/* 场地环境 */}
            <div className="dc-field-section">
              <span className="dc-section-title">场地环境</span>
              <div className="dc-sp-group">
                <span className="dc-sp-group-label">天气</span>
                <div className="dc-sp-chips">
                  {[{ v: "sun", l: "晴天" }, { v: "harshSunlight", l: "大日照" }, { v: "rain", l: "雨天" }, { v: "heavyRain", l: "大雨" }, { v: "sand", l: "沙暴" }, { v: "hail", l: "雪" }, { v: "strongWinds", l: "乱流" }].map((w) => (
                    <button key={w.v} className={"dc-chip" + (weather === w.v ? " dc-chip-on" : "")} onClick={() => setWeather(weather === w.v ? "none" : w.v)}>{w.l}</button>
                  ))}
                </div>
              </div>
              <div className="dc-sp-group">
                <span className="dc-sp-group-label">场地</span>
                <div className="dc-sp-chips">
                  {[{ v: "electric", l: "电气" }, { v: "grassy", l: "青草" }, { v: "misty", l: "薄雾" }, { v: "psychic", l: "精神" }].map((t) => (
                    <button key={t.v} className={"dc-chip" + (terrain === t.v ? " dc-chip-on" : "")} onClick={() => setTerrain(terrain === t.v ? "none" : t.v)}>{t.l}</button>
                  ))}
                </div>
              </div>
              <div className="dc-sp-group">
                <span className="dc-sp-group-label">效果</span>
                <div className="dc-sp-chips">
                  <button className={"dc-chip" + (gravity ? " dc-chip-on" : "")} onClick={() => setGravity(!gravity)}>重力</button>
                  <button className={"dc-chip" + (magicRoom ? " dc-chip-on" : "")} onClick={() => setMagicRoom(!magicRoom)}>魔法空间</button>
                  <button className={"dc-chip" + (wonderRoom ? " dc-chip-on" : "")} onClick={() => setWonderRoom(!wonderRoom)}>奇妙空间</button>
                </div>
              </div>
              <div className="dc-sp-group">
                <span className="dc-sp-group-label">灾厄特性</span>
                <div className="dc-sp-chips">
                  <button className={"dc-chip" + (beadsOfRuin ? " dc-chip-on" : "")} onClick={() => setBeadsOfRuin(!beadsOfRuin)}>灾祸之珠</button>
                  <button className={"dc-chip" + (tabletsOfRuin ? " dc-chip-on" : "")} onClick={() => setTabletsOfRuin(!tabletsOfRuin)}>灾祸之碑</button>
                  <button className={"dc-chip" + (swordOfRuin ? " dc-chip-on" : "")} onClick={() => setSwordOfRuin(!swordOfRuin)}>灾祸之剑</button>
                  <button className={"dc-chip" + (vesselOfRuin ? " dc-chip-on" : "")} onClick={() => setVesselOfRuin(!vesselOfRuin)}>灾祸之鼎</button>
                </div>
              </div>
            </div>

            {/* 攻守双方状态 */}
            <div className="dc-status-row">
              <StatusPanel
                label="攻击方"
                side="atk"
                status={atkStatus} setStatus={setAtkStatus}
                toxicCounter={atkToxicCounter} setToxicCounter={setAtkToxicCounter}
                stealthRock={atkStealthRock} setStealthRock={setAtkStealthRock}
                spikes={atkSpikes} setSpikes={setAtkSpikes}
                steelsurge={atkSteelsurge} setSteelsurge={setAtkSteelsurge}
                reflect={atkReflect} setReflect={setAtkReflect}
                lightScreen={atkLightScreen} setLightScreen={setAtkLightScreen}
                auroraVeil={atkAuroraVeil} setAuroraVeil={setAtkAuroraVeil}
                protect={atkProtect} setProtect={setAtkProtect}
                helpingHand={atkHelpingHand} setHelpingHand={setAtkHelpingHand}
                tailwind={atkTailwind} setTailwind={setAtkTailwind}
                friendGuard={atkFriendGuard} setFriendGuard={setAtkFriendGuard}
                switchingOut={atkSwitchingOut} setSwitchingOut={setAtkSwitchingOut}
                seeded={atkSeeded} setSeeded={setAtkSeeded}
                saltCured={atkSaltCured} setSaltCured={setAtkSaltCured}
                foresight={atkForesight} setForesight={setAtkForesight}
                flowerGift={atkFlowerGift} setFlowerGift={setAtkFlowerGift}
                powerTrick={atkPowerTrick} setPowerTrick={setAtkPowerTrick}
                steelySpirit={atkSteelySpirit} setSteelySpirit={setAtkSteelySpirit}
                battery={atkBattery} setBattery={setAtkBattery}
                powerSpot={atkPowerSpot} setPowerSpot={setAtkPowerSpot}
                isDynamaxed={atkIsDynamaxed} setIsDynamaxed={setAtkIsDynamaxed}
                alliesFainted={atkAlliesFainted} setAlliesFainted={setAtkAlliesFainted}
                generation={generation}
              />
              <StatusPanel
                label="防守方"
                side="def"
                status={defStatus} setStatus={setDefStatus}
                toxicCounter={defToxicCounter} setToxicCounter={setDefToxicCounter}
                stealthRock={defStealthRock} setStealthRock={setDefStealthRock}
                spikes={defSpikes} setSpikes={setDefSpikes}
                steelsurge={defSteelsurge} setSteelsurge={setDefSteelsurge}
                reflect={defReflect} setReflect={setDefReflect}
                lightScreen={defLightScreen} setLightScreen={setDefLightScreen}
                auroraVeil={defAuroraVeil} setAuroraVeil={setDefAuroraVeil}
                protect={defProtect} setProtect={setDefProtect}
                helpingHand={defHelpingHand} setHelpingHand={setDefHelpingHand}
                tailwind={defTailwind} setTailwind={setDefTailwind}
                friendGuard={defFriendGuard} setFriendGuard={setDefFriendGuard}
                switchingOut={defSwitchingOut} setSwitchingOut={setDefSwitchingOut}
                seeded={defSeeded} setSeeded={setDefSeeded}
                saltCured={defSaltCured} setSaltCured={setDefSaltCured}
                foresight={defForesight} setForesight={setDefForesight}
                flowerGift={defFlowerGift} setFlowerGift={setDefFlowerGift}
                powerTrick={defPowerTrick} setPowerTrick={setDefPowerTrick}
                steelySpirit={defSteelySpirit} setSteelySpirit={setDefSteelySpirit}
                battery={defBattery} setBattery={setDefBattery}
                powerSpot={defPowerSpot} setPowerSpot={setDefPowerSpot}
                isDynamaxed={defIsDynamaxed} setIsDynamaxed={setDefIsDynamaxed}
                alliesFainted={defAlliesFainted} setAlliesFainted={setDefAlliesFainted}
                generation={generation}
              />
            </div>

          </div>

          {/* ═══ 右栏：防守方招式 + 宝可梦 ═══ */}
          <div className="dc-side-col">
            {/* 防守方招式槽位 */}
            {defender.pokemonId && (
              <div className="dc-move-section dc-move-section-side">
                <span className="dc-section-title">防守方招式</span>
                <MoveSlotPanel
                  moves={defMoves}
                  movesInfo={defMovesInfo}
                  selectedIndex={defSelectedSlot}
                  onSelectSlot={handleDefSelectSlot}
                  pokemonId={defender.pokemonId}
                  generation={generation}
                  onSetMove={handleDefSetMove}
                />
                <div className="dc-move-extras">
                  <button className={"dc-chip" + (defCritical ? " dc-chip-on" : "")} onClick={() => setDefCritical(!defCritical)}>暴击</button>
                  <span className="dc-move-extras-sep">|</span>
                  <span className="dc-move-extras-label">连击</span>
                  <input type="number" className="dc-hits-input" min={0} max={10} value={defMoveHits} onChange={(e) => setDefMoveHits(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
                  <span className="dc-hits-hint">{defMoveHits === 0 ? "默认" : `${defMoveHits}次`}</span>
                  <span className="dc-move-extras-sep">|</span>
                  <span className="dc-move-extras-label">已用</span>
                  <input type="number" className="dc-hits-input" min={0} max={10} value={defTimesUsed} onChange={(e) => setDefTimesUsed(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
                </div>
                <div className="dc-move-extras">
                  {Number(generation) === 7 && (
                    <button className={"dc-chip" + (defUseZ ? " dc-chip-on" : "")} onClick={() => setDefUseZ(!defUseZ)}>Z招式</button>
                  )}
                  {Number(generation) === 8 && (
                    <button className={"dc-chip" + (defUseMax ? " dc-chip-on" : "")} onClick={() => setDefUseMax(!defUseMax)}>极巨招式</button>
                  )}
                  {defTeraType === "星晶" && (
                    <button className={"dc-chip" + (defIsStellarFirstUse ? " dc-chip-on" : "")} onClick={() => setDefIsStellarFirstUse(!defIsStellarFirstUse)}>星晶首次</button>
                  )}
                  {(defender.itemName === "节拍器" || defender.itemId === "item-节拍器") && (<>
                  <span className="dc-move-extras-sep">|</span>
                  <span className="dc-move-extras-label">节拍器</span>
                  <input type="number" className="dc-hits-input" min={0} max={10} value={defTimesUsedWithMetronome} onChange={(e) => setDefTimesUsedWithMetronome(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
                  </>)}
                </div>
              </div>
            )}
            <PokemonConfigPanel
              title="防守方"
              member={defender}
              detail={defenderDetail}
              isChampions={isChampions}
              onChange={setDefender}
              onClear={() => { setDefender({ ...createDraftMember(), statMode: isChampions ? "champions" : "classic" }); setDefMoves(["", "", "", ""]); setDefMovesInfo({}); setDefSelectedSlot(null); setResult(null); }}
              boosts={defBoost}
              onBoostChange={(key, val) => setDefBoost((prev) => ({ ...prev, [key]: Math.max(-6, Math.min(6, val)) }))}
              level={level}
              onMovesSync={(cfg) => syncMovesFromConfig(cfg, "def")}
              curHP={defCurHP}
              onCurHPChange={setDefCurHP}
              teraType={defTeraType}
              setTeraType={setDefTeraType}
              generation={generation}
            />
          </div>

        </div>

      </div>
    </section>
  );
}
