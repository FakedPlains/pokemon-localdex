import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { unifiedApi } from "../utils/api.js";
import { STAT_KEYS, NATURE_OPTIONS } from "../utils/constants.js";
import { createDraftMember, createDefaultStats, getPokemonPreviewImage } from "../utils/helpers.js";
import {
  getBox, saveBoxConfig, deleteBoxConfig, duplicateBoxConfig,
  getTeams, saveTeam, deleteTeam,
  resolveTeamMembers
} from "../utils/teamStorage.js";
import StatCalculator from "../components/StatCalculator.jsx";
import SearchSelect from "../components/SearchSelect.jsx";
import Loading from "../components/Loading.jsx";

// ══════════════════════════════════════════════
//  宝可梦配置编辑器
// ══════════════════════════════════════════════

function PokemonEditor({ config, pokemonList, items, onChange, onSave, onCancel, saveLabel }) {
  const [pokemonDetail, setPokemonDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isShiny, setIsShiny] = useState(false);
  const pokemonId = config.pokemonId;

  useEffect(() => {
    if (!pokemonId) { setPokemonDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    unifiedApi(`/pokemon/${encodeURIComponent(pokemonId)}`).then((r) => {
      if (!cancelled) { setPokemonDetail(r.data); setDetailLoading(false); }
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
            sublabel: [entry.moveType, entry.moveCategory, entry.movePower ? `威力${entry.movePower}` : ""].filter(Boolean).join(" · "),
          });
        }
      }
      setMovesList(moves);
    }).catch(() => { if (!cancelled) setMovesList([]); });
    return () => { cancelled = true; };
  }, [pokemonDetail]);

  const pokemonOptions = useMemo(() => {
    return pokemonList.map((p) => ({
      value: p.slug || String(p.id),
      label: p.nameZh || p.slug || String(p.id),
      sublabel: p.nameEn || "",
    }));
  }, [pokemonList]);

  const itemOptions = useMemo(() => {
    return items.map((item) => ({
      value: item.slug || String(item.id),
      label: item.nameZh || item.slug || String(item.id),
      sublabel: "",
    }));
  }, [items]);

  /* ── 图片（普通 / 闪光） ── */
  const selectedPokemon = pokemonList.find(
    (p) => p.slug === pokemonId || String(p.id) === String(pokemonId) || p.nameZh === pokemonId
  );
  const detailImages = pokemonDetail?.forms?.[0]?.images || pokemonDetail?.images;
  const previewImage = useMemo(() => {
    if (isShiny) {
      const shiny = detailImages?.shiny || detailImages?.shinyOfficial || detailImages?.shinySprite
        || (selectedPokemon?.shinyImage);
      if (shiny) return shiny;
    }
    if (pokemonDetail) return getPokemonPreviewImage(pokemonDetail);
    if (selectedPokemon) return getPokemonPreviewImage(selectedPokemon);
    return null;
  }, [pokemonDetail, selectedPokemon, detailImages, isShiny]);

  const baseStats = useMemo(() => {
    if (!pokemonDetail) return null;
    const form = pokemonDetail.forms?.[0];
    return form?.baseStats || pokemonDetail.baseStats || null;
  }, [pokemonDetail]);

  const handleField = (field, value) => {
    const draft = { ...config };
    draft[field] = field === "level" ? Number(value || 50) : value;
    if (field === "pokemonId") {
      const matched = pokemonList.find(
        (p) => p.slug === value || String(p.id) === String(value) || p.nameZh === value
      );
      if (matched) draft.nameZh = matched.nameZh || value;
      else if (!draft.nameZh) draft.nameZh = value;
    }
    onChange(draft);
  };

  const handleMove = (moveIndex, value) => {
    const draft = { ...config, moves: [...(config.moves || ["", "", "", ""])] };
    draft.moves[moveIndex] = value;
    onChange(draft);
  };

  const handleStatChange = useCallback(({ level, nature, ivs, evs }) => {
    onChange((prev) => {
      if (prev.level === level && prev.nature === nature &&
          JSON.stringify(prev.ivs) === JSON.stringify(ivs) &&
          JSON.stringify(prev.evs) === JSON.stringify(evs)) {
        return prev;
      }
      return { ...prev, level, nature, ivs, evs };
    });
  }, [onChange]);

  const statInitialValues = useMemo(() => ({
    level: config.level || 50,
    nature: config.nature || "认真",
    ivs: config.ivs || createDefaultStats("iv"),
    evs: config.evs || createDefaultStats("ev"),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="team-member-editor">
      {/* ── 上半区：左右分栏 ── */}
      <div className="te-split">
        {/* 左侧：图片 + 宝可梦选择 + 特性 + 道具 */}
        <div className="te-left">
          {/* 图片 + 闪光切换 */}
          <div className="te-preview">
            <div className="te-preview-img">
              {previewImage?.url
                ? <img src={previewImage.url} alt={previewImage.alt || config.nameZh || ""} referrerPolicy="no-referrer" />
                : <span className="te-preview-empty">{pokemonId ? "加载中…" : "?"}</span>}
            </div>
            <div className="te-shiny-toggle">
              <button className={!isShiny ? "active" : ""} onClick={() => setIsShiny(false)}>普通</button>
              <button className={isShiny ? "active" : ""} onClick={() => setIsShiny(true)}>闪光</button>
            </div>
          </div>

          {/* 宝可梦选择 */}
          <label className="te-field">
            <span>宝可梦</span>
            <SearchSelect
              value={config.pokemonId || ""}
              options={pokemonOptions}
              onChange={(v) => handleField("pokemonId", v)}
              placeholder="搜索宝可梦…"
            />
          </label>

          {/* 特性 — tab 切换 */}
          <div className="te-field">
            <span className="te-field-label">特性</span>
            {allAbilities.length > 0 ? (
              <div className="te-ability-tabs">
                {abilityGroups.normal.map((name) => (
                  <button
                    key={name}
                    className={`te-ability-tab${config.abilityId === name ? " te-ability-tab-active" : ""}`}
                    onClick={() => handleField("abilityId", name)}
                  >
                    {name}
                  </button>
                ))}
                {abilityGroups.hidden.map((name) => (
                  <button
                    key={name}
                    className={`te-ability-tab te-ability-tab-hidden${config.abilityId === name ? " te-ability-tab-active" : ""}`}
                    onClick={() => handleField("abilityId", name)}
                    title="隐藏特性"
                  >
                    {name}
                    <span className="te-ha-badge">HA</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="te-ability-tabs">
                <span className="muted" style={{ fontSize: 13, padding: "6px 0" }}>
                  {detailLoading ? "加载中…" : pokemonId ? "暂无特性数据" : "请先选择宝可梦"}
                </span>
              </div>
            )}
          </div>

          {/* 道具 */}
          <label className="te-field">
            <span>道具</span>
            <SearchSelect
              value={config.itemId || ""}
              options={itemOptions}
              onChange={(v) => handleField("itemId", v)}
              placeholder="搜索道具…"
            />
          </label>
        </div>

        {/* 右侧：四个招式 */}
        <div className="te-right">
          <span className="te-field-label">招式</span>
          <div className="te-moves">
            {[0, 1, 2, 3].map((mi) => (
              <label key={mi} className="te-field">
                <span>招式 {mi + 1}</span>
                {movesList.length > 0 ? (
                  <SearchSelect
                    value={config.moves?.[mi] || ""}
                    options={movesList}
                    onChange={(v) => handleMove(mi, v)}
                    placeholder="搜索招式…"
                  />
                ) : (
                  <input value={config.moves?.[mi] || ""} onChange={(e) => handleMove(mi, e.target.value)} placeholder={detailLoading ? "加载中…" : "输入招式名"} />
                )}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── 下半区：能力值分配 ── */}
      {baseStats && (
        <details className="stats-details" open>
          <summary>能力值分配</summary>
          <div style={{ marginTop: 12 }}>
            <StatCalculator baseStats={baseStats} initialValues={statInitialValues} onChange={handleStatChange} />
          </div>
        </details>
      )}
      {!baseStats && pokemonId && (
        <details className="stats-details">
          <summary>能力值分配</summary>
          <div className="muted" style={{ padding: "8px 0" }}>{detailLoading ? "正在加载种族值数据…" : "暂无种族值数据"}</div>
        </details>
      )}

      <div className="toolbar-row" style={{ marginTop: 14 }}>
        <button onClick={onSave}>{saveLabel || "保存配置"}</button>
        {onCancel && <button className="secondary" onClick={onCancel}>取消</button>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  通用弹窗
// ══════════════════════════════════════════════

function Modal({ open, onClose, title, children }) {
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

function BoxCard({ config, pokemonList, items, movesList, onEdit, onDelete, onDuplicate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const pokemon = pokemonList.find(
    (p) => p.slug === config.pokemonId || String(p.id) === String(config.pokemonId) || p.nameZh === config.pokemonId
  );
  const image = pokemon ? getPokemonPreviewImage(pokemon) : null;
  const types = [pokemon?.primaryType, pokemon?.secondaryType].filter(Boolean);

  const itemData = items.find(
    (it) => it.slug === config.itemId || it.nameZh === config.itemId || String(it.id) === String(config.itemId)
  );

  const movesWithType = (config.moves || []).filter(Boolean).map((moveName) => {
    const found = movesList.find((m) => m.label === moveName || m.value === moveName);
    const parts = found?.sublabel?.split(" · ") || [];
    const typeStr = parts[0] || "";
    const powerStr = parts[2] || "";
    const power = powerStr.replace("威力", "") || "";
    return { name: moveName, type: typeStr, power };
  });

  return (
    <div className="box-card">
      {/* 顶栏：配置名称 + 三点菜单 */}
      <div className="box-card-header">
        <span className="box-card-title">{config.nameZh || config.pokemonId || "未命名"}</span>
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
            {image?.url ? <img src={image.url} alt={config.nameZh || ""} referrerPolicy="no-referrer" /> : <span className="box-card-thumb-empty">?</span>}
            {itemData?.imageUrl && (
              <img className="box-card-item-overlay" src={itemData.imageUrl} alt={itemData.nameZh || config.itemId} title={itemData.nameZh || config.itemId} referrerPolicy="no-referrer" />
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

          {/* 名字 + 等级 */}
          <div className="box-card-name">
            <strong>{config.nameZh || config.pokemonId || "未命名"}</strong>
            <span className="box-card-level">Lv.{config.level || 50}</span>
          </div>

          {/* 特性 + 性格 */}
          <div className="box-card-meta">
            {config.abilityId && <span className="box-card-tag">{config.abilityId}</span>}
            <span className="box-card-tag">{config.nature || "认真"}</span>
          </div>
        </div>

        {/* 右侧：招式 + 努力值 */}
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

          {/* 努力值 / 个体值 */}
          {config.evs && (
            <div className="box-card-stats">
              <div className="box-card-stats-header">
                <span></span>
                <span>HP</span><span>攻击</span><span>防御</span><span>特攻</span><span>特防</span><span>速度</span>
              </div>
              <div className="box-card-stats-row">
                <span className="box-card-stats-tag">努力</span>
                {["hp","atk","def","spa","spd","spe"].map((k) => (
                  <span key={k} className={`box-card-stats-num ${(config.evs?.[k] || 0) > 0 ? "has-val" : ""}`}>{config.evs?.[k] || 0}</span>
                ))}
              </div>
              <div className="box-card-stats-row">
                <span className="box-card-stats-tag">个体</span>
                {["hp","atk","def","spa","spd","spe"].map((k) => (
                  <span key={k} className={`box-card-stats-num ${(config.ivs?.[k] ?? 31) === 31 ? "" : "has-val"}`}>{config.ivs?.[k] ?? 31}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  队伍成员槽位
// ══════════════════════════════════════════════

function TeamSlot({ slot, member, boxConfigs, onSelectFromBox, onRemove, onInlineEdit }) {
  const hasMember = member && member.pokemonId;

  if (!hasMember) {
    return (
      <div className="meta-card te-slot te-slot-empty">
        <div className="te-slot-label">位置 {slot}</div>
        <div className="te-slot-actions">
          <select value="" onChange={(e) => { if (e.target.value) onSelectFromBox(slot, e.target.value); }}>
            <option value="">从盒子选择…</option>
            {boxConfigs.map((c) => (
              <option key={c.configId} value={c.configId}>{c.nameZh || c.pokemonId || "未命名"} (Lv.{c.level || 50})</option>
            ))}
          </select>
          <button className="secondary compact-button" onClick={() => onInlineEdit(slot)}>手动添加</button>
        </div>
      </div>
    );
  }

  return (
    <div className="meta-card te-slot">
      <div className="te-slot-label">
        位置 {slot}
        {member.configId && <span className="chip chip-ref">引用</span>}
      </div>
      <strong>{member.nameZh || member.pokemonId}</strong>
      <span className="muted" style={{ fontSize: 13 }}>
        Lv.{member.level || 50} · {member.nature || "认真"}{member.itemId && <> · {member.itemId}</>}
      </span>
      <div className="forms-grid">
        {(member.moves || []).filter(Boolean).map((m, i) => <span key={i} className="pill">{m}</span>)}
      </div>
      <div className="toolbar-row">
        <button className="secondary compact-button danger-text" onClick={() => onRemove(slot)}>移除</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  主页面
// ══════════════════════════════════════════════

export default function TeamsPage() {
  const [pokemonList, setPokemonList] = useState([]);
  const [items, setItems] = useState([]);
  const [movesList, setMovesList] = useState([]);
  const [loading, setLoading] = useState(true);

  const [boxConfigs, setBoxConfigs] = useState([]);
  const [editingConfig, setEditingConfig] = useState(null);
  const [isNewConfig, setIsNewConfig] = useState(false);

  const [teams, setTeams] = useState([]);
  const [editingTeam, setEditingTeam] = useState(null);
  const [isNewTeam, setIsNewTeam] = useState(false);
  const [inlineEditSlot, setInlineEditSlot] = useState(null);
  const [inlineEditDraft, setInlineEditDraft] = useState(null);

  const [activeTab, setActiveTab] = useState("box");

  useEffect(() => {
    Promise.all([
      unifiedApi("/pokemon").then((r) => r.data).catch(() => []),
      unifiedApi("/items").then((r) => r.data).catch(() => []),
      unifiedApi("/moves").then((r) => r.data).catch(() => [])
    ]).then(([pokemon, itemList, movesData]) => {
      setPokemonList(pokemon);
      setItems(itemList);
      setMovesList((movesData || []).map((m) => ({
        value: m.nameZh || m.slug || String(m.id),
        label: m.nameZh || m.slug || String(m.id),
        sublabel: [m.type || m.primaryType, m.category, m.power ? `威力${m.power}` : ""].filter(Boolean).join(" · "),
      })));
      setLoading(false);
    });
    setBoxConfigs(getBox());
    setTeams(getTeams());
  }, []);

  const refreshBox = useCallback(() => setBoxConfigs(getBox()), []);
  const refreshTeams = useCallback(() => setTeams(getTeams()), []);

  // ── 盒子操作 ──
  const handleNewConfig = useCallback(() => { setEditingConfig(createDraftMember()); setIsNewConfig(true); }, []);
  const handleEditConfig = useCallback((config) => { setEditingConfig({ ...config }); setIsNewConfig(false); }, []);
  const handleSaveConfig = useCallback(() => {
    if (!editingConfig?.pokemonId) { window.alert("请先选择一只宝可梦。"); return; }
    saveBoxConfig(editingConfig); refreshBox(); setEditingConfig(null); setIsNewConfig(false);
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
    if (!editingTeam.name?.trim()) { window.alert("请输入队伍名称。"); return; }
    const validMembers = (editingTeam.members || []).filter((m) => m && m.pokemonId);
    if (validMembers.length === 0) { window.alert("请至少添加一只宝可梦。"); return; }
    const membersToSave = validMembers.map((m, i) => {
      if (m.configId) return { slot: i + 1, configId: m.configId };
      return { slot: i + 1, pokemonId: m.pokemonId, nameZh: m.nameZh, level: Number(m.level || 50), itemId: m.itemId || "", abilityId: m.abilityId || "", nature: m.nature || "认真", moves: (m.moves || []).filter(Boolean), ivs: { ...createDefaultStats("iv"), ...(m.ivs || {}) }, evs: { ...createDefaultStats("ev"), ...(m.evs || {}) } };
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
    const idx = members.findIndex((m) => m.slot === slot);
    const newMember = { ...config, slot, configId };
    if (idx >= 0) members[idx] = newMember; else members.push(newMember);
    setEditingTeam({ ...editingTeam, members });
  }, [editingTeam, boxConfigs]);
  const handleRemoveMember = useCallback((slot) => { if (!editingTeam) return; setEditingTeam({ ...editingTeam, members: (editingTeam.members || []).filter((m) => m.slot !== slot) }); }, [editingTeam]);
  const handleStartInlineEdit = useCallback((slot) => { setInlineEditSlot(slot); setInlineEditDraft(createDraftMember()); }, []);
  const handleInlineEditDraftChange = useCallback((updater) => { setInlineEditDraft((prev) => (typeof updater === "function" ? updater(prev) : updater)); }, []);
  const handleConfirmInlineEdit = useCallback(() => {
    if (!editingTeam || !inlineEditDraft?.pokemonId) { window.alert("请先选择一只宝可梦。"); return; }
    const members = [...(editingTeam.members || [])];
    const newMember = { ...inlineEditDraft, slot: inlineEditSlot };
    const idx = members.findIndex((m) => m.slot === inlineEditSlot);
    if (idx >= 0) members[idx] = newMember; else members.push(newMember);
    setEditingTeam({ ...editingTeam, members }); setInlineEditSlot(null); setInlineEditDraft(null);
  }, [editingTeam, inlineEditSlot, inlineEditDraft]);
  const handleCancelInlineEdit = useCallback(() => { setInlineEditSlot(null); setInlineEditDraft(null); }, []);

  const teamSlots = useMemo(() => {
    if (!editingTeam) return [];
    const members = editingTeam.members || [];
    return Array.from({ length: 6 }, (_, i) => { const slot = i + 1; return members.find((m) => m.slot === slot) || null; });
  }, [editingTeam]);

  if (loading) return <Loading />;

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
              <Modal
                open={!!editingConfig}
                onClose={handleCancelEdit}
                title={isNewConfig ? "新建宝可梦配置" : "编辑配置"}
              >
                {editingConfig && (
                  <PokemonEditor
                    config={editingConfig}
                    pokemonList={pokemonList}
                    items={items}
                    onChange={handleEditingConfigChange}
                    onSave={handleSaveConfig}
                    onCancel={handleCancelEdit}
                    saveLabel={isNewConfig ? "添加到盒子" : "保存修改"}
                  />
                )}
              </Modal>

              <div className="toolbar-row" style={{ marginTop: 14 }}>
                <button onClick={handleNewConfig}>+ 新建配置</button>
              </div>

              {boxConfigs.length > 0 ? (
                <div className="te-card-grid">
                  {boxConfigs.map((config) => (
                    <BoxCard
                      key={config.configId}
                      config={config}
                      pokemonList={pokemonList}
                      items={items}
                      movesList={movesList}
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
              {editingTeam && (
                <div className="subpanel" style={{ marginTop: 14 }}>
                  <div className="member-topline">
                    <strong>{isNewTeam ? "新建队伍" : "编辑队伍"}</strong>
                  </div>
                  <div className="member-grid" style={{ marginBottom: 16 }}>
                    <label>
                      <span>队伍名称</span>
                      <input value={editingTeam.name || ""} onChange={(e) => setEditingTeam({ ...editingTeam, name: e.target.value })} placeholder="如：雨天队" />
                    </label>
                    <label>
                      <span>对战规则</span>
                      <select value={editingTeam.format || "singles"} onChange={(e) => setEditingTeam({ ...editingTeam, format: e.target.value })}>
                        <option value="singles">单打</option>
                        <option value="doubles">双打</option>
                      </select>
                    </label>
                  </div>

                  <div className="team-slot-grid">
                    {teamSlots.map((member, i) => {
                      const slot = i + 1;
                      if (inlineEditSlot === slot && inlineEditDraft) {
                        return (
                          <div key={slot} className="subpanel te-slot-inline">
                            <div className="member-topline">
                              <strong>位置 {slot} — 手动添加</strong>
                            </div>
                            <PokemonEditor
                              config={inlineEditDraft}
                              pokemonList={pokemonList}
                              items={items}
                              onChange={handleInlineEditDraftChange}
                              onSave={handleConfirmInlineEdit}
                              onCancel={handleCancelInlineEdit}
                              saveLabel="确认添加"
                            />
                          </div>
                        );
                      }
                      return (
                        <TeamSlot
                          key={slot}
                          slot={slot}
                          member={member}
                          boxConfigs={boxConfigs}
                          onSelectFromBox={handleSelectFromBox}
                          onRemove={handleRemoveMember}
                          onInlineEdit={handleStartInlineEdit}
                        />
                      );
                    })}
                  </div>

                  <div className="toolbar-row" style={{ marginTop: 14 }}>
                    <button onClick={handleSaveTeam}>{isNewTeam ? "创建队伍" : "保存队伍"}</button>
                    <button className="secondary" onClick={handleCancelTeamEdit}>取消</button>
                  </div>
                </div>
              )}

              {!editingTeam && (
                <div className="toolbar-row" style={{ marginTop: 14 }}>
                  <button onClick={handleNewTeam}>+ 新建队伍</button>
                </div>
              )}

              {teams.length > 0 ? (
                <div className="te-card-grid">
                  {teams.map((team) => {
                    const resolved = resolveTeamMembers(team);
                    return (
                      <div key={team.teamId} className="list-card">
                        <div className="card-topline">
                          <strong>{team.name || "未命名队伍"}</strong>
                          <span className="chip">{team.format === "doubles" ? "双打" : "单打"}</span>
                        </div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {resolved.length} 只宝可梦
                          {resolved.length > 0 && <> · {resolved.map((m) => m.nameZh || m.pokemonId).join("、")}</>}
                        </div>
                        <div className="toolbar-row">
                          <button className="secondary compact-button" onClick={() => handleEditTeam(team)}>编辑</button>
                          <button className="secondary compact-button danger-text" onClick={() => handleDeleteTeam(team.teamId)}>删除</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                !editingTeam && (
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
