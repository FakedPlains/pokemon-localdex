import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";
import { STAT_KEYS, NATURE_OPTIONS } from "../utils/constants.js";
import { createDraftMember, createDefaultStats } from "../utils/helpers.js";
import Loading from "../components/Loading.jsx";

function getDraftSlots(members) {
  return Array.from({ length: 6 }, (_, i) => members[i] || createDraftMember());
}

function StatInputs({ kind, stats, onChange }) {
  return (
    <div className="stat-input-grid">
      {STAT_KEYS.map((key) => (
        <label key={key} className="mini-field">
          <span>{key.toUpperCase()}</span>
          <input
            type="number"
            min="0"
            max={kind === "ivs" ? 31 : 252}
            value={stats?.[key] ?? (kind === "ivs" ? 31 : 0)}
            onChange={(e) => onChange(kind, key, Number(e.target.value || 0))}
          />
        </label>
      ))}
    </div>
  );
}

function MemberEditor({ member, index, pokemonList, items, onUpdate, onClear }) {
  const handleField = (field, value) => {
    const draft = { ...member };
    draft[field] = field === "level" ? Number(value || 50) : value;
    if (field === "pokemonId" && !draft.nameZh) draft.nameZh = value;
    onUpdate(index, draft);
  };

  const handleMove = (moveIndex, value) => {
    const draft = { ...member, moves: [...member.moves] };
    draft.moves[moveIndex] = value;
    onUpdate(index, draft);
  };

  const handleStat = (kind, key, value) => {
    const draft = { ...member };
    draft[kind] = { ...draft[kind], [key]: value };
    onUpdate(index, draft);
  };

  return (
    <section className="team-member-editor">
      <div className="member-topline">
        <strong>位置 {index + 1}</strong>
        <button className="secondary compact-button" onClick={() => onClear(index)}>清空该位</button>
      </div>
      <div className="member-grid">
        <label>
          <span>宝可梦</span>
          <input
            list="pokemon-options"
            value={member.pokemonId || ""}
            onChange={(e) => handleField("pokemonId", e.target.value)}
            placeholder="如：皮卡丘"
          />
        </label>
        <label>
          <span>显示名</span>
          <input
            value={member.nameZh || ""}
            onChange={(e) => handleField("nameZh", e.target.value)}
            placeholder="队伍里显示的名字"
          />
        </label>
        <label>
          <span>等级</span>
          <input
            type="number"
            min="1"
            max="100"
            value={member.level || 50}
            onChange={(e) => handleField("level", e.target.value)}
          />
        </label>
        <label>
          <span>性格</span>
          <select value={member.nature || "认真"} onChange={(e) => handleField("nature", e.target.value)}>
            {NATURE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>
          <span>道具</span>
          <input
            list="item-options"
            value={member.itemId || ""}
            onChange={(e) => handleField("itemId", e.target.value)}
            placeholder="如：气势披带"
          />
        </label>
        <label>
          <span>特性</span>
          <input
            value={member.abilityId || ""}
            onChange={(e) => handleField("abilityId", e.target.value)}
            placeholder="如：静电"
          />
        </label>
      </div>
      <div className="move-grid">
        {[0, 1, 2, 3].map((mi) => (
          <label key={mi}>
            <span>招式 {mi + 1}</span>
            <input
              value={member.moves?.[mi] || ""}
              onChange={(e) => handleMove(mi, e.target.value)}
              placeholder="输入招式名"
            />
          </label>
        ))}
      </div>
      <details className="stats-details">
        <summary>个体值 / 努力值</summary>
        <div className="stats-editor">
          <div>
            <strong className="section-label">个体值 IV</strong>
            <StatInputs kind="ivs" stats={member.ivs} onChange={handleStat} />
          </div>
          <div>
            <strong className="section-label">努力值 EV</strong>
            <StatInputs kind="evs" stats={member.evs} onChange={handleStat} />
          </div>
        </div>
      </details>
    </section>
  );
}

export default function TeamsPage({ teamDraft, onTeamDraftChange }) {
  const [pokemonList, setPokemonList] = useState([]);
  const [items, setItems] = useState([]);
  const [savedTeams, setSavedTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api("/teams").then((r) => r.data),
      api("/pokemon").then((r) => r.data),
      api("/items").then((r) => r.data)
    ]).then(([teams, pokemon, itemList]) => {
      setSavedTeams(teams);
      setPokemonList(pokemon);
      setItems(itemList);
      setLoading(false);
    });
  }, []);

  const slots = getDraftSlots(teamDraft.members);

  const handleUpdateMember = useCallback((index, member) => {
    const newSlots = [...getDraftSlots(teamDraft.members)];
    newSlots[index] = member;
    while (newSlots.length > 0 && !newSlots[newSlots.length - 1].pokemonId) newSlots.pop();
    onTeamDraftChange({ ...teamDraft, members: newSlots });
  }, [teamDraft, onTeamDraftChange]);

  const handleClearSlot = useCallback((index) => {
    handleUpdateMember(index, createDraftMember());
  }, [handleUpdateMember]);

  const handleSave = useCallback(async () => {
    const members = getDraftSlots(teamDraft.members)
      .filter((m) => m.pokemonId)
      .map((m, i) => ({
        slot: i + 1,
        pokemonId: m.pokemonId,
        nameZh: m.nameZh,
        level: Number(m.level || 50),
        itemId: m.itemId || undefined,
        abilityId: m.abilityId || undefined,
        nature: m.nature || undefined,
        moves: (m.moves || []).filter(Boolean),
        ivs: { ...createDefaultStats("iv"), ...(m.ivs || {}) },
        evs: { ...createDefaultStats("ev"), ...(m.evs || {}) }
      }));

    if (members.length === 0) {
      window.alert("请先至少填写一只宝可梦。");
      return;
    }

    const saved = await api("/teams", {
      method: "POST",
      body: JSON.stringify({
        id: teamDraft.id || undefined,
        name: teamDraft.name || "新队伍",
        format: teamDraft.format,
        members
      })
    });

    onTeamDraftChange({ ...teamDraft, id: saved.data.id, name: saved.data.name });
    // Refresh saved teams
    const teamsResult = await api("/teams");
    setSavedTeams(teamsResult.data);
  }, [teamDraft, onTeamDraftChange]);

  const handleLoadTeam = useCallback((team) => {
    onTeamDraftChange({
      id: team.id || "",
      name: team.name || "",
      format: team.format || "singles",
      members: (team.members || []).map((m) => ({
        pokemonId: m.pokemonId || "",
        nameZh: m.nameZh || m.pokemonId || "",
        level: m.level || 50,
        itemId: m.itemId || "",
        abilityId: m.abilityId || "",
        nature: m.nature || "认真",
        moves: [...(m.moves || []), "", "", "", ""].slice(0, 4),
        ivs: { ...createDefaultStats("iv"), ...(m.ivs || {}) },
        evs: { ...createDefaultStats("ev"), ...(m.evs || {}) }
      }))
    });
  }, [onTeamDraftChange]);

  const handleNewDraft = useCallback(() => {
    onTeamDraftChange({ id: "", name: "", format: "singles", members: [] });
  }, [onTeamDraftChange]);

  if (loading) return <Loading />;

  return (
    <section className="view-grid teams-layout">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">我的队伍</h2>
            <p className="panel-subtitle">现在已经支持 6 个位置的宝可梦编辑、性格、招式、个体值和努力值输入。</p>
          </div>
          {teamDraft.id
            ? <span className="chip">编辑中：{teamDraft.name || teamDraft.id}</span>
            : <span className="chip">新建队伍</span>}
        </div>
        <div className="team-builder">
          <div className="team-header-grid">
            <input
              placeholder="队伍名称"
              value={teamDraft.name}
              onChange={(e) => onTeamDraftChange({ ...teamDraft, name: e.target.value })}
            />
            <select
              value={teamDraft.format}
              onChange={(e) => onTeamDraftChange({ ...teamDraft, format: e.target.value })}
            >
              <option value="singles">单打</option>
              <option value="doubles">双打</option>
            </select>
          </div>

          <datalist id="pokemon-options">
            {pokemonList.map((p) => (
              <option key={p.id} value={p.slug || p.id}>{p.nameZh} / {p.nameEn || ""}</option>
            ))}
          </datalist>
          <datalist id="item-options">
            {items.map((item) => (
              <option key={item.id} value={item.slug || item.id}>{item.nameZh}</option>
            ))}
          </datalist>

          <div className="team-slot-grid">
            {slots.map((member, index) => (
              <MemberEditor
                key={index}
                member={member}
                index={index}
                pokemonList={pokemonList}
                items={items}
                onUpdate={handleUpdateMember}
                onClear={handleClearSlot}
              />
            ))}
          </div>

          <div className="toolbar-row">
            <button onClick={handleSave}>保存队伍</button>
            <button className="secondary" onClick={handleNewDraft}>新建草稿</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">已保存队伍</h2>
            <p className="panel-subtitle">点击"载入编辑"可以继续修改并覆盖保存。</p>
          </div>
          <span className="chip">{savedTeams.length} 支队伍</span>
        </div>
        <div className="team-list">
          {savedTeams.length === 0 && <div className="muted" style={{ padding: "0 24px 24px" }}>还没有保存的队伍。</div>}
          {savedTeams.map((team) => (
            <div key={team.id} className="list-card">
              <div className="card-topline">
                <strong>{team.name}</strong>
                <span className="chip">{team.format}</span>
              </div>
              <div className="muted">{(team.members || []).length} / 6 成员</div>
              <div className="forms-grid">
                {(team.members || []).map((m, i) => (
                  <span key={i} className="pill">{m.pokemonId}</span>
                ))}
                {(team.members || []).length === 0 && <span className="muted">暂无成员</span>}
              </div>
              <div className="toolbar-row">
                <button className="secondary compact-button" onClick={() => handleLoadTeam(team)}>载入编辑</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
