/**
 * localStorage 存储工具 —— 管理宝可梦配置（Box）和队伍（Teams）
 *
 * 数据结构：
 *   localdex_box: PokemonConfig[]   — 独立配置的宝可梦（不绑定队伍）
 *   localdex_teams: Team[]          — 队伍列表，成员可以是内联配置或引用 box 中的 configId
 *
 * PokemonConfig: {
 *   configId: string,       // 唯一 ID（本地生成）
 *   pokemonId: string,      // 宝可梦数据库数字 ID（如 "25"）
 *   nameZh: string,         // 显示名（中文名）
 *   level: number,
 *   itemId: string,         // 道具数据库数字 ID（如 "123"）
 *   itemName: string,       // 道具显示名（中文名）
 *   abilityId: string,      // 特性数据库数字 ID（如 "65"），旧数据可能是中文名
 *   abilityName: string,    // 特性显示名（中文名）
 *   nature: string,
 *   moves: string[4],
 *   ivs: { hp, atk, def, spa, spd, spe },
 *   evs: { hp, atk, def, spa, spd, spe },
 *   createdAt: number,      // 时间戳
 *   updatedAt: number
 * }
 *
 * Team: {
 *   teamId: string,
 *   name: string,
 *   format: string,         // "singles" | "doubles"
 *   members: TeamMember[],  // 最多 6 个
 *   createdAt: number,
 *   updatedAt: number
 * }
 *
 * TeamMember: {
 *   slot: number,           // 1-6
 *   configId?: string,      // 引用 box 中的配置（优先）
 *   ...PokemonConfig fields  // 或内联配置
 * }
 */

const BOX_KEY = "localdex_box";
const TEAMS_KEY = "localdex_teams";

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── 通用读写 ──

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function writeJSON(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ══════════════════════════════════════════════
//  宝可梦盒子（独立配置）
// ══════════════════════════════════════════════

export function getBox() {
  return readJSON(BOX_KEY);
}

export function getBoxConfig(configId) {
  return getBox().find((c) => c.configId === configId);
}

export function saveBoxConfig(config) {
  const box = getBox();
  const now = Date.now();

  if (config.configId) {
    // 更新已有
    const idx = box.findIndex((c) => c.configId === config.configId);
    if (idx >= 0) {
      box[idx] = { ...box[idx], ...config, updatedAt: now };
    } else {
      box.push({ ...config, createdAt: now, updatedAt: now });
    }
  } else {
    // 新建
    config.configId = generateId();
    config.createdAt = now;
    config.updatedAt = now;
    box.push(config);
  }

  writeJSON(BOX_KEY, box);
  return config;
}

export function deleteBoxConfig(configId) {
  const box = getBox().filter((c) => c.configId !== configId);
  writeJSON(BOX_KEY, box);
}

export function duplicateBoxConfig(configId) {
  const original = getBoxConfig(configId);
  if (!original) return null;
  const copy = {
    ...original,
    configId: generateId(),
    nameZh: (original.nameZh || "") + " (副本)",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const box = getBox();
  box.push(copy);
  writeJSON(BOX_KEY, box);
  return copy;
}

// ══════════════════════════════════════════════
//  队伍管理
// ══════════════════════════════════════════════

export function getTeams() {
  return readJSON(TEAMS_KEY);
}

export function getTeam(teamId) {
  return getTeams().find((t) => t.teamId === teamId);
}

export function saveTeam(team) {
  const teams = getTeams();
  const now = Date.now();

  if (team.teamId) {
    const idx = teams.findIndex((t) => t.teamId === team.teamId);
    if (idx >= 0) {
      teams[idx] = { ...teams[idx], ...team, updatedAt: now };
    } else {
      teams.push({ ...team, createdAt: now, updatedAt: now });
    }
  } else {
    team.teamId = generateId();
    team.createdAt = now;
    team.updatedAt = now;
    teams.push(team);
  }

  writeJSON(TEAMS_KEY, teams);
  return team;
}

export function deleteTeam(teamId) {
  const teams = getTeams().filter((t) => t.teamId !== teamId);
  writeJSON(TEAMS_KEY, teams);
}

export function duplicateTeam(teamId) {
  const original = getTeam(teamId);
  if (!original) return null;
  const copy = {
    ...original,
    teamId: generateId(),
    name: (original.name || "") + " (副本)",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const teams = getTeams();
  teams.push(copy);
  writeJSON(TEAMS_KEY, teams);
  return copy;
}

// ══════════════════════════════════════════════
//  辅助：解析队伍成员（将 configId 引用展开为完整配置）
// ══════════════════════════════════════════════

export function resolveTeamMembers(team) {
  if (!team?.members) return [];
  const box = getBox();
  const boxMap = new Map(box.map((c) => [c.configId, c]));

  return team.members.map((m) => {
    if (m.configId && boxMap.has(m.configId)) {
      return { ...boxMap.get(m.configId), slot: m.slot, configId: m.configId };
    }
    return m;
  });
}
