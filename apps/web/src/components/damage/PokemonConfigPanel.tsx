import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { STAT_KEYS } from "@pokemon-localdex/store-types/constants";
import type { ImageAsset, PokemonEntry, PokemonSummary } from "@pokemon-localdex/store-types";
import { getStatValue, createStatBlock } from "@pokemon-localdex/store-types";
import type { PokemonConfig } from "../../utils/teamStorage";
import {
  calculateFinalStat,
  createDefaultStats,
  createDraftMember,
  evToSp,
  getPokemonPreviewImage,
} from "../../utils/helpers";
import { api } from "../../utils/api";
import SearchSelect from "../SearchSelect";
import TypeChip from "../TypeChip";
import { getBox, getTeams, resolveTeamMembers } from "../../utils/teamStorage";
import SimplePokemonList from "./SimplePokemonList";
import SimpleStatEditor from "./SimpleStatEditor";
import {
  EV_MAX,
  EV_TOTAL_MAX,
  NATURE_SELECT_OPTIONS,
  SP_TOTAL_MAX,
  TERA_TYPE_OPTIONS,
  spToEv,
} from "./damageConstants";
import type { BoostKey } from "./damageConstants";

//  子组件：宝可梦配置面板（攻击方/防守方通用）
// ══════════════════════════════════════════════════════════════

type FormOption = {
  value: string;
  formId: number;
  label: string;
};

type AbilityItem = {
  id: string;
  name: string;
  isHidden: boolean;
};

type ItemSearchResult = {
  id: number | string;
  nameZh?: string;
  slug?: string;
  imageUrl?: string;
};

export interface PokemonConfigPanelProps {
  title: string;
  member: Partial<PokemonConfig>;
  detail: PokemonEntry | null;
  isChampions: boolean;
  onChange: (member: Partial<PokemonConfig>) => void;
  onClear: () => void;
  boosts: Record<string, number>;
  onBoostChange: (key: BoostKey, value: number) => void;
  level: number;
  onMovesSync?: (cfg: Partial<PokemonConfig>) => void;
  curHP: number;
  onCurHPChange: Dispatch<SetStateAction<number>>;
  teraType: string;
  setTeraType: Dispatch<SetStateAction<string>>;
  generation: string | number;
}

export default function PokemonConfigPanel({
  title,
  member,
  detail,
  isChampions,
  onChange,
  onClear,
  boosts,
  onBoostChange,
  level,
  onMovesSync,
  curHP,
  onCurHPChange,
  teraType,
  setTeraType,
  generation,
}: PokemonConfigPanelProps) {
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTab, setPickerTab] = useState<"search" | "box" | "team">("search");
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<ItemSearchResult[]>([]);
  const [itemOpen, setItemOpen] = useState(false);
  const itemWrapRef = useRef<HTMLDivElement | null>(null);
  const img = member.imageUrl || (detail ? getPokemonPreviewImage(detail) : "") || "";

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
        const updates: Partial<PokemonConfig> = { formId: String(matchedForm.id || ""), formKey: matchedForm.formKey };
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
        onChange({ ...member, formId: String(defaultForm.id), formKey: defaultForm.formKey });
      }
    }
  }, [detail]); // eslint-disable-line react-hooks/exhaustive-deps

  // 形态列表（过滤超极巨化）
  const formOptions = useMemo<FormOption[]>(() => {
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

  const handleFormChange = (formKey: string) => {
    if (!detail) return;
    const forms = detail.forms || [];
    const form = forms.find((f) => f.formKey === formKey) || forms[0];
    if (!form) return;
    const imgs = form.images;
    const officialImg = (imgs?.official || imgs?.sprite || detail.image) as ImageAsset | undefined;
    // 切换形态时默认选中第一个特性
    const formAbilities = form.abilities || [];
    const normalAbilities = formAbilities.filter((ab) => !ab.isHidden);
    const firstAbility = normalAbilities[0] || formAbilities[0];
    const defaultAbilityId = firstAbility?.abilityId ? String(firstAbility.abilityId) : "";
    const defaultAbilityName = firstAbility
      ? (firstAbility.nameZh || "")
      : (detail.abilities?.[0] || "");
    const updates: Partial<PokemonConfig> = {
      formId: String(form.id || ""),
      formKey,
      formName: form.nameZh || form.formKey || "",
      primaryType: form.primaryType || detail.primaryType || "",
      secondaryType: form.secondaryType || detail.secondaryType || "",
      imageUrl: (typeof officialImg === "object" && "url" in officialImg ? officialImg.url : "") || member.imageUrl || "",
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
  const abilityListRef = useRef<AbilityItem[]>([]);
  const abilityList = useMemo<AbilityItem[]>(() => {
    if (!detail) return abilityListRef.current;
    const abilities = currentForm?.abilities || [];
    let result: AbilityItem[];
    if (abilities.length > 0) {
      result = abilities.map((ab) => ({
        id: ab.abilityId ? String(ab.abilityId) : "",
        name: ab.nameZh || String(ab.abilityId || ""),
        isHidden: !!ab.isHidden,
      }));
    } else {
      const topAbilities: AbilityItem[] = (detail.abilities || []).map((a) => ({ id: "", name: a, isHidden: false }));
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
      api<ItemSearchResult[]>(`/items?q=${encodeURIComponent(itemQuery.trim())}&limit=20`).then((r) => {
        setItemResults(r.data || []);
      }).catch(() => setItemResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [itemQuery]);

  // 道具下拉框点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (itemWrapRef.current && !itemWrapRef.current.contains(e.target as Node)) setItemOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handlePickPokemon = (p: PokemonSummary) => {
    const pImg = getPokemonPreviewImage(p);
    onChange({
      ...createDraftMember(undefined),
      pokemonId: String(p.id),
      nameZh: p.nameZh || "",
      primaryType: p.primaryType || "",
      secondaryType: p.secondaryType || "",
      imageUrl: pImg || "",
      statMode: isChampions ? "champions" : "classic",
      sps: isChampions ? createDefaultStats("ev") : undefined,
    });
    setPickerSearch("");
  };

  // 从盒子/队伍配置中选择，带入完整配置（等级、性格、努力值、形态、特性、道具等）
  // 根据当前页面模式（经典/Champions）自动转换 EV↔SP，转换规则与队伍配置页一致
  const handlePickFromConfig = (cfg: Partial<PokemonConfig>) => {
    const draft = createDraftMember(undefined);
    const cfgMode = cfg.statMode || "classic";
    const targetMode = isChampions ? "champions" : "classic";

    let finalIvs = cfg.ivs && Object.keys(cfg.ivs).length > 0 ? cfg.ivs : draft.ivs;
    let finalEvs = cfg.evs && Object.keys(cfg.evs).length > 0 ? cfg.evs : draft.evs;
    let finalSps = cfg.sps && Object.keys(cfg.sps).length > 0 ? cfg.sps : {};
    let finalNature = cfg.nature || cfg.champNature || "认真";

    if (cfgMode === "classic" && targetMode === "champions") {
      // 经典 → Champions：EV 转 SP
      const converted: Record<string, number> = {};
      for (const k of STAT_KEYS) {
        converted[k] = evToSp(getStatValue(finalEvs, k));
      }
      // 总量限制 66
      let t = STAT_KEYS.reduce((s: number, k) => s + (converted[k] || 0), 0);
      if (t > SP_TOTAL_MAX) {
        const scale = SP_TOTAL_MAX / t;
        for (const k of STAT_KEYS) {
          converted[k] = Math.floor(converted[k]! * scale);
        }
      }
      finalSps = converted;
      finalNature = cfg.nature || "认真";
    } else if (cfgMode === "champions" && targetMode === "classic") {
      // Champions → 经典：SP 转 EV
      const converted = createStatBlock(0);
      const sorted = [...STAT_KEYS]
        .filter((k) => getStatValue(finalSps, k) > 0)
        .sort((a, b) => getStatValue(finalSps, b) - getStatValue(finalSps, a));
      let budget = EV_TOTAL_MAX;
      for (const k of sorted) {
        const ideal = spToEv(getStatValue(finalSps, k));
        if (ideal <= budget) {
          converted[k] = ideal;
          budget -= ideal;
        } else {
          converted[k] = Math.min(EV_MAX, Math.floor(budget / 4) * 4);
          budget -= converted[k];
        }
      }
      finalEvs = converted;
      finalIvs = createStatBlock(31);
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
              {boxConfigs.length === 0 && <div className="dc-simple-list-hint">盒子中没有配置，请先在"宝可梦配置"页面添加</div>}
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
              {teams.length === 0 && <div className="dc-simple-list-hint">没有队伍，请先在"我的队伍"页面创建</div>}
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
                          key={String(item.id)}
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
