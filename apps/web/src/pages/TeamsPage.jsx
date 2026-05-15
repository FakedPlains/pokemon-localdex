import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ViewToggle from "../components/ViewToggle.jsx";
import { createDraftMember, createDefaultStats } from "../utils/helpers.js";
import {
  getBox, saveBoxConfig, deleteBoxConfig, duplicateBoxConfig,
  getTeams, saveTeam, deleteTeam,
  resolveTeamMembers
} from "../utils/teamStorage.js";
import { useToast } from "../components/Toast.jsx";
import CustomSelect from "../components/CustomSelect.jsx";
import { BOX_SORT_OPTIONS, getDisplayedBoxConfigs } from "../components/teams/boxSort.ts";
import BoxCard from "../components/teams/BoxCard.jsx";
import BoxListRow from "../components/teams/BoxListRow.jsx";
import PokemonConfigInlineEditor from "../components/teams/PokemonConfigInlineEditor.jsx";
import TeamCard from "../components/teams/TeamCard.jsx";
import TeamSlot from "../components/teams/TeamSlot.jsx";

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
  const [boxSearch, setBoxSearch] = useState("");
  const [boxSortMode, setBoxSortMode] = useState("current");
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

  const displayedBoxConfigs = useMemo(
    () => getDisplayedBoxConfigs(boxConfigs, boxSearch, boxSortMode),
    [boxConfigs, boxSearch, boxSortMode]
  );

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
              {editingConfig ? (
                <PokemonConfigInlineEditor
                  ref={editorRef}
                  title={isNewConfig ? "新建配置" : "编辑配置"}
                  config={editingConfig}
                  pickerSearch={pickerSearch}
                  onPickerSearchChange={setPickerSearch}
                  onChange={handleEditingConfigChange}
                  onSave={handleSaveConfig}
                  onCancel={handleCancelEdit}
                  saveLabel={isNewConfig ? "添加到盒子" : "保存修改"}
                />
              ) : null}

              {/* 操作栏：新建配置 + 视图切换（同一行） */}
              <div className="box-action-bar">
                {!editingConfig && (
                  <button className="cfg-new-btn" onClick={handleNewConfig}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
                    <span>新建配置</span>
                  </button>
                )}
                {boxConfigs.length > 0 && (
                  <div className="box-tools">
                    <div className="box-search-wrap search-input-wrap search-input-sm">
                      <svg className="search-input-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" />
                      </svg>
                      <input
                        className="search-input"
                        value={boxSearch}
                        onChange={(e) => setBoxSearch(e.target.value)}
                        placeholder="搜索宝可梦或配置名称…"
                      />
                      {boxSearch && (
                        <button className="search-input-clear" onClick={() => setBoxSearch("")}>✕</button>
                      )}
                    </div>
                    <CustomSelect
                      className="box-sort-select"
                      value={boxSortMode}
                      options={BOX_SORT_OPTIONS}
                      onChange={setBoxSortMode}
                    />
                    <ViewToggle mode={boxViewMode} onChange={setBoxViewMode} />
                  </div>
                )}
              </div>

              {boxConfigs.length > 0 ? (
                <>
                  {displayedBoxConfigs.length > 0 && (
                    <div className="box-result-meta">
                      {displayedBoxConfigs.length === boxConfigs.length
                        ? `共 ${boxConfigs.length} 个配置`
                        : `显示 ${displayedBoxConfigs.length} / ${boxConfigs.length} 个配置`}
                    </div>
                  )}
                  {displayedBoxConfigs.length === 0 ? (
                    <div className="detail-empty box-filter-empty">
                      <p>没有匹配的宝可梦配置。</p>
                      <button className="box-filter-clear" onClick={() => setBoxSearch("")}>清空搜索</button>
                    </div>
                  ) : boxViewMode === "card" ? (
                    <div className="te-card-grid">
                      {displayedBoxConfigs.map((config) => (
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
                        <span className="box-list-hcol box-list-hcol-combined" title="种族值 / 能力值">HP</span>
                        <span className="box-list-hcol box-list-hcol-combined" title="种族值 / 能力值">攻击</span>
                        <span className="box-list-hcol box-list-hcol-combined" title="种族值 / 能力值">防御</span>
                        <span className="box-list-hcol box-list-hcol-combined" title="种族值 / 能力值">特攻</span>
                        <span className="box-list-hcol box-list-hcol-combined" title="种族值 / 能力值">特防</span>
                        <span className="box-list-hcol box-list-hcol-combined" title="种族值 / 能力值">速度</span>
                        <span className="box-list-hcol box-list-hcol-actions"></span>
                      </div>
                      {displayedBoxConfigs.map((config) => (
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

                  {inlineEditSlot && inlineEditDraft && (
                    <PokemonConfigInlineEditor
                      ref={inlineEditorRef}
                      className="cfg-inline-wrap te-slot-inline-standalone"
                      title={`位置 ${inlineEditSlot} — ${inlineEditIsNew ? "手动添加" : "编辑配置"}`}
                      config={inlineEditDraft}
                      pickerSearch={inlinePickerSearch}
                      onPickerSearchChange={setInlinePickerSearch}
                      onChange={handleInlineEditDraftChange}
                      onSave={handleConfirmInlineEdit}
                      onCancel={handleCancelInlineEdit}
                      saveLabel={inlineEditIsNew ? "确认添加" : "保存修改"}
                    />
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
