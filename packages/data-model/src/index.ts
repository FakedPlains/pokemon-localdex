import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../../");
const NORMALIZED_DIR = resolve(ROOT, "data/normalized");
const POKEMON_FILE = resolve(NORMALIZED_DIR, "pokemon.json");
const ITEMS_FILE = resolve(NORMALIZED_DIR, "items.json");
const MOVES_FILE = resolve(NORMALIZED_DIR, "moves.json");
const ABILITIES_FILE = resolve(NORMALIZED_DIR, "abilities.json");
const TEAMS_FILE = resolve(NORMALIZED_DIR, "teams.json");

export type StatBlock = {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
};

export type SourceMeta = {
  url: string;
  title: string;
  fetchedAt: string;
};

export type ImageAsset = {
  url: string;
  alt?: string;
  sourceUrl?: string;
};

export type PokemonImageSet = {
  official?: ImageAsset;
  shinyOfficial?: ImageAsset;
  sprite?: ImageAsset;
  shinySprite?: ImageAsset;
};

export type PokemonEvolutionMember = {
  id: string;
  legacyId?: string;
  dexNumber: number;
  slug: string;
  nameZh: string;
  nameEn?: string;
  primaryType?: string;
  secondaryType?: string;
  stageLabel?: string;
  image?: ImageAsset;
};

export type PokemonSummary = {
  id: string;
  legacyId?: string;
  dexNumber: number;
  slug: string;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  generations: number[];
  primaryType?: string;
  secondaryType?: string;
};

export type ItemEntry = {
  id: string;
  legacyId?: string;
  slug: string;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  category?: string;
  effectSummary?: string;
  image?: ImageAsset;
  source?: SourceMeta;
};

export type GenderRatio = {
  male?: string;
  female?: string;
};

export type PokemonForm = {
  id: string;
  legacyId?: string;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  primaryType?: string;
  secondaryType?: string;
  abilityIds?: string[];
  baseStats?: StatBlock;
  introducedGeneration?: number;
  isMega?: boolean;
  notes?: string;
  images?: PokemonImageSet;
};

export type RegionalDexRecord = {
  region: string;
  dexNumber?: string;
};

export type GenerationAvailability = {
  generation: number;
  regions?: RegionalDexRecord[];
};

export type PokemonLearnsetRecord = {
  moveId: string;
  moveNameZh?: string;
  learnMethod?: "level-up" | "tm" | "hm" | "egg" | "tutor" | "event" | "evolution" | "other";
  level?: number;
  notes?: string;
};

export type PokemonGenerationRecord = {
  generation: number;
  label?: string;
  primaryType?: string;
  secondaryType?: string;
  abilityIds?: string[];
  hiddenAbilityId?: string;
  baseStats?: StatBlock;
  moveIds?: string[];
  learnset?: PokemonLearnsetRecord[];
  notes?: string;
};

export type PokemonEntry = PokemonSummary & {
  category?: string;
  abilities?: string[];
  hiddenAbility?: string;
  abilityIds?: string[];
  hiddenAbilityId?: string;
  moveIds?: string[];
  evolutionChain?: PokemonEvolutionMember[];
  heightM?: number;
  weightKg?: number;
  color?: string;
  catchRate?: number;
  genderRatio?: GenderRatio;
  baseStats?: StatBlock;
  images?: PokemonImageSet;
  forms?: PokemonForm[];
  generationAvailability?: GenerationAvailability[];
  generationRecords?: PokemonGenerationRecord[];
  source?: SourceMeta;
  parseNote?: string;
};

export type MoveGenerationRecord = {
  generation: number;
  type?: string;
  category?: string;
  power?: number;
  accuracy?: string;
  pp?: number;
  effectSummary: string;
  notes?: string;
};

export type MoveEntry = {
  id: string;
  legacyId?: string;
  slug: string;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  type?: string;
  category?: string;
  power?: number;
  accuracy?: string;
  pp?: number;
  effectSummary?: string;
  image?: ImageAsset;
  generations: MoveGenerationRecord[];
  source?: SourceMeta;
};

export type AbilityGenerationRecord = {
  generation: number;
  description: string;
  notes?: string;
};

export type AbilityEntry = {
  id: string;
  number?: number;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  description?: string;
  effectDetail?: string;
  introducedGeneration?: number;
  image?: ImageAsset;
  generations: AbilityGenerationRecord[];
  source?: SourceMeta;
};

export type TeamMember = {
  slot: number;
  pokemonId: string;
  nameZh?: string;
  level: number;
  itemId?: string;
  abilityId?: string;
  nature?: string;
  moves: string[];
  ivs: Partial<StatBlock>;
  evs: Partial<StatBlock>;
};

export type BattleTeam = {
  id: string;
  name: string;
  format: string;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
};

function ensureDir(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function ensureJsonFile(filePath: string, initialValue: unknown) {
  if (!existsSync(filePath)) {
    ensureDir(filePath);
    writeFileSync(filePath, JSON.stringify(initialValue, null, 2));
  }
}

function readJson<T>(filePath: string, fallbackValue: T): T {
  ensureJsonFile(filePath, fallbackValue);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export function listPokemonSummaries(): PokemonSummary[] {
  return readJson(POKEMON_FILE, []);
}

export function listPokemonEntries(): PokemonEntry[] {
  return readJson(POKEMON_FILE, []);
}

export function listItems(): ItemEntry[] {
  return readJson(ITEMS_FILE, []);
}

export function listMoves(): MoveEntry[] {
  return readJson(MOVES_FILE, []);
}

export function listAbilities(): AbilityEntry[] {
  return readJson(ABILITIES_FILE, []);
}

export function readTeams(): BattleTeam[] {
  return readJson(TEAMS_FILE, []);
}

export function saveTeam(input: Partial<BattleTeam>): BattleTeam {
  const teams = readTeams();
  const now = new Date().toISOString();
  const team: BattleTeam = {
    id: input.id ?? `team_${Date.now()}`,
    name: input.name ?? "未命名队伍",
    format: input.format ?? "singles",
    members: input.members ?? [],
    createdAt: input.createdAt ?? now,
    updatedAt: now
  };

  const index = teams.findIndex((item) => item.id === team.id);
  if (index >= 0) {
    teams[index] = { ...teams[index], ...team, updatedAt: now };
  } else {
    teams.push(team);
  }

  writeJson(TEAMS_FILE, teams);
  return team;
}

export function replaceTeams(teams: BattleTeam[]) {
  writeJson(TEAMS_FILE, teams);
}

export function replacePokemonEntries(entries: PokemonEntry[]) {
  writeJson(POKEMON_FILE, entries);
}

export function replaceItems(items: ItemEntry[]) {
  writeJson(ITEMS_FILE, items);
}

export function replaceMoves(moves: MoveEntry[]) {
  writeJson(MOVES_FILE, moves);
}

export function replaceAbilities(abilities: AbilityEntry[]) {
  writeJson(ABILITIES_FILE, abilities);
}

const POKEMON_TYPES = [
  "一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面",
  "飞行", "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精"
];
const TYPE_ALIASES: Record<string, string> = {
  電: "电",
  飛行: "飞行",
  蟲: "虫",
  龍: "龙",
  惡: "恶",
  鋼: "钢",
  格鬥: "格斗",
  幽靈: "幽灵"
};

function normalizeTypeName(type: string | undefined) {
  return TYPE_ALIASES[String(type || "").trim()] || String(type || "").trim();
}

function splitTypeNames(type: string | undefined) {
  const normalized = normalizeTypeName(type);
  if (!normalized) {
    return [];
  }
  if (POKEMON_TYPES.includes(normalized)) {
    return [normalized];
  }

  const result: string[] = [];
  let remaining = normalized;
  const candidates = [...POKEMON_TYPES, ...Object.keys(TYPE_ALIASES)]
    .sort((left, right) => right.length - left.length);

  while (remaining) {
    const matched = candidates.find((candidate) => remaining.startsWith(candidate));
    if (!matched) {
      return [normalized];
    }
    result.push(normalizeTypeName(matched));
    remaining = remaining.slice(matched.length);
  }

  return result;
}

function hasType(typeValue: string | undefined, expectedType: string) {
  return splitTypeNames(typeValue).includes(expectedType);
}

function isSearchablePokemonFormName(name: string | undefined) {
  if (!name || /[{}]/.test(name)) {
    return false;
  }

  const text = name.trim();
  if (!text || text.length > 24 || /[／/]/.test(text)) {
    return false;
  }

  return !/^(第[一二三四五六七八九]+世代|获得方式|宝可梦|游戏版本|地点|方式|备注|金|银|水晶版|红宝石|蓝宝石|绿宝石|火红|叶绿|钻石|珍珠|白金|心金|魂银|黑|白|黑２|白２|Ｘ|Ｙ|太阳|月亮|究极之日|究极之月|Let's|Go！皮卡丘|Go！伊布|传说|阿尔宙斯|朱|紫|Z-A)$|冒[险險]/.test(text);
}

function searchablePokemonFormNames(entry: PokemonEntry) {
  return (entry.forms ?? [])
    .map((form) => form.nameZh)
    .filter(isSearchablePokemonFormName);
}

export function searchPokemonEntries(filters?: {
  query?: string;
  type?: string;
  generation?: number;
}) {
  const query = filters?.query?.trim().toLowerCase();
  const type = filters?.type?.trim();
  const generation = filters?.generation;

  return listPokemonEntries().filter((entry) => {
    const matchesQuery = !query
      ? true
      : [
          entry.id,
          entry.slug,
          entry.nameZh,
          entry.nameJa,
          entry.nameEn,
          ...searchablePokemonFormNames(entry)
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

    const matchesType = !type
      ? true
      : hasType(entry.primaryType, type) ||
        hasType(entry.secondaryType, type) ||
        entry.forms?.some((form) => hasType(form.primaryType, type) || hasType(form.secondaryType, type)) ||
        entry.generationRecords?.some((record) => hasType(record.primaryType, type) || hasType(record.secondaryType, type));

    const matchesGeneration = !generation
      ? true
      : entry.generations.includes(generation) ||
        entry.generationAvailability?.some((record) => record.generation === generation) ||
        entry.generationRecords?.some((record) => record.generation === generation) ||
        entry.forms?.some((form) => form.introducedGeneration === generation);

    return matchesQuery && matchesType && matchesGeneration;
  });
}

export function searchMoves(filters?: {
  query?: string;
  type?: string;
  generation?: number;
}) {
  const query = filters?.query?.trim().toLowerCase();
  const type = filters?.type?.trim();
  const generation = filters?.generation;

  return listMoves().filter((entry) => {
    const matchesQuery = !query
      ? true
      : [entry.id, entry.slug, entry.nameZh, entry.nameJa, entry.nameEn]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

    const matchesType = !type
      ? true
      : entry.type === type || entry.generations.some((record) => record.type === type);

    const matchesGeneration = !generation
      ? true
      : entry.generations.some((record) => record.generation === generation);

    return matchesQuery && matchesType && matchesGeneration;
  });
}

export function searchAbilities(filters?: {
  query?: string;
  generation?: number;
}) {
  const query = filters?.query?.trim().toLowerCase();
  const generation = filters?.generation;

  return listAbilities().filter((entry) => {
    const matchesQuery = !query
      ? true
      : [entry.id, entry.slug, entry.nameZh, entry.nameJa, entry.nameEn]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

    const matchesGeneration = !generation
      ? true
      : entry.generations.some((record) => record.generation === generation);

    return matchesQuery && matchesGeneration;
  });
}
