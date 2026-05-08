import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { api, unifiedApi } from "../utils/api.js";
import { GENERATION_OPTIONS, calcTypeEffectiveness } from "../utils/constants.js";
import {
  createDraftMember, createDefaultStats, buildDerivedStats,
  resolveMoveGenerationRecord, getPokemonPreviewImage, evToSp
} from "../utils/helpers.js";
import { getBox, getTeams, resolveTeamMembers } from "../utils/teamStorage.js";
import TypeChip from "../components/TypeChip.jsx";
import FormField from "../components/FormField.jsx";
import SearchInput from "../components/SearchInput.jsx";
import PokemonEditor from "../components/PokemonEditor.jsx";
import Loading from "../components/Loading.jsx";

const SOURCE_MODES = [
  { key: "manual", label: "手动" },
  { key: "box", label: "盒子" },
  { key: "team", label: "队伍" }
];

// ── 子组件：盒子选择器 ──

function BoxSelector({ onSelect }) {
  const [boxConfigs, setBoxConfigs] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setBoxConfigs(getBox());
  }, []);

  if (boxConfigs.length === 0) {
    return (
      <div className="dmg-empty-hint">
        <p>盒子中暂无配置</p>
        <p className="panel-subtitle">前往「队伍」页面添加宝可梦配置</p>
      </div>
    );
  }

  const filtered = search.trim()
    ? boxConfigs.filter((c) => {
        const text = (c.nameZh || "") + " " + (c.pokemonId || "") + " " + (c.configName || "");
        return text.toLowerCase().includes(search.toLowerCase());
      })
    : boxConfigs;

  return (
    <div className="dmg-pick-section">
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="搜索盒子中的宝可梦..."
        size="sm"
      />
      <div className="dmg-pick-list">
        {filtered.map((config) => (
          <button
            key={config.configId}
            className="dmg-pick-item"
            onClick={() => onSelect(config)}
          >
            <strong>{config.nameZh || config.pokemonId}</strong>
            <span className="dmg-pick-meta">
              Lv.{config.level || 50} {config.nature || "认真"}
              {config.configName ? " " + config.configName : ""}
            </span>
          </button>
        ))}
        {filtered.length === 0 && <div className="dmg-empty-hint"><p>无匹配结果</p></div>}
      </div>
    </div>
  );
}

// ── 子组件：队伍选择器 ──

function TeamSelector({ onSelect }) {
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [resolvedMembers, setResolvedMembers] = useState([]);

  useEffect(() => {
    setTeams(getTeams());
  }, []);

  useEffect(() => {
    if (!selectedTeamId) {
      setResolvedMembers([]);
      return;
    }
    const team = teams.find((t) => t.teamId === selectedTeamId);
    if (team) {
      setResolvedMembers(resolveTeamMembers(team));
    }
  }, [selectedTeamId, teams]);

  if (teams.length === 0) {
    return (
      <div className="dmg-empty-hint">
        <p>暂无已保存的队伍</p>
        <p className="panel-subtitle">前往「队伍」页面创建队伍</p>
      </div>
    );
  }

  return (
    <div className="dmg-team-selector">
      <div className="dmg-pick-list">
        {teams.map((team) => (
          <button
            key={team.teamId}
            className={"dmg-pick-item" + (selectedTeamId === team.teamId ? " dmg-pick-item-active" : "")}
            onClick={() => setSelectedTeamId(team.teamId === selectedTeamId ? null : team.teamId)}
          >
            <strong>{team.name || "未命名队伍"}</strong>
            <span className="dmg-pick-meta">
              {team.format === "doubles" ? "双打" : "单打"} {(team.members || []).filter((m) => m.pokemonId).length} 只
            </span>
          </button>
        ))}
      </div>
      {selectedTeamId && resolvedMembers.length > 0 && (
        <div className="dmg-team-members">
          <div className="dmg-pick-list">
            {resolvedMembers.filter((m) => m.pokemonId).map((member, i) => (
              <button
                key={member.configId || i}
                className="dmg-pick-item"
                onClick={() => onSelect(member)}
              >
                <strong>{member.nameZh || member.pokemonId}</strong>
                <span className="dmg-pick-meta">位置 {member.slot || i + 1} Lv.{member.level || 50} {member.nature || "认真"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 子组件：精简宝可梦选择列表 ──

const COMPACT_PAGE_SIZE = 40;

function CompactPokemonPicker({ search = "", onSelect }) {
  const [allData, setAllData] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const listRef = useRef(null);
  const searchRef = useRef(search);

  const loadPage = useCallback(async (currentOffset, query, reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(COMPACT_PAGE_SIZE), offset: String(currentOffset) });
      if (query.trim()) params.set("q", query.trim());
      const r = await unifiedApi("/pokemon?" + params.toString());
      const list = r.data || [];
      if (reset) setAllData(list);
      else setAllData((prev) => [...prev, ...list]);
      setHasMore(list.length >= COMPACT_PAGE_SIZE);
      setOffset(currentOffset + list.length);
    } catch (e) { setHasMore(false); }
    finally { setLoading(false); setInitialLoading(false); }
  }, []);

  useEffect(() => {
    searchRef.current = search;
    setAllData([]);
    setOffset(0);
    setHasMore(true);
    setInitialLoading(true);
    loadPage(0, search, true);
  }, [search, loadPage]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (loading || !hasMore) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
        loadPage(offset, searchRef.current, false);
      }
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [offset, hasMore, loading, loadPage]);

  const BASE = import.meta.env.BASE_URL;

  return (
    <div className="dmg-compact-picker" ref={listRef}>
      {allData.map((p) => {
        const img = getPokemonPreviewImage(p);
        return (
          <button key={p.slug || p.id} className="dmg-compact-item" onClick={() => onSelect(p)}>
            <span className="dmg-compact-img">
              {img && img.url && <img src={img.url} alt="" referrerPolicy="no-referrer" />}
            </span>
            <span className="dmg-compact-name">{p.nameZh || p.slug}</span>
            <span className="dmg-compact-types">
              {p.primaryType && (
                <span className={"type-chip type-" + p.primaryType}>
                  <img className="type-chip-icon" src={BASE + "assets/type-icons/type-" + p.primaryType + "@sm.png"} alt="" />
                  {p.primaryType}
                </span>
              )}
              {p.secondaryType && (
                <span className={"type-chip type-" + p.secondaryType}>
                  <img className="type-chip-icon" src={BASE + "assets/type-icons/type-" + p.secondaryType + "@sm.png"} alt="" />
                  {p.secondaryType}
                </span>
              )}
            </span>
          </button>
        );
      })}
      {initialLoading && <div className="dmg-compact-empty">加载中...</div>}
      {!initialLoading && allData.length === 0 && <div className="dmg-compact-empty">没有找到匹配的宝可梦</div>}
      {loading && !initialLoading && <div className="dmg-compact-empty">加载更多...</div>}
    </div>
  );
}

// ── 子组件：来源选择面板（攻击方/防守方通用） ──

function DamageSourcePanel({ title, side, mode, onModeChange, onConfigChange, onImportConfig, panelKey }) {
  const [pickerSearch, setPickerSearch] = useState("");
  const formPortalId = "cfg-form-slider-portal-" + panelKey;

  const handlePickerSelect = (p) => {
    const img = getPokemonPreviewImage(p);
    onConfigChange({
      ...createDraftMember(),
      pokemonId: p.slug || String(p.id),
      nameZh: p.nameZh || "",
      primaryType: p.primaryType || "",
      secondaryType: p.secondaryType || "",
      imageUrl: img ? img.url || "" : "",
    });
    setPickerSearch("");
  };

  const handleChangePokemon = () => {
    onConfigChange({
      ...side,
      pokemonId: "",
      nameZh: "",
      formKey: "",
      formName: "",
    });
    setPickerSearch("");
  };

  return (
    <div className="dmg-source-panel">
      <div className="dmg-source-header">
        <strong>{title}</strong>
        {side.nameZh && <span className="dmg-chip">{side.nameZh}</span>}
      </div>

      <div className="dmg-mode-tabs">
        {SOURCE_MODES.map((m) => (
          <button
            key={m.key}
            className={"dmg-mode-tab" + (mode === m.key ? " dmg-mode-tab-active" : "")}
            onClick={() => onModeChange(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="dmg-source-body">
        {mode === "manual" && (
          <>
            {!side.pokemonId ? (
              <div className="dmg-picker-wrap">
                <div className="cfg-toolbar-search">
                  <svg className="cfg-toolbar-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" />
                  </svg>
                  <input
                    className="cfg-toolbar-search-input"
                    placeholder="搜索宝可梦名称 / 编号..."
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    autoFocus
                  />
                  {pickerSearch && (
                    <button className="cfg-toolbar-search-clear" onClick={() => setPickerSearch("")}>x</button>
                  )}
                </div>
                <CompactPokemonPicker search={pickerSearch} onSelect={handlePickerSelect} />
              </div>
            ) : (
              <div className="dmg-editor-wrap">
                <div className="cfg-toolbar-pokemon">
                  <span className="cfg-toolbar-pokemon-name">{side.nameZh || side.pokemonId}</span>
                  <span id={formPortalId}></span>
                  <button className="cfg-toolbar-pokemon-change" onClick={handleChangePokemon}>更换</button>
                </div>
                <PokemonEditor
                  key={side.pokemonId + "-" + (side.formKey || "") + "-" + (side.configId || "")}
                  config={side}
                  onChange={onConfigChange}
                  onSave={() => {}}
                />
              </div>
            )}
          </>
        )}
        {mode === "box" && <BoxSelector onSelect={onImportConfig} />}
        {mode === "team" && <TeamSelector onSelect={onImportConfig} />}
      </div>
    </div>
  );
}


// ====================================================
//  主页面 - Pokemon Showdown 风格布局
//  顶部：左右两侧招式伤害预览 + 中间计算结果
//  下方三栏：左Pokemon1配置 | 中Field | 右Pokemon2配置
// ====================================================

export default function DamagePage({ teamDraft }) {
  // ── 攻守双方状态 ──
  const [attacker, setAttacker] = useState(createDraftMember());
  const [defender, setDefender] = useState(createDraftMember());
  const [attackerMode, setAttackerMode] = useState("manual");
  const [defenderMode, setDefenderMode] = useState("manual");

  // ── 战斗环境 ──
  const [battleMode, setBattleMode] = useState("singles"); // singles | doubles
  const [weather, setWeather] = useState("none");
  const [terrain, setTerrain] = useState("none");
  const [gravity, setGravity] = useState(false);
  const [magicRoom, setMagicRoom] = useState(false);
  const [wonderRoom, setWonderRoom] = useState(false);

  // ── 攻击方场地效果 ──
  const [atkStatus, setAtkStatus] = useState("none");
  const [atkStealthRock, setAtkStealthRock] = useState(false);
  const [atkSpikes, setAtkSpikes] = useState(0);
  const [atkReflect, setAtkReflect] = useState(false);
  const [atkLightScreen, setAtkLightScreen] = useState(false);
  const [atkProtect, setAtkProtect] = useState(false);
  const [atkLeechSeed, setAtkLeechSeed] = useState(false);
  const [atkSaltCure, setAtkSaltCure] = useState(false);
  const [atkHelpingHand, setAtkHelpingHand] = useState(false);
  const [atkTailwind, setAtkTailwind] = useState(false);
  const [atkPowerTrick, setAtkPowerTrick] = useState(false);
  const [atkFriendGuard, setAtkFriendGuard] = useState(false);
  const [atkAuroraVeil, setAtkAuroraVeil] = useState(false);
  const [atkBoost, setAtkBoost] = useState(false);
  const [atkSwitchingOut, setAtkSwitchingOut] = useState(false);

  // ── 防守方场地效果 ──
  const [defStatus, setDefStatus] = useState("none");
  const [defStealthRock, setDefStealthRock] = useState(false);
  const [defSpikes, setDefSpikes] = useState(0);
  const [defReflect, setDefReflect] = useState(false);
  const [defLightScreen, setDefLightScreen] = useState(false);
  const [defProtect, setDefProtect] = useState(false);
  const [defLeechSeed, setDefLeechSeed] = useState(false);
  const [defSaltCure, setDefSaltCure] = useState(false);
  const [defHelpingHand, setDefHelpingHand] = useState(false);
  const [defTailwind, setDefTailwind] = useState(false);
  const [defPowerTrick, setDefPowerTrick] = useState(false);
  const [defFriendGuard, setDefFriendGuard] = useState(false);
  const [defAuroraVeil, setDefAuroraVeil] = useState(false);
  const [defBoost, setDefBoost] = useState(false);
  const [defSwitchingOut, setDefSwitchingOut] = useState(false);

  // ── 招式与修正 ──
  const [moveId, setMoveId] = useState("");
  const [moveGeneration, setMoveGeneration] = useState("9");
  const [moveName, setMoveName] = useState("");
  const [moveType, setMoveType] = useState("");
  const [power, setPower] = useState(0);
  const [critical, setCritical] = useState(false);
  const [result, setResult] = useState(null);

  // ── 全局数据 ──
  const [allMoves, setAllMoves] = useState([]);
  const [attackerDetail, setAttackerDetail] = useState(null);
  const [defenderDetail, setDefenderDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    unifiedApi("/moves").then((r) => {
      setAllMoves(r.data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!attacker.pokemonId) { setAttackerDetail(null); return; }
    let cancelled = false;
    unifiedApi("/pokemon/" + encodeURIComponent(attacker.pokemonId)).then((r) => {
      if (!cancelled) setAttackerDetail(r.data);
    }).catch(() => { if (!cancelled) setAttackerDetail(null); });
    return () => { cancelled = true; };
  }, [attacker.pokemonId]);

  useEffect(() => {
    if (!defender.pokemonId) { setDefenderDetail(null); return; }
    let cancelled = false;
    unifiedApi("/pokemon/" + encodeURIComponent(defender.pokemonId)).then((r) => {
      if (!cancelled) setDefenderDetail(r.data);
    }).catch(() => { if (!cancelled) setDefenderDetail(null); });
    return () => { cancelled = true; };
  }, [defender.pokemonId]);

  const attackerBattle = useMemo(() => ({
    member: attacker,
    detail: attackerDetail,
    derivedStats: buildDerivedStats(attacker, attackerDetail)
  }), [attacker, attackerDetail]);

  const defenderBattle = useMemo(() => ({
    member: defender,
    detail: defenderDetail,
    derivedStats: buildDerivedStats(defender, defenderDetail)
  }), [defender, defenderDetail]);

  const selectedMove = useMemo(
    () => allMoves.find((m) => m.id === moveId || m.slug === moveId || m.nameZh === moveName),
    [allMoves, moveId, moveName]
  );

  const selectedMoveRecord = useMemo(
    () => selectedMove ? resolveMoveGenerationRecord(selectedMove, moveGeneration) : null,
    [selectedMove, moveGeneration]
  );

  const category = useMemo(
    () => selectedMoveRecord ? selectedMoveRecord.category : (selectedMove ? selectedMove.category : "physical"),
    [selectedMoveRecord, selectedMove]
  );

  const typeEffectiveness = useMemo(() => {
    const atkType = (selectedMoveRecord && selectedMoveRecord.type) || (selectedMove && selectedMove.type) || moveType;
    const defPrimary = (defenderDetail && defenderDetail.primaryType) || defender.primaryType;
    const defSecondary = (defenderDetail && defenderDetail.secondaryType) || defender.secondaryType;
    return calcTypeEffectiveness(atkType, defPrimary, defSecondary);
  }, [selectedMoveRecord, selectedMove, moveType, defenderDetail, defender.primaryType, defender.secondaryType]);

  const applyMove = useCallback((move, gen) => {
    const record = resolveMoveGenerationRecord(move, gen);
    setMoveId(move ? (move.slug || move.id || "") : "");
    setMoveName(move ? (move.nameZh || "") : "");
    setMoveType(record ? (record.type || (move && move.type) || "") : (move ? move.type || "" : ""));
    setPower(record ? (record.power != null ? record.power : (move ? move.power || 0 : 0)) : (move ? move.power || 0 : 0));
    setResult(null);
  }, []);

  const importConfig = useCallback((setter, modeSetter) => (config) => {
    setter({
      ...createDraftMember(),
      configId: config.configId || "",
      pokemonId: config.pokemonId || "",
      nameZh: config.nameZh || "",
      configName: config.configName || "",
      formKey: config.formKey || "",
      formName: config.formName || "",
      primaryType: config.primaryType || "",
      secondaryType: config.secondaryType || "",
      imageUrl: config.imageUrl || "",
      shinyImageUrl: config.shinyImageUrl || "",
      isShiny: config.isShiny || false,
      level: config.level || 50,
      itemId: config.itemId || "",
      itemImageUrl: config.itemImageUrl || "",
      abilityId: config.abilityId || "",
      nature: config.nature || "认真",
      moves: [...(config.moves || []), "", "", "", ""].slice(0, 4),
      ivs: { ...createDefaultStats("iv"), ...(config.ivs || {}) },
      evs: { ...createDefaultStats("ev"), ...(config.evs || {}) },
      statMode: config.statMode || "classic",
      sps: config.sps || {},
      champNature: config.champNature || config.nature || "认真",
    });
    modeSetter("manual");
    setResult(null);
  }, []);

  // ── 环境修正系数计算 ──
  const envModifiers = useMemo(() => {
    var weatherMod = 1;
    var weatherDesc = "无";
    if (weather === "sun") {
      weatherMod = moveType === "火" ? 1.5 : moveType === "水" ? 0.5 : 1;
      weatherDesc = "晴天";
    } else if (weather === "rain") {
      weatherMod = moveType === "水" ? 1.5 : moveType === "火" ? 0.5 : 1;
      weatherDesc = "雨天";
    } else if (weather === "sand") {
      weatherDesc = "沙暴";
    } else if (weather === "hail") {
      weatherDesc = "冰雹/雪";
    }

    var terrainMod = 1;
    var terrainDesc = "无";
    if (terrain === "electric" && moveType === "电" && category !== "status") {
      terrainMod = 1.3; terrainDesc = "电气场地(+30%)";
    } else if (terrain === "grassy" && moveType === "草" && category !== "status") {
      terrainMod = 1.3; terrainDesc = "青草场地(+30%)";
    } else if (terrain === "psychic" && moveType === "超能力" && category !== "status") {
      terrainMod = 1.3; terrainDesc = "精神场地(+30%)";
    } else if (terrain === "misty" && moveType === "龙") {
      terrainMod = 0.5; terrainDesc = "薄雾场地(-50%)";
    } else if (terrain !== "none") {
      var terrainNames = { electric: "电气场地", grassy: "青草场地", psychic: "精神场地", misty: "薄雾场地" };
      terrainDesc = terrainNames[terrain] || "无";
    }

    var screenMod = 1;
    var screenDesc = "无";
    if (defReflect && category === "physical") {
      screenMod = battleMode === "doubles" ? 2/3 : 0.5; screenDesc = "反射壁";
    } else if (defLightScreen && category === "special") {
      screenMod = battleMode === "doubles" ? 2/3 : 0.5; screenDesc = "光墙";
    } else if (defAuroraVeil) {
      screenMod = battleMode === "doubles" ? 2/3 : 0.5; screenDesc = "极光幕";
    }

    var statusMod = 1;
    var statusDesc = "无";
    if (atkStatus === "burn" && category === "physical") {
      statusMod = 0.5; statusDesc = "烧伤(-50%物攻)";
    } else if (atkStatus === "burn") {
      statusDesc = "烧伤(不影响特攻)";
    }

    var helpMod = atkHelpingHand ? 1.5 : 1;
    var protectMod = defProtect ? 0.25 : 1;
    var friendGuardMod = defFriendGuard ? 0.75 : 1;

    return { weatherMod, weatherDesc, terrainMod, terrainDesc, screenMod, screenDesc, statusMod, statusDesc, helpMod, protectMod, friendGuardMod };
  }, [weather, terrain, defReflect, defLightScreen, defAuroraVeil, atkStatus, atkHelpingHand, defProtect, defFriendGuard, moveType, category, battleMode]);

  // ── 通用伤害计算函数（使用 @smogon/calc 引擎） ──
  const calcMoveDamage = useCallback(async (atkMember, atkDetail, defMember, defDetail, move) => {
    if (!atkDetail || !defDetail) {
      window.alert("当前选中的宝可梦缺少数据，暂时无法计算。");
      return null;
    }

    var record = resolveMoveGenerationRecord(move, moveGeneration);
    var mType = record ? (record.type || move.type || "") : (move.type || "");
    var cat = record ? (record.category || move.category || "physical") : (move.category || "physical");

    // Champions模式下，优先使用sps作为evs，否则将evs通过evToSp转换
    var isChampions = Number(moveGeneration) === 0;
    function resolveEvs(member) {
      if (!isChampions) return member.evs || {};
      // Champions模式：优先用sps
      if (member.sps && Object.keys(member.sps).length > 0) {
        return member.sps;
      }
      // 没有sps则将evs转换
      var evs = member.evs || {};
      var converted = {};
      for (var key of Object.keys(evs)) {
        converted[key] = evToSp(evs[key]);
      }
      return converted;
    }

    // 构建新版请求体
    var calcResult = await api("/battle/damage", {
      method: "POST",
      body: JSON.stringify({
        generation: moveGeneration !== "" ? Number(moveGeneration) : 9,
        attacker: {
          name: atkMember.nameZh || (atkDetail && atkDetail.nameZh) || "",
          formKey: atkMember.formKey || "",
          level: Number(atkMember.level || 50),
          nature: atkMember.nature || "认真",
          ability: atkMember.abilityId || "",
          item: atkMember.itemId || "",
          evs: resolveEvs(atkMember),
          ivs: atkMember.ivs || {},
          boosts: atkBoost ? { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 } : undefined,
          status: atkStatus !== "none" ? atkStatus : "",
        },
        defender: {
          name: defMember.nameZh || (defDetail && defDetail.nameZh) || "",
          formKey: defMember.formKey || "",
          level: Number(defMember.level || 50),
          nature: defMember.nature || "认真",
          ability: defMember.abilityId || "",
          item: defMember.itemId || "",
          evs: resolveEvs(defMember),
          ivs: defMember.ivs || {},
          boosts: defBoost ? { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 } : undefined,
        },
        move: {
          name: move.nameZh || move.slug || "",
          isCrit: critical,
        },
        field: {
          gameType: battleMode,
          weather: weather,
          terrain: terrain,
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
            isSeeded: atkLeechSeed,
            isSaltCured: atkSaltCure,
            isTailwind: atkTailwind,
            isHelpingHand: atkHelpingHand,
            isPowerTrick: atkPowerTrick,
            isFriendGuard: atkFriendGuard,
            isSwitching: atkSwitchingOut ? "out" : undefined,
          },
          defenderSide: {
            isSR: defStealthRock,
            spikes: defSpikes,
            isReflect: defReflect,
            isLightScreen: defLightScreen,
            isAuroraVeil: defAuroraVeil,
            isProtected: defProtect,
            isSeeded: defLeechSeed,
            isSaltCured: defSaltCure,
            isTailwind: defTailwind,
            isHelpingHand: defHelpingHand,
            isPowerTrick: defPowerTrick,
            isFriendGuard: defFriendGuard,
            isSwitching: defSwitchingOut ? "in" : undefined,
          },
        },
      })
    });

    var data = calcResult.data;
    var te = calcTypeEffectiveness(mType, defDetail && defDetail.primaryType, defDetail && defDetail.secondaryType);

    return {
      min: data.min,
      max: data.max,
      average: data.average,
      description: data.description || "",
      damageRolls: data.damageRolls || [],
      moveName: move.nameZh || move.slug || "",
      moveType: mType,
      category: cat,
      typeEffectiveness: te,
      attackerName: atkMember.nameZh || (atkDetail && atkDetail.nameZh) || "Pokemon 1",
      defenderName: defMember.nameZh || (defDetail && defDetail.nameZh) || "Pokemon 2",
      defHp: data.defenderHp || 0,
      minPercent: data.minPercent || 0,
      maxPercent: data.maxPercent || 0,
    };
  }, [moveGeneration, critical, battleMode, weather, terrain, gravity, magicRoom, wonderRoom,
    atkStatus, atkStealthRock, atkSpikes, atkReflect, atkLightScreen, atkAuroraVeil,
    atkProtect, atkLeechSeed, atkSaltCure, atkHelpingHand, atkTailwind, atkPowerTrick,
    atkFriendGuard, atkBoost, atkSwitchingOut,
    defStealthRock, defSpikes, defReflect, defLightScreen, defAuroraVeil,
    defProtect, defLeechSeed, defSaltCure, defHelpingHand, defTailwind, defPowerTrick,
    defFriendGuard, defBoost, defSwitchingOut]);

  // ── 计算当前选中招式 ──
  const handleCalculate = useCallback(async () => {
    if (!selectedMove) {
      window.alert("请先选择一个招式");
      return;
    }
    var r = await calcMoveDamage(attacker, attackerDetail, defender, defenderDetail, selectedMove);
    if (r) setResult(r);
  }, [selectedMove, attacker, attackerDetail, defender, defenderDetail, calcMoveDamage]);

  // ── 招式预览计算（纯前端，不调接口） ──
  const makePreview = useCallback((mName, atkMember, atkDet, defMember, defDet) => {
    var atkDerived = buildDerivedStats(atkMember, atkDet);
    var defDerived = buildDerivedStats(defMember, defDet);
    if (!atkDerived || !defDerived) return null;
    var move = allMoves.find((m) => m.nameZh === mName || m.slug === mName);
    if (!move) return null;
    var record = resolveMoveGenerationRecord(move, moveGeneration);
    var pw = record ? (record.power != null ? record.power : (move.power || 0)) : (move.power || 0);
    if (pw <= 0) return "--";
    var cat = record ? (record.category || move.category || "physical") : (move.category || "physical");
    var atkStat = cat === "physical" ? atkDerived.atk : atkDerived.spa;
    var defStat = cat === "physical" ? defDerived.def : defDerived.spd;
    var lv = Number(atkMember.level || 50);
    var base = Math.floor(Math.floor(Math.floor((2 * lv / 5 + 2) * pw * atkStat / Math.max(1, defStat)) / 50) + 2);
    var mType = record ? (record.type || move.type || "") : (move.type || "");
    var attackerTypes = [atkDet && atkDet.primaryType, atkDet && atkDet.secondaryType].filter(Boolean);
    var stab = attackerTypes.includes(mType) ? 1.5 : 1;
    var te = calcTypeEffectiveness(mType, defDet && defDet.primaryType, defDet && defDet.secondaryType);
    var minDmg = Math.floor(base * stab * te * 0.85);
    var maxDmg = Math.floor(base * stab * te * 1.0);
    var defHp = defDerived.hp || 1;
    var minPct = ((minDmg / defHp) * 100).toFixed(1);
    var maxPct = ((maxDmg / defHp) * 100).toFixed(1);
    return minPct + " - " + maxPct + "%";
  }, [allMoves, moveGeneration]);

  // ── 攻击方招式预览 ──
  var atkMoveNames = (attacker.moves || []).filter(Boolean);
  var defMoveNames = (defender.moves || []).filter(Boolean);

  var atkMovePreviews = useMemo(() => {
    return atkMoveNames.map((name) => ({
      name: name,
      range: makePreview(name, attacker, attackerDetail, defender, defenderDetail)
    }));
  }, [atkMoveNames.join(","), attacker, attackerDetail, defender, defenderDetail, makePreview]);

  var defMovePreviews = useMemo(() => {
    return defMoveNames.map((name) => ({
      name: name,
      range: makePreview(name, defender, defenderDetail, attacker, attackerDetail)
    }));
  }, [defMoveNames.join(","), defender, defenderDetail, attacker, attackerDetail, makePreview]);

  // ── 点击招式按钮 ──
  const handleMoveClick = useCallback((mName, side) => {
    var move = allMoves.find((m) => m.nameZh === mName || m.slug === mName);
    if (!move) return;
    applyMove(move, moveGeneration);
    if (side === "right") {
      calcMoveDamage(defender, defenderDetail, attacker, attackerDetail, move).then((r) => {
        if (r) setResult(r);
      });
    } else {
      calcMoveDamage(attacker, attackerDetail, defender, defenderDetail, move).then((r) => {
        if (r) setResult(r);
      });
    }
  }, [allMoves, moveGeneration, applyMove, calcMoveDamage, attacker, attackerDetail, defender, defenderDetail]);

  const handleReset = useCallback(() => {
    setAttacker(createDraftMember());
    setDefender(createDraftMember());
    setAttackerMode("manual");
    setDefenderMode("manual");
    setResult(null);
  }, []);

  if (loading) return <Loading />;

  return (
    <section className="view-grid">
      <div className="panel dmg-page-panel">
        {/* 页面标题 */}
        <div className="panel-header">
          <div>
            <h2 className="panel-title">伤害计算器</h2>
            <p className="panel-subtitle">点击招式快速计算</p>
          </div>
          <div className="toolbar-row">
            <FormField label="世代" type="select" value={moveGeneration} onChange={(v) => {
              setMoveGeneration(v);
              if (selectedMove) applyMove(selectedMove, v);
              setResult(null);
            }} options={[...GENERATION_OPTIONS.map((g) => ({ value: g, label: g + "世代" })), { value: 0, label: "Champions" }]} />
            <button className="dmg-toolbar-btn" onClick={handleReset}>重置</button>
          </div>
        </div>

        {/* ====== 上方：左右招式预览 + 中间结果 ====== */}
        <div className="dmg-top-section">
          {/* 左侧：Pokemon 1 招式预览 */}
          <div className="dmg-moves-col">
            <div className="dmg-moves-title">
              <strong>{attacker.nameZh || "Pokemon 1"}</strong> 的招式
              <span className="dmg-moves-hint">（点击计算）</span>
            </div>
            <div className="dmg-moves-list">
              {atkMovePreviews.length > 0 ? atkMovePreviews.map((mp, i) => (
                <button
                  key={i}
                  className={"dmg-move-btn" + (moveName === mp.name ? " dmg-move-btn-active" : "")}
                  onClick={() => handleMoveClick(mp.name, "left")}
                >
                  <span className="dmg-move-btn-name">{mp.name}</span>
                  <span className="dmg-move-btn-range">{mp.range || "--"}</span>
                </button>
              )) : (
                <div className="dmg-moves-empty">配置宝可梦后显示招式</div>
              )}
            </div>
          </div>

          {/* 中间：计算结果 */}
          <div className="dmg-result-col">
            {result ? (
              <div className="dmg-result-detail">
                <div className="dmg-result-summary-text">
                  <strong>{result.attackerName}</strong>
                  {" "}{result.moveName || moveName || "招式"}{" vs. "}
                  <strong>{result.defenderName}</strong>:
                  {" "}{result.min} - {result.max}
                  {result.defHp > 0 && " (" + ((result.min / result.defHp) * 100).toFixed(1) + " - " + ((result.max / result.defHp) * 100).toFixed(1) + "%)"}
                </div>

                {result.moveType && (
                  <div className="dmg-move-auto-info">
                    <TypeChip type={result.moveType} />
                    <span className="dmg-auto-tag">威力 <strong>{power}</strong></span>
                    <span className="dmg-auto-tag">{result.category === "physical" ? "物理" : "特殊"}</span>
                    <span className={"dmg-auto-tag" + (result.typeEffectiveness !== 1 ? " dmg-auto-tag-highlight" : "")}>
                      克制 <strong>{result.typeEffectiveness}x</strong>
                      {result.typeEffectiveness === 0 && " (无效)"}
                      {result.typeEffectiveness > 1 && " (效果拔群)"}
                      {result.typeEffectiveness > 0 && result.typeEffectiveness < 1 && " (效果不好)"}
                    </span>
                  </div>
                )}

                <div className="dmg-result-numbers">
                  <div className="dmg-result-num">
                    <span className="dmg-result-num-label">最小</span>
                    <span className="dmg-result-num-value">{result.min}</span>
                  </div>
                  <div className="dmg-result-num dmg-result-num-main">
                    <span className="dmg-result-num-label">平均</span>
                    <span className="dmg-result-num-value">{result.average}</span>
                  </div>
                  <div className="dmg-result-num">
                    <span className="dmg-result-num-label">最大</span>
                    <span className="dmg-result-num-value">{result.max}</span>
                  </div>
                </div>

                {result.description && (
                  <div className="dmg-result-formula">
                    <code>{result.description}</code>
                  </div>
                )}
              </div>
            ) : (
<div className="dmg-result-placeholder">
<p>点击左右两侧招式按钮快速计算</p>
</div>
            )}
          </div>

          {/* 右侧：Pokemon 2 招式预览 */}
          <div className="dmg-moves-col">
            <div className="dmg-moves-title">
              <strong>{defender.nameZh || "Pokemon 2"}</strong> 的招式
              <span className="dmg-moves-hint">（点击计算）</span>
            </div>
            <div className="dmg-moves-list">
              {defMovePreviews.length > 0 ? defMovePreviews.map((mp, i) => (
                <button
                  key={i}
                  className={"dmg-move-btn" + (moveName === mp.name ? " dmg-move-btn-active" : "")}
                  onClick={() => handleMoveClick(mp.name, "right")}
                >
                  <span className="dmg-move-btn-name">{mp.name}</span>
                  <span className="dmg-move-btn-range">{mp.range || "--"}</span>
                </button>
              )) : (
                <div className="dmg-moves-empty">配置宝可梦后显示招式</div>
              )}
            </div>
          </div>
        </div>


        {/* ====== 下方三栏：左Pokemon1 | 中Field | 右Pokemon2 ====== */}
        <div className="dmg-three-col">

          {/* --- 左栏：Pokemon 1 --- */}
          <div className="dmg-col dmg-col-left">
            <DamageSourcePanel
              title="Pokemon 1"
              panelKey="atk"
              side={attacker}
              mode={attackerMode}
              onModeChange={setAttackerMode}
              onConfigChange={(updater) => {
                setAttacker((prev) => {
                  var next = typeof updater === "function" ? updater(prev) : updater;
                  return { ...next, nameZh: next.nameZh || prev.nameZh };
                });
                setResult(null);
              }}
              onImportConfig={importConfig(setAttacker, setAttackerMode)}
            />
          </div>

          {/* --- 中栏：Field --- */}
          <div className="dmg-col dmg-col-center">
            <div className="dmg-field-card">
              <strong className="dmg-section-title">场地环境</strong>

              {/* 对战模式 */}
              <div className="dmg-field-toggle-row">
                <button className={"dmg-toggle-btn" + (battleMode === "singles" ? " dmg-toggle-active" : "")} onClick={() => setBattleMode("singles")}>单打</button>
                <button className={"dmg-toggle-btn" + (battleMode === "doubles" ? " dmg-toggle-active" : "")} onClick={() => setBattleMode("doubles")}>双打</button>
              </div>

              {/* 场地 */}
              <div className="dmg-field-toggle-row">
                {[
                  { value: "electric", label: "电气" },
                  { value: "grassy", label: "青草" },
                  { value: "misty", label: "薄雾" },
                  { value: "psychic", label: "精神" },
                ].map((t) => (
                  <button key={t.value} className={"dmg-toggle-btn" + (terrain === t.value ? " dmg-toggle-active" : "")} onClick={() => setTerrain(terrain === t.value ? "none" : t.value)}>{t.label}</button>
                ))}
              </div>

              {/* 天气 */}
              <div className="dmg-field-toggle-row">
                {[
                  { value: "none", label: "无" },
                  { value: "sun", label: "晴天" },
                  { value: "rain", label: "雨天" },
                  { value: "sand", label: "沙暴" },
                  { value: "hail", label: "雪" },
                ].map((w) => (
                  <button key={w.value} className={"dmg-toggle-btn" + (weather === w.value ? " dmg-toggle-active" : "")} onClick={() => setWeather(w.value)}>{w.label}</button>
                ))}
              </div>

              {/* 房间 */}
              <div className="dmg-field-toggle-row">
                <button className={"dmg-toggle-btn" + (magicRoom ? " dmg-toggle-active" : "")} onClick={() => setMagicRoom(!magicRoom)}>魔法空间</button>
                <button className={"dmg-toggle-btn" + (wonderRoom ? " dmg-toggle-active" : "")} onClick={() => setWonderRoom(!wonderRoom)}>奇妙空间</button>
              </div>

              {/* 重力 / 暴击 */}
              <div className="dmg-field-toggle-row">
                <button className={"dmg-toggle-btn" + (gravity ? " dmg-toggle-active" : "")} onClick={() => setGravity(!gravity)}>重力</button>
                <button className={"dmg-toggle-btn" + (critical ? " dmg-toggle-active" : "")} onClick={() => setCritical(!critical)}>暴击</button>
              </div>

              {/* ── 两侧效果 ── */}
              <div className="dmg-field-sides">
                {/* 攻击方 */}
                <div className="dmg-field-side">
                  <span className="dmg-field-side-label">攻击方</span>
                  <div className="dmg-field-toggle-row">
                    <button className={"dmg-toggle-btn" + (atkStealthRock ? " dmg-toggle-active" : "")} onClick={() => setAtkStealthRock(!atkStealthRock)}>隐蔽岩石</button>
                  </div>
                  <div className="dmg-field-toggle-row">
                    {[0, 1, 2, 3].map((n) => (
                      <button key={n} className={"dmg-toggle-btn" + (atkSpikes === n ? " dmg-toggle-active" : "")} onClick={() => setAtkSpikes(n)}>{n} 撒菱</button>
                    ))}
                  </div>
                  <div className="dmg-field-toggle-row">
                    <button className={"dmg-toggle-btn" + (atkReflect ? " dmg-toggle-active" : "")} onClick={() => setAtkReflect(!atkReflect)}>反射壁</button>
                    <button className={"dmg-toggle-btn" + (atkLightScreen ? " dmg-toggle-active" : "")} onClick={() => setAtkLightScreen(!atkLightScreen)}>光墙</button>
                    <button className={"dmg-toggle-btn" + (atkAuroraVeil ? " dmg-toggle-active" : "")} onClick={() => setAtkAuroraVeil(!atkAuroraVeil)}>极光幕</button>
                  </div>
                  <div className="dmg-field-toggle-row">
                    <button className={"dmg-toggle-btn" + (atkProtect ? " dmg-toggle-active" : "")} onClick={() => setAtkProtect(!atkProtect)}>守住</button>
                    <button className={"dmg-toggle-btn" + (atkLeechSeed ? " dmg-toggle-active" : "")} onClick={() => setAtkLeechSeed(!atkLeechSeed)}>寄生种子</button>
                    <button className={"dmg-toggle-btn" + (atkSaltCure ? " dmg-toggle-active" : "")} onClick={() => setAtkSaltCure(!atkSaltCure)}>盐腌</button>
                  </div>
                  <div className="dmg-field-toggle-row">
                    <button className={"dmg-toggle-btn" + (atkHelpingHand ? " dmg-toggle-active" : "")} onClick={() => setAtkHelpingHand(!atkHelpingHand)}>帮助</button>
                    <button className={"dmg-toggle-btn" + (atkTailwind ? " dmg-toggle-active" : "")} onClick={() => setAtkTailwind(!atkTailwind)}>顺风</button>
                  </div>
                  <div className="dmg-field-toggle-row">
                    <button className={"dmg-toggle-btn" + (atkPowerTrick ? " dmg-toggle-active" : "")} onClick={() => setAtkPowerTrick(!atkPowerTrick)}>力量戏法</button>
                    <button className={"dmg-toggle-btn" + (atkFriendGuard ? " dmg-toggle-active" : "")} onClick={() => setAtkFriendGuard(!atkFriendGuard)}>友情防守</button>
                  </div>
                  <div className="dmg-field-toggle-row">
                    <button className={"dmg-toggle-btn" + (atkBoost ? " dmg-toggle-active" : "")} onClick={() => setAtkBoost(!atkBoost)}>+1 全能力</button>
                    <button className={"dmg-toggle-btn" + (atkSwitchingOut ? " dmg-toggle-active" : "")} onClick={() => setAtkSwitchingOut(!atkSwitchingOut)}>正在换入</button>
                  </div>
                  <div className="dmg-field-toggle-row">
                    <button className={"dmg-toggle-btn" + (atkStatus === "burn" ? " dmg-toggle-active" : "")} onClick={() => setAtkStatus(atkStatus === "burn" ? "none" : "burn")}>烧伤</button>
                  </div>
                </div>

                {/* 防守方 */}
                <div className="dmg-field-side">
                  <span className="dmg-field-side-label">防守方</span>
                  <div className="dmg-field-toggle-row">
                    <button className={"dmg-toggle-btn" + (defStealthRock ? " dmg-toggle-active" : "")} onClick={() => setDefStealthRock(!defStealthRock)}>隐蔽岩石</button>
                  </div>
                  <div className="dmg-field-toggle-row">
                    {[0, 1, 2, 3].map((n) => (
                      <button key={n} className={"dmg-toggle-btn" + (defSpikes === n ? " dmg-toggle-active" : "")} onClick={() => setDefSpikes(n)}>{n} 撒菱</button>
                    ))}
                  </div>
                  <div className="dmg-field-toggle-row">
                    <button className={"dmg-toggle-btn" + (defReflect ? " dmg-toggle-active" : "")} onClick={() => setDefReflect(!defReflect)}>反射壁</button>
                    <button className={"dmg-toggle-btn" + (defLightScreen ? " dmg-toggle-active" : "")} onClick={() => setDefLightScreen(!defLightScreen)}>光墙</button>
                    <button className={"dmg-toggle-btn" + (defAuroraVeil ? " dmg-toggle-active" : "")} onClick={() => setDefAuroraVeil(!defAuroraVeil)}>极光幕</button>
                  </div>
                  <div className="dmg-field-toggle-row">
                    <button className={"dmg-toggle-btn" + (defProtect ? " dmg-toggle-active" : "")} onClick={() => setDefProtect(!defProtect)}>守住</button>
                    <button className={"dmg-toggle-btn" + (defLeechSeed ? " dmg-toggle-active" : "")} onClick={() => setDefLeechSeed(!defLeechSeed)}>寄生种子</button>
                    <button className={"dmg-toggle-btn" + (defSaltCure ? " dmg-toggle-active" : "")} onClick={() => setDefSaltCure(!defSaltCure)}>盐腌</button>
                  </div>
                  <div className="dmg-field-toggle-row">
                    <button className={"dmg-toggle-btn" + (defHelpingHand ? " dmg-toggle-active" : "")} onClick={() => setDefHelpingHand(!defHelpingHand)}>帮助</button>
                    <button className={"dmg-toggle-btn" + (defTailwind ? " dmg-toggle-active" : "")} onClick={() => setDefTailwind(!defTailwind)}>顺风</button>
                  </div>
                  <div className="dmg-field-toggle-row">
                    <button className={"dmg-toggle-btn" + (defPowerTrick ? " dmg-toggle-active" : "")} onClick={() => setDefPowerTrick(!defPowerTrick)}>力量戏法</button>
                    <button className={"dmg-toggle-btn" + (defFriendGuard ? " dmg-toggle-active" : "")} onClick={() => setDefFriendGuard(!defFriendGuard)}>友情防守</button>
                  </div>
                  <div className="dmg-field-toggle-row">
                    <button className={"dmg-toggle-btn" + (defBoost ? " dmg-toggle-active" : "")} onClick={() => setDefBoost(!defBoost)}>+1 全能力</button>
                    <button className={"dmg-toggle-btn" + (defSwitchingOut ? " dmg-toggle-active" : "")} onClick={() => setDefSwitchingOut(!defSwitchingOut)}>正在换入</button>
                  </div>
                </div>
              </div>

              {/* 环境修正摘要 */}
              <div className="dmg-field-summary">
                <div className="dmg-field-summary-row">
                  <span>天气</span><span className={envModifiers.weatherMod !== 1 ? "dmg-step-val-active" : ""}>x{envModifiers.weatherMod}</span>
                </div>
                <div className="dmg-field-summary-row">
                  <span>场地</span><span className={envModifiers.terrainMod !== 1 ? "dmg-step-val-active" : ""}>x{envModifiers.terrainMod}</span>
                </div>
                <div className="dmg-field-summary-row">
                  <span>壁障</span><span className={envModifiers.screenMod !== 1 ? "dmg-step-val-active" : ""}>x{envModifiers.screenMod}</span>
                </div>
                <div className="dmg-field-summary-row">
                  <span>状态</span><span className={envModifiers.statusMod !== 1 ? "dmg-step-val-active" : ""}>x{envModifiers.statusMod}</span>
                </div>
                {envModifiers.helpMod !== 1 && <div className="dmg-field-summary-row">
                  <span>帮助</span><span className="dmg-step-val-active">x{envModifiers.helpMod}</span>
                </div>}
                {envModifiers.protectMod !== 1 && <div className="dmg-field-summary-row">
                  <span>守住</span><span className="dmg-step-val-active">x{envModifiers.protectMod}</span>
                </div>}
                {envModifiers.friendGuardMod !== 1 && <div className="dmg-field-summary-row">
                  <span>友情防守</span><span className="dmg-step-val-active">x{envModifiers.friendGuardMod}</span>
                </div>}
              </div>
            </div>
          </div>

          {/* --- 右栏：Pokemon 2 --- */}
          <div className="dmg-col dmg-col-right">
            <DamageSourcePanel
              title="Pokemon 2"
              panelKey="def"
              side={defender}
              mode={defenderMode}
              onModeChange={setDefenderMode}
              onConfigChange={(updater) => {
                setDefender((prev) => {
                  var next = typeof updater === "function" ? updater(prev) : updater;
                  return { ...next, nameZh: next.nameZh || prev.nameZh };
                });
                setResult(null);
              }}
              onImportConfig={importConfig(setDefender, setDefenderMode)}
            />
          </div>

        </div>
      </div>
    </section>
  );
}
