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
import PokemonConfigCard from "../components/PokemonConfigCard.jsx";
import PokemonEditor from "../components/PokemonEditor.jsx";
import PokemonPickerList from "../components/PokemonPickerList.jsx";
import { useToast } from "../components/Toast.jsx";
import CustomSelect from "../components/CustomSelect.jsx";


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
  const menuActions = [
    { label: "编辑", onClick: () => onEdit(config) },
    { label: "复制", onClick: () => onDuplicate(config.configId) },
    { label: "删除", onClick: () => onDelete(config.configId), className: "danger-text" },
  ];

  return <PokemonConfigCard data={config} menuActions={menuActions} />;
}

// ══════════════════════════════════════════════
//  盒子列表行（列表视图）
// ══════════════════════════════════════════════

function BoxListRow({ config, onEdit, onDelete, onDuplicate }) {
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
    return () => { document.removeEventListener("mousedown", handler); window.removeEventListener("scroll", scrollHandler, true); };
  }, [menuOpen]);

  // 计算 dropdown 的 fixed 定位
  useEffect(() => {
    if (menuOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    } else if (!menuOpen) {
      setDropdownPos(null);
    }
  }, [menuOpen]);

  // 按需获取宝可梦信息
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
      setFetchedInfo({ imageUrl: img?.url || "", shinyImageUrl: shinyUrl, primaryType: p?.primaryType || "", secondaryType: p?.secondaryType || "", baseStats });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [config.pokemonId, config.imageUrl]);

  // 按需获取道具图片
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

  // 计算最终能力值
  const finalStats = useMemo(() => {
    if (!baseStats) return null;
    const detail = { baseStats };
    return Object.fromEntries(
      STAT_KEYS.map((key) => [key, calculateFinalStat(config, detail, key)])
    );
  }, [baseStats, config]);

  return (
    <div className={`box-list-row${menuOpen ? " box-list-row-menu-open" : ""}`} onClick={() => onEdit(config)}>
      {/* 图片 + 道具叠加 */}
      <div className="box-list-col box-list-col-img">
        <div className="box-list-thumb">
          {imageUrl ? <img src={imageUrl} alt={config.nameZh || ""} referrerPolicy="no-referrer" /> : <span className="box-list-thumb-empty">?</span>}
            {itemImgUrl && (
              <img className="box-list-item-overlay" src={itemImgUrl} alt={config.itemName || config.itemId} title={config.itemName || config.itemId} referrerPolicy="no-referrer" />
            )}
        </div>
      </div>

      {/* 名称 */}
      <div className="box-list-col box-list-col-name">
        <span className="box-list-name-zh">{config.formName && config.formName !== config.nameZh ? config.formName : (config.nameZh || config.pokemonId || "未命名")}</span>
        {config.configName && <span className="box-list-config-name">{config.configName}</span>}
      </div>

      {/* 属性 */}
      <div className="box-list-col box-list-col-types">
        {types.map((t) => (
          <span key={t} className={`type-chip type-${t} box-list-type-chip`}>
            <img className="type-chip-icon" src={`${import.meta.env.BASE_URL}assets/type-icons/type-${t}@sm.png`} alt={t} />
            {t}
          </span>
        ))}
      </div>

      {/* 特性 */}
      <div className="box-list-col box-list-col-ability">
        <span className="box-list-ability">{config.abilityId || "—"}</span>
      </div>

      {/* 性格 */}
      <div className="box-list-col box-list-col-nature">
        <span className="box-list-nature">{config.nature || "认真"}</span>
      </div>

      {/* 能力值 */}
      {STAT_KEYS.map((k) => (
        <div key={k} className="box-list-col box-list-col-stats">
          <span className="box-list-stat-val">{finalStats?.[k] ?? "—"}</span>
        </div>
      ))}

      {/* 操作菜单 */}
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

// ══════════════════════════════════════════════
//  队伍成员槽位
// ══════════════════════════════════════════════

function TeamSlot({ slot, member, boxConfigs, onSelectFromBox, onRemove, onInlineEdit, onEditMember }) {
  const hasMember = member && member.pokemonId;
  const boxOptions = useMemo(() => boxConfigs.map((c) => ({ value: c.configId, label: c.configName || c.nameZh || c.pokemonId || "未命名" })), [boxConfigs]);

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

  // 已填充的槽位 — 使用公共卡片组件
  const menuActions = [
    { label: "编辑", onClick: () => onEditMember(slot, member) },
    { label: "移除", onClick: () => onRemove(slot), className: "danger-text" },
  ];

  return <PokemonConfigCard data={member} menuActions={menuActions} className="te-member-card" />;
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
      unifiedApi(`/pokemon/${m.pokemonId}`).then((r) => {
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
  const [boxViewMode, setBoxViewMode] = useState("card"); // "card" | "list"
  const [pickerSearch, setPickerSearch] = useState("");

  const editorRef = useRef(null);
  const teamEditorRef = useRef(null);

  useEffect(() => {
    setBoxConfigs(getBox());
    setTeams(getTeams());

    // 监听迁移完成事件，刷新数据
    const handleMigrationDone = () => {
      setBoxConfigs(getBox());
      setTeams(getTeams());
    };
    window.addEventListener("localdex-migration-done", handleMigrationDone);
    return () => window.removeEventListener("localdex-migration-done", handleMigrationDone);
  }, []);

  // 新建/编辑时自动滚动到编辑区域（仅在首次打开编辑器时触发，避免输入时反复滚动）
  const prevEditingConfigRef = useRef(null);
  useEffect(() => {
    const wasEditing = prevEditingConfigRef.current != null;
    const isEditing = editingConfig != null;
    prevEditingConfigRef.current = editingConfig;
    // 只在从"未编辑"切换到"编辑中"时滚动
    if (isEditing && !wasEditing && editorRef.current) {
      setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  }, [editingConfig]);

  const prevEditingTeamRef = useRef(null);
  useEffect(() => {
    const wasEditing = prevEditingTeamRef.current != null;
    const isEditing = editingTeam != null;
    prevEditingTeamRef.current = editingTeam;
    if (isEditing && !wasEditing && teamEditorRef.current) {
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
        formKey: m.formKey || "", formName: m.formName || "",
        itemId: m.itemId || "", itemName: m.itemName || "", itemImageUrl: m.itemImageUrl || "",
        abilityId: m.abilityId || "", abilityName: m.abilityName || "", nature: m.nature || "认真",
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
                        <span id="cfg-form-slider-portal"></span>
                        <button className="cfg-toolbar-pokemon-change" onClick={() => { handleEditingConfigChange({ ...editingConfig, pokemonId: "", nameZh: "", formKey: "", formName: "" }); setPickerSearch(""); }}>更换</button>
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
                          pokemonId: String(p.id),
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
                <>
                  {/* 视图切换 */}
                  <div className="box-view-toggle">
                    <button
                      className={`box-view-btn${boxViewMode === "card" ? " box-view-btn-active" : ""}`}
                      onClick={() => setBoxViewMode("card")}
                      title="卡片视图"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>
                    </button>
                    <button
                      className={`box-view-btn${boxViewMode === "list" ? " box-view-btn-active" : ""}`}
                      onClick={() => setBoxViewMode("list")}
                      title="列表视图"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2.5" rx="1"/><rect x="1" y="6.75" width="14" height="2.5" rx="1"/><rect x="1" y="11.5" width="14" height="2.5" rx="1"/></svg>
                    </button>
                  </div>

                  {boxViewMode === "card" ? (
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
                    <div className="box-list-view">
                      <div className="box-list-header">
                        <span className="box-list-hcol box-list-hcol-img"></span>
                        <span className="box-list-hcol box-list-hcol-name">名称</span>
                        <span className="box-list-hcol box-list-hcol-types">属性</span>
                        <span className="box-list-hcol box-list-hcol-ability">特性</span>
                        <span className="box-list-hcol box-list-hcol-nature">性格</span>
                        <span className="box-list-hcol box-list-hcol-stats">HP</span>
                        <span className="box-list-hcol box-list-hcol-stats">攻击</span>
                        <span className="box-list-hcol box-list-hcol-stats">防御</span>
                        <span className="box-list-hcol box-list-hcol-stats">特攻</span>
                        <span className="box-list-hcol box-list-hcol-stats">特防</span>
                        <span className="box-list-hcol box-list-hcol-stats">速度</span>
                        <span className="box-list-hcol box-list-hcol-actions"></span>
                      </div>
                      {boxConfigs.map((config) => (
                        <BoxListRow
                          key={config.configId}
                          config={config}
                          onEdit={handleEditConfig}
                          onDelete={handleDeleteConfig}
                          onDuplicate={handleDuplicateConfig}
                        />
                      ))}
                    </div>
                  )}
                </>
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
                            <span id="cfg-form-slider-portal"></span>
                            <button className="cfg-toolbar-pokemon-change" onClick={() => { handleInlineEditDraftChange({ ...inlineEditDraft, pokemonId: "", nameZh: "", formKey: "", formName: "" }); setInlinePickerSearch(""); }}>更换</button>
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
                              pokemonId: String(p.id),
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
