import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { api, unifiedApi } from "../utils/api.js";
import { STAT_KEYS, NATURE_OPTIONS, NATURE_EFFECTS, GENERATION_OPTIONS } from "../utils/constants.js";
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
const STAT_LABELS = { hp: "HP", atk: "攻击", def: "防御", spa: "特攻", spd: "特防", spe: "速度" };
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
//  子组件：招式搜索选择
// ══════════════════════════════════════════════════════════════

function MoveSearch({ allMoves, generation, onSelect, selectedMove, onSearch, searching }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const filtered = useMemo(() => {
    return allMoves.slice(0, 30);
  }, [allMoves]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (move) => {
    onSelect(move);
    setQuery("");
    setOpen(false);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    if (onSearch) onSearch(val);
  };

  return (
    <div className="dc-move-search" ref={wrapRef}>
      <div className="dc-inline-search-input-wrap">
        <svg className="dc-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" />
        </svg>
        <input
          className="dc-inline-search-input"
          placeholder="搜索招式..."
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
        />
        {query && (
          <button className="dc-inline-search-clear" onClick={() => { setQuery(""); }}>×</button>
        )}
      </div>
      {open && (
        <div className="dc-inline-search-dropdown dc-move-dropdown">
          {searching && <div className="dc-dropdown-hint">搜索中…</div>}
          {!searching && filtered.length === 0 && query.trim() && <div className="dc-dropdown-hint">无匹配招式</div>}
          {!searching && filtered.length === 0 && !query.trim() && <div className="dc-dropdown-hint">输入关键词搜索招式</div>}
          {filtered.map((m) => {
            const record = resolveMoveGenerationRecord(m, generation);
            const type = record?.type || m.type || "";
            const power = record?.power ?? m.power ?? 0;
            const cat = record?.category || m.category || "";
            return (
              <button key={m.slug || m.id} className="dc-dropdown-item dc-move-item" onClick={() => handleSelect(m)}>
                <span className="dc-move-item-name">{m.nameZh || m.slug}</span>
                {type && <TypeChip type={type} size="xs" />}
                <span className="dc-move-item-meta">
                  {cat === "physical" ? "物理" : cat === "special" ? "特殊" : "变化"}
                  {power > 0 && (" 威力" + power)}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {selectedMove && !open && (
        <div className="dc-move-selected">
          <span className="dc-move-selected-name">{selectedMove.nameZh || selectedMove.slug}</span>
          {(() => {
            const record = resolveMoveGenerationRecord(selectedMove, generation);
            const type = record?.type || selectedMove.type || "";
            const power = record?.power ?? selectedMove.power ?? 0;
            const cat = record?.category || selectedMove.category || "";
            return (
              <>
                {type && <TypeChip type={type} size="xs" />}
                <span className="dc-move-selected-meta">
                  {cat === "physical" ? "物理" : cat === "special" ? "特殊" : "变化"}
                  {power > 0 && (" 威力" + power)}
                </span>
              </>
            );
          })()}
          <button className="dc-move-selected-clear" onClick={() => onSelect(null)}>×</button>
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

function PokemonConfigPanel({ title, member, detail, isChampions, onChange, onClear, boosts, onBoostChange, level }) {
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTab, setPickerTab] = useState("search"); // "search" | "box" | "team"
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState([]);
  const [itemOpen, setItemOpen] = useState(false);
  const itemWrapRef = useRef(null);
  const img = member.imageUrl || (detail ? getPokemonPreviewImage(detail)?.url : "") || "";

  // detail 加载后自动设置默认 formId（如果 member 还没有 formId）
  useEffect(() => {
    if (!detail || member.formId) return;
    const forms = detail.forms || [];
    const defaultForm = forms.find((f) => f.isDefault) || forms[0];
    if (defaultForm?.id) {
      onChange({ ...member, formId: defaultForm.id, formKey: defaultForm.formKey });
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
        name: ab.nameZh || ab.abilityId || "",
        isHidden: !!ab.isHidden,
      }));
    } else {
      const topAbilities = (detail.abilities || []).map((a) => ({ name: a, isHidden: false }));
      if (detail.hiddenAbility) topAbilities.push({ name: detail.hiddenAbility, isHidden: true });
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
              </div>
              {/* 特性按钮紧跟属性后面 */}
              <div className="dc-ability-inline">
                {abilityList.length > 0 ? abilityList.map((ab) => (
                  <button
                    key={ab.name}
                    className={"dc-ability-btn" + (member.abilityId === ab.name ? " dc-ability-btn-active" : "") + (ab.isHidden ? " dc-ability-btn-hidden" : "")}
                    onClick={() => onChange({ ...member, abilityId: ab.name, abilityName: ab.name })}
                  >
                    {ab.name}{ab.isHidden ? " (隐)" : ""}
                  </button>
                )) : (
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
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  子组件：状态效果面板
// ══════════════════════════════════════════════════════════════

function StatusPanel({ label, status, setStatus, stealthRock, setStealthRock, spikes, setSpikes,
  reflect, setReflect, lightScreen, setLightScreen, auroraVeil, setAuroraVeil,
  protect, setProtect, helpingHand, setHelpingHand, tailwind, setTailwind,
  switchingOut, setSwitchingOut }) {
  return (
    <div className="dc-status-panel">
      <span className="dc-status-label">{label}状态</span>
      <div className="dc-status-toggles">
        <button className={"dc-toggle" + (status === "burn" ? " dc-toggle-on" : "")} onClick={() => setStatus(status === "burn" ? "none" : "burn")}>烧伤</button>
        <button className={"dc-toggle" + (stealthRock ? " dc-toggle-on" : "")} onClick={() => setStealthRock(!stealthRock)}>隐石</button>
        <button className={"dc-toggle" + (spikes > 0 ? " dc-toggle-on" : "")} onClick={() => setSpikes(spikes >= 3 ? 0 : spikes + 1)}>撒菱{spikes > 0 ? `×${spikes}` : ""}</button>
        <button className={"dc-toggle" + (reflect ? " dc-toggle-on" : "")} onClick={() => setReflect(!reflect)}>反射壁</button>
        <button className={"dc-toggle" + (lightScreen ? " dc-toggle-on" : "")} onClick={() => setLightScreen(!lightScreen)}>光墙</button>
        <button className={"dc-toggle" + (auroraVeil ? " dc-toggle-on" : "")} onClick={() => setAuroraVeil(!auroraVeil)}>极光幕</button>
        <button className={"dc-toggle" + (protect ? " dc-toggle-on" : "")} onClick={() => setProtect(!protect)}>守住</button>
        <button className={"dc-toggle" + (helpingHand ? " dc-toggle-on" : "")} onClick={() => setHelpingHand(!helpingHand)}>帮助</button>
        <button className={"dc-toggle" + (tailwind ? " dc-toggle-on" : "")} onClick={() => setTailwind(!tailwind)}>顺风</button>
        <button className={"dc-toggle" + (switchingOut ? " dc-toggle-on" : "")} onClick={() => setSwitchingOut(!switchingOut)}>换入中</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  主页面
// ══════════════════════════════════════════════════════════════

export default function DamagePage() {
  // ── 世代 ──
  const [generation, setGeneration] = useState("9");
  const isChampions = Number(generation) === 0;

  // ── 攻守双方 ──
  const [attacker, setAttacker] = useState(() => ({ ...createDraftMember(), statMode: "classic" }));
  const [defender, setDefender] = useState(() => ({ ...createDraftMember(), statMode: "classic" }));

  // ── 等级（攻守共享） ──
  const [level, setLevel] = useState(50);

  // ── 招式 ──
  const [selectedMove, setSelectedMove] = useState(null);
  const [critical, setCritical] = useState(false);

  // ── 场地环境 ──
  const [battleMode, setBattleMode] = useState("singles");
  const [weather, setWeather] = useState("none");
  const [terrain, setTerrain] = useState("none");
  const [gravity, setGravity] = useState(false);
  const [magicRoom, setMagicRoom] = useState(false);
  const [wonderRoom, setWonderRoom] = useState(false);

  // ── 攻击方状态 ──
  const [atkStatus, setAtkStatus] = useState("none");
  const [atkStealthRock, setAtkStealthRock] = useState(false);
  const [atkSpikes, setAtkSpikes] = useState(0);
  const [atkReflect, setAtkReflect] = useState(false);
  const [atkLightScreen, setAtkLightScreen] = useState(false);
  const [atkAuroraVeil, setAtkAuroraVeil] = useState(false);
  const [atkProtect, setAtkProtect] = useState(false);
  const [atkHelpingHand, setAtkHelpingHand] = useState(false);
  const [atkTailwind, setAtkTailwind] = useState(false);
  const [atkBoost, setAtkBoost] = useState({ ...DEFAULT_BOOSTS });
  const [atkSwitchingOut, setAtkSwitchingOut] = useState(false);

  // ── 防守方状态 ──
  const [defStatus, setDefStatus] = useState("none");
  const [defStealthRock, setDefStealthRock] = useState(false);
  const [defSpikes, setDefSpikes] = useState(0);
  const [defReflect, setDefReflect] = useState(false);
  const [defLightScreen, setDefLightScreen] = useState(false);
  const [defAuroraVeil, setDefAuroraVeil] = useState(false);
  const [defProtect, setDefProtect] = useState(false);
  const [defHelpingHand, setDefHelpingHand] = useState(false);
  const [defTailwind, setDefTailwind] = useState(false);
  const [defBoost, setDefBoost] = useState({ ...DEFAULT_BOOSTS });
  const [defSwitchingOut, setDefSwitchingOut] = useState(false);

  // ── 计算结果 ──
  const [result, setResult] = useState(null);
  const [calculating, setCalculating] = useState(false);

  // ── 全局数据 ──
  const [allMoves, setAllMoves] = useState([]);
  const [attackerDetail, setAttackerDetail] = useState(null);
  const [defenderDetail, setDefenderDetail] = useState(null);
  const [moveSearching, setMoveSearching] = useState(false);

  // 招式按需搜索（不再一次性全量加载）
  const moveSearchTimer = useRef(null);
  const searchMoves = useCallback((keyword) => {
    if (!keyword || keyword.trim().length === 0) { setAllMoves([]); setMoveSearching(false); return; }
    if (moveSearchTimer.current) clearTimeout(moveSearchTimer.current);
    setMoveSearching(true);
    moveSearchTimer.current = setTimeout(() => {
      unifiedApi("/moves?q=" + encodeURIComponent(keyword.trim())).then((r) => {
        setAllMoves(r.data || []);
      }).catch(() => setAllMoves([])).finally(() => setMoveSearching(false));
    }, 200);
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

  // ── 伤害计算 ──
  const handleCalculate = useCallback(async () => {
    if (!selectedMove) { window.alert("请先选择一个招式"); return; }
    if (!attacker.pokemonId) { window.alert("请选择攻击方宝可梦"); return; }
    if (!defender.pokemonId) { window.alert("请选择防守方宝可梦"); return; }

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
pokemonId: attacker.pokemonId || "",
formId: attacker.formId || "",
name: attacker.nameZh || (attackerDetail?.nameZh) || "",
            level: Number(level || 50),
            nature: attacker.nature || "认真",
            abilityId: attacker.abilityId || "",
            ability: attacker.abilityName || "",
            itemId: attacker.itemId || "",
            item: attacker.itemName || "",
            evs: resolveEvs(attacker),
            ivs: attacker.ivs || {},
            boosts: Object.values(atkBoost).some((v) => v !== 0) ? atkBoost : undefined,
            status: atkStatus !== "none" ? atkStatus : "",
          },
defender: {
pokemonId: defender.pokemonId || "",
formId: defender.formId || "",
name: defender.nameZh || (defenderDetail?.nameZh) || "",
            level: Number(level || 50),
            nature: defender.nature || "认真",
            abilityId: defender.abilityId || "",
            ability: defender.abilityName || "",
            itemId: defender.itemId || "",
            item: defender.itemName || "",
            evs: resolveEvs(defender),
            ivs: defender.ivs || {},
            boosts: Object.values(defBoost).some((v) => v !== 0) ? defBoost : undefined,
          },
          move: {
            id: selectedMove.id || "",
            name: selectedMove.nameZh || selectedMove.slug || "",
            isCrit: critical,
          },
          field: {
            gameType: battleMode,
            weather,
            terrain,
            isGravity: gravity,
            isMagicRoom: magicRoom,
            isWonderRoom: wonderRoom,
            attackerSide: {
              isSR: atkStealthRock,
              spikes: atkSpikes,
              isReflect: atkReflect,
              isLightScreen: atkLightScreen,
              isAuroraVeil: atkAuroraVeil,
              isProtected: atkProtect,
              isHelpingHand: atkHelpingHand,
              isTailwind: atkTailwind,
              isSwitching: atkSwitchingOut ? "out" : undefined,
            },
            defenderSide: {
              isSR: defStealthRock,
              spikes: defSpikes,
              isReflect: defReflect,
              isLightScreen: defLightScreen,
              isAuroraVeil: defAuroraVeil,
              isProtected: defProtect,
              isHelpingHand: defHelpingHand,
              isTailwind: defTailwind,
              isSwitching: defSwitchingOut ? "in" : undefined,
            },
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
        attackerName: attacker.nameZh || "攻击方",
        defenderName: defender.nameZh || "防守方",
        defHp: data.defenderHp || 0,
        minPercent: data.minPercent || 0,
        maxPercent: data.maxPercent || 0,
      });
    } catch (err) {
      window.alert("计算失败: " + (err.message || "未知错误"));
    }
    setCalculating(false);
  }, [selectedMove, attacker, attackerDetail, defender, defenderDetail, generation, isChampions, level,
    critical, battleMode, weather, terrain, gravity, magicRoom, wonderRoom,
    atkStatus, atkStealthRock, atkSpikes, atkReflect, atkLightScreen, atkAuroraVeil,
    atkProtect, atkHelpingHand, atkTailwind, atkBoost, atkSwitchingOut,
    defStealthRock, defSpikes, defReflect, defLightScreen, defAuroraVeil,
    defProtect, defHelpingHand, defTailwind, defBoost, defSwitchingOut]);

  const handleReset = useCallback(() => {
    setAttacker({ ...createDraftMember(), statMode: isChampions ? "champions" : "classic" });
    setDefender({ ...createDraftMember(), statMode: isChampions ? "champions" : "classic" });
    setSelectedMove(null);
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

        {/* ── 三栏主体：攻击方 | 场地+招式+结果 | 防守方 ── */}
        <div className="dc-main-layout">

          {/* ═══ 左栏：攻击方 ═══ */}
          <div className="dc-side-col">
            <PokemonConfigPanel
              title="攻击方"
              member={attacker}
              detail={attackerDetail}
              isChampions={isChampions}
              onChange={setAttacker}
              onClear={() => { setAttacker({ ...createDraftMember(), statMode: isChampions ? "champions" : "classic" }); setResult(null); }}
              boosts={atkBoost}
              onBoostChange={(key, val) => setAtkBoost((prev) => ({ ...prev, [key]: Math.max(-6, Math.min(6, val)) }))}
              level={level}
            />
            {/* 攻击方状态 */}
            <StatusPanel
              label="攻击方"
              status={atkStatus} setStatus={setAtkStatus}
              stealthRock={atkStealthRock} setStealthRock={setAtkStealthRock}
              spikes={atkSpikes} setSpikes={setAtkSpikes}
              reflect={atkReflect} setReflect={setAtkReflect}
              lightScreen={atkLightScreen} setLightScreen={setAtkLightScreen}
              auroraVeil={atkAuroraVeil} setAuroraVeil={setAtkAuroraVeil}
              protect={atkProtect} setProtect={setAtkProtect}
              helpingHand={atkHelpingHand} setHelpingHand={setAtkHelpingHand}
              tailwind={atkTailwind} setTailwind={setAtkTailwind}
              switchingOut={atkSwitchingOut} setSwitchingOut={setAtkSwitchingOut}
            />
          </div>

          {/* ═══ 中栏：场地 + 招式 + 计算结果 ═══ */}
          <div className="dc-center-col">
            {/* 等级 */}
            <div className="dc-level-section">
              <span className="dc-section-title">等级</span>
              <input
                className="dc-level-input"
                type="number"
                min={1}
                max={100}
                value={level}
                onChange={(e) => setLevel(Math.max(1, Math.min(100, Number(e.target.value) || 50)))}
              />
            </div>

            {/* 场地环境 */}
            <div className="dc-field-section">
              <span className="dc-section-title">场地环境</span>
              <div className="dc-field-group">
                {/* 天气切换 */}
                <div className="dc-seg-field">
                  <span className="dc-seg-label">天气</span>
                  <div className="dc-seg-switcher">
                    {[{ v: "sun", l: "晴天" }, { v: "harshSunlight", l: "大日照" }, { v: "rain", l: "雨天" }, { v: "heavyRain", l: "大雨" }, { v: "sand", l: "沙暴" }, { v: "hail", l: "雪" }, { v: "strongWinds", l: "乱流" }].map((w) => (
                      <button key={w.v} className={"dc-seg-btn" + (weather === w.v ? " dc-seg-btn-active" : "")} onClick={() => setWeather(weather === w.v ? "none" : w.v)}>{w.l}</button>
                    ))}
                  </div>
                </div>
                {/* 场地切换 */}
                <div className="dc-seg-field">
                  <span className="dc-seg-label">场地</span>
                  <div className="dc-seg-switcher">
                    {[{ v: "electric", l: "电气" }, { v: "grassy", l: "青草" }, { v: "misty", l: "薄雾" }, { v: "psychic", l: "精神" }].map((t) => (
                      <button key={t.v} className={"dc-seg-btn" + (terrain === t.v ? " dc-seg-btn-active" : "")} onClick={() => setTerrain(terrain === t.v ? "none" : t.v)}>{t.l}</button>
                    ))}
                  </div>
                </div>
                {/* 其他开关 */}
                <div className="dc-field-row">
                  <button className={"dc-toggle" + (gravity ? " dc-toggle-on" : "")} onClick={() => setGravity(!gravity)}>重力</button>
                  <button className={"dc-toggle" + (magicRoom ? " dc-toggle-on" : "")} onClick={() => setMagicRoom(!magicRoom)}>魔法空间</button>
                  <button className={"dc-toggle" + (wonderRoom ? " dc-toggle-on" : "")} onClick={() => setWonderRoom(!wonderRoom)}>奇妙空间</button>
                  <button className={"dc-toggle" + (critical ? " dc-toggle-on" : "")} onClick={() => setCritical(!critical)}>暴击</button>
                </div>
              </div>
            </div>

            {/* 招式选择 + 计算按钮 */}
            <div className="dc-move-section">
              <span className="dc-section-title">招式</span>
              <MoveSearch
                allMoves={allMoves}
                generation={generation}
                selectedMove={selectedMove}
                onSelect={setSelectedMove}
                onSearch={searchMoves}
                searching={moveSearching}
              />
              <button
                className="dc-calc-btn"
                onClick={handleCalculate}
                disabled={calculating || !selectedMove || !attacker.pokemonId || !defender.pokemonId}
              >
                {calculating ? "计算中..." : "计算伤害"}
              </button>
            </div>

            {/* 计算结果 */}
            <div className="dc-result-section">
              {result ? (
                <div className="dc-result-card">
                  <div className="dc-result-headline">
                    <strong>{result.attackerName}</strong>
                    <span> 的 {result.moveName} → </span>
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
                  <div className="dc-result-meta">
                    {result.moveType && <TypeChip type={result.moveType} size="sm" />}
                    <span>{result.category === "physical" ? "物理" : "特殊"}</span>
                  </div>
                  {result.description && (
                    <div className="dc-result-desc"><code>{result.description}</code></div>
                  )}
                </div>
              ) : (
                <div className="dc-result-empty">
                  <p>选择攻守双方宝可梦和招式后点击计算</p>
                </div>
              )}
            </div>
          </div>

          {/* ═══ 右栏：防守方 ═══ */}
          <div className="dc-side-col">
            <PokemonConfigPanel
              title="防守方"
              member={defender}
              detail={defenderDetail}
              isChampions={isChampions}
              onChange={setDefender}
              onClear={() => { setDefender({ ...createDraftMember(), statMode: isChampions ? "champions" : "classic" }); setResult(null); }}
              boosts={defBoost}
              onBoostChange={(key, val) => setDefBoost((prev) => ({ ...prev, [key]: Math.max(-6, Math.min(6, val)) }))}
              level={level}
            />
            {/* 防守方状态 */}
            <StatusPanel
              label="防守方"
              status={defStatus} setStatus={setDefStatus}
              stealthRock={defStealthRock} setStealthRock={setDefStealthRock}
              spikes={defSpikes} setSpikes={setDefSpikes}
              reflect={defReflect} setReflect={setDefReflect}
              lightScreen={defLightScreen} setLightScreen={setDefLightScreen}
              auroraVeil={defAuroraVeil} setAuroraVeil={setDefAuroraVeil}
              protect={defProtect} setProtect={setDefProtect}
              helpingHand={defHelpingHand} setHelpingHand={setDefHelpingHand}
              tailwind={defTailwind} setTailwind={setDefTailwind}
              switchingOut={defSwitchingOut} setSwitchingOut={setDefSwitchingOut}
            />
          </div>

        </div>
      </div>
    </section>
  );
}
