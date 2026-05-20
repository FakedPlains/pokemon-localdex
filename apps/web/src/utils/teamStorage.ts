/**
 * localStorage 存储工具 —— 管理宝可梦配置（Box）和队伍（Teams）
 *
 * 数据结构：
 *   localdex_box: PokemonConfig[]   — 独立配置的宝可梦（不绑定队伍）
 *   localdex_teams: Team[]          — 队伍列表，成员可以是内联配置或引用 box 中的 configId
 */

import type { StatBlock } from "@pokemon-localdex/store-types";

// ══════════════════════════════════════════════
//  类型定义
// ══════════════════════════════════════════════

/** 宝可梦配置（Box 中独立存储或 TeamMember 内联） */
export type PokemonConfig = {
  configId: string;
  /** 宝可梦数据库数字 ID（如 "25"） */
  pokemonId: string;
  /** 显示名（中文名） */
  nameZh: string;
  /** 用户自定义名称 */
  configName?: string;
  level: number;
  /** 道具数据库数字 ID（如 "123"） */
  itemId: string;
  /** 道具显示名（中文名） */
  itemName: string;
  /** 道具图片 URL */
  itemImageUrl?: string;
  /** 特性数据库数字 ID（如 "65"），旧数据可能是中文名 */
  abilityId: string;
  /** 特性显示名（中文名） */
  abilityName: string;
  nature: string;
  moves: [string, string, string, string];
  ivs: StatBlock;
  evs: StatBlock;
  /** Champions SP 值（仅 champions 模式使用） */
  sps?: Partial<StatBlock>;
  /** "classic" | "champions" */
  statMode?: string;
  /** Champions 模式下的性格（可能与 nature 不同） */
  champNature?: string;
  /** 形态数据库 ID */
  formId?: string;
  /** 形态 key（如 "default"） */
  formKey?: string;
  /** 形态显示名 */
  formName?: string;
  /** 普通形态图片 URL */
  imageUrl?: string;
  /** 闪光形态图片 URL */
  shinyImageUrl?: string;
  /** 是否闪光 */
  isShiny?: boolean;
  /** 种族值（从形态同步） */
  baseStats?: StatBlock;
  /** 第一属性 */
  primaryType?: string;
  /** 第二属性 */
  secondaryType?: string;
  /** 招式类型/威力缓存 */
  _movesInfo?: Record<string, { moveId?: number | null; type: string; power: string | number; category: string }>;
  createdAt: number;
  updatedAt: number;
};

/** 内联队伍成员（完整配置） */
export type TeamMemberInline = PokemonConfig & {
  /** 1-6 */
  slot: number;
};

/** 引用型队伍成员（指向盒子中的配置） */
export type TeamMemberRef = {
  slot: number;
  configId: string;
  /** 显式排除 pokemonId，使联合类型可区分 */
  pokemonId?: undefined;
};

/** 队伍成员：内联配置或盒子引用 */
export type TeamMember = TeamMemberInline | TeamMemberRef;

/** 类型保护：是否为引用型成员 */
export function isTeamMemberRef(m: TeamMember): m is TeamMemberRef {
  return !('pokemonId' in m);
}

/** 队伍 */
export type Team = {
  teamId: string;
  name: string;
  /** "singles" | "doubles" */
  format: string;
  members: TeamMember[];
  createdAt: number;
  updatedAt: number;
};

// ══════════════════════════════════════════════
//  草稿类型与补全
// ══════════════════════════════════════════════

/** 宝可梦配置草稿（编辑态，字段允许缺失） */
export type PokemonConfigDraft = Partial<PokemonConfig> & {
  /** 至少需要 pokemonId 才能有效保存 */
  pokemonId?: string;
  slot?: number;
};

const DEFAULT_IVS: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const DEFAULT_EVS: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

/** 将招式数组填充/截断为固定 4 元组（不足补空字符串，多余截断） */
export function padMoves4(moves: unknown): [string, string, string, string] {
  const arr = Array.isArray(moves) ? moves : [];
  return [
    typeof arr[0] === "string" ? arr[0] : "",
    typeof arr[1] === "string" ? arr[1] : "",
    typeof arr[2] === "string" ? arr[2] : "",
    typeof arr[3] === "string" ? arr[3] : "",
  ];
}

/** 将草稿补全为完整的 PokemonConfig（填充所有必填字段的默认值） */
export function completePokemonConfig(
  draft: PokemonConfigDraft,
  overrides?: { configId?: string; createdAt?: number; updatedAt?: number },
): PokemonConfig {
  const now = Date.now();
  return {
    configId: overrides?.configId ?? draft.configId ?? "",
    pokemonId: draft.pokemonId ?? "",
    nameZh: draft.nameZh ?? "",
    configName: draft.configName,
    level: draft.level ?? 50,
    itemId: draft.itemId ?? "",
    itemName: draft.itemName ?? "",
    itemImageUrl: draft.itemImageUrl,
    abilityId: draft.abilityId ?? "",
    abilityName: draft.abilityName ?? "",
    nature: draft.nature ?? "认真",
    moves: padMoves4(draft.moves),
    ivs: draft.ivs ?? { ...DEFAULT_IVS },
    evs: draft.evs ?? { ...DEFAULT_EVS },
    sps: draft.sps,
    statMode: draft.statMode,
    champNature: draft.champNature,
    formId: draft.formId,
    formKey: draft.formKey,
    formName: draft.formName,
    imageUrl: draft.imageUrl,
    shinyImageUrl: draft.shinyImageUrl,
    isShiny: draft.isShiny,
    baseStats: draft.baseStats,
    primaryType: draft.primaryType,
    secondaryType: draft.secondaryType,
    _movesInfo: draft._movesInfo,
    createdAt: overrides?.createdAt ?? draft.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
  };
}

// ══════════════════════════════════════════════
//  内部工具
// ══════════════════════════════════════════════

const BOX_KEY = "localdex_box";
const TEAMS_KEY = "localdex_teams";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function readJSON<T>(key: string, validate?: (item: unknown) => item is T): T[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(raw)) return [];
    if (!validate) return raw as T[];
    return raw.filter(validate);
  } catch {
    return [];
  }
}

/** 运行时类型守卫：检查一个对象是否是有效的 PokemonConfig */
export function isPokemonConfig(item: unknown): item is PokemonConfig {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.configId === "string" && obj.configId.length > 0 &&
    typeof obj.pokemonId === "string" && obj.pokemonId.length > 0 &&
    typeof obj.nameZh === "string" &&
    typeof obj.level === "number" &&
    Array.isArray(obj.moves) &&
    typeof obj.createdAt === "number"
  );
}

/** 运行时类型守卫：检查一个对象是否是有效的 Team */
export function isTeam(item: unknown): item is Team {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.teamId === "string" && obj.teamId.length > 0 &&
    typeof obj.name === "string" &&
    Array.isArray(obj.members) &&
    typeof obj.createdAt === "number"
  );
}

function writeJSON<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ══════════════════════════════════════════════
//  宝可梦盒子（独立配置）
// ══════════════════════════════════════════════

export function getBox(): PokemonConfig[] {
  return readJSON<PokemonConfig>(BOX_KEY, isPokemonConfig);
}

export function getBoxConfig(configId: string): PokemonConfig | undefined {
  return getBox().find((c) => c.configId === configId);
}

export function saveBoxConfig(config: PokemonConfigDraft & { configId?: string }): PokemonConfig {
  const box = getBox();
  const now = Date.now();

  if (config.configId) {
    // 更新已有
    const idx = box.findIndex((c) => c.configId === config.configId);
    if (idx >= 0) {
      const updated = completePokemonConfig(
        { ...box[idx], ...config },
        { configId: config.configId, createdAt: box[idx]!.createdAt, updatedAt: now },
      );
      box[idx] = updated;
      writeJSON(BOX_KEY, box);
      return updated;
    }
    // configId 不在 box 中，当新建处理
    const entry = completePokemonConfig(config, { configId: config.configId, createdAt: now, updatedAt: now });
    box.push(entry);
    writeJSON(BOX_KEY, box);
    return entry;
  }

  // 新建
  const entry = completePokemonConfig(config, { configId: generateId(), createdAt: now, updatedAt: now });
  box.push(entry);
  writeJSON(BOX_KEY, box);
  return entry;
}

export function deleteBoxConfig(configId: string): void {
  const box = getBox().filter((c) => c.configId !== configId);
  writeJSON(BOX_KEY, box);
}

export function duplicateBoxConfig(configId: string): PokemonConfig | null {
  const original = getBoxConfig(configId);
  if (!original) return null;
  const copy: PokemonConfig = {
    ...original,
    configId: generateId(),
    nameZh: (original.nameZh || "") + " (副本)",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const box = getBox();
  box.push(copy);
  writeJSON(BOX_KEY, box);
  return copy;
}

// ══════════════════════════════════════════════
//  队伍管理
// ══════════════════════════════════════════════

export function getTeams(): Team[] {
  return readJSON<Team>(TEAMS_KEY, isTeam);
}

export function getTeam(teamId: string): Team | undefined {
  return getTeams().find((t) => t.teamId === teamId);
}

export function saveTeam(team: Partial<Team> & { teamId?: string; members?: TeamMember[] }): Team {
  const teams = getTeams();
  const now = Date.now();

  const completeTeam = (base: Partial<Team>, id: string, created: number): Team => ({
    teamId: id,
    name: base.name ?? "",
    format: base.format ?? "singles",
    members: base.members as TeamMember[] ?? [],
    createdAt: created,
    updatedAt: now,
  });

  if (team.teamId) {
    const idx = teams.findIndex((t) => t.teamId === team.teamId);
    if (idx >= 0) {
      const updated = completeTeam({ ...teams[idx], ...team }, team.teamId, teams[idx]!.createdAt);
      teams[idx] = updated;
      writeJSON(TEAMS_KEY, teams);
      return updated;
    }
    const entry = completeTeam(team, team.teamId, now);
    teams.push(entry);
    writeJSON(TEAMS_KEY, teams);
    return entry;
  }

  const entry = completeTeam(team, generateId(), now);
  teams.push(entry);
  writeJSON(TEAMS_KEY, teams);
  return entry;
}

export function deleteTeam(teamId: string): void {
  const teams = getTeams().filter((t) => t.teamId !== teamId);
  writeJSON(TEAMS_KEY, teams);
}

export function duplicateTeam(teamId: string): Team | null {
  const original = getTeam(teamId);
  if (!original) return null;
  const copy: Team = {
    ...original,
    teamId: generateId(),
    name: (original.name || "") + " (副本)",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const teams = getTeams();
  teams.push(copy);
  writeJSON(TEAMS_KEY, teams);
  return copy;
}

// ══════════════════════════════════════════════
//  辅助：解析队伍成员（将 configId 引用展开为完整配置）
// ══════════════════════════════════════════════

export function resolveTeamMembers(team: Team | undefined | null): TeamMemberInline[] {
  if (!team?.members) return [];
  const box = getBox();
  const boxMap = new Map<string, PokemonConfig>(box.map((c) => [c.configId, c]));

  return team.members
    .map((m): TeamMemberInline | null => {
      if (isTeamMemberRef(m)) {
        const boxConfig = boxMap.get(m.configId);
        if (!boxConfig) return null; // 引用失效，跳过
        return { ...boxConfig, slot: m.slot, configId: m.configId };
      }
      return m;
    })
    .filter((m): m is TeamMemberInline => m !== null);
}
