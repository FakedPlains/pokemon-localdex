import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../../");
const NORMALIZED_DIR = resolve(ROOT, "data/normalized");
const POKEMON_FILE = resolve(NORMALIZED_DIR, "pokemon.json");
const ITEMS_FILE = resolve(NORMALIZED_DIR, "items.json");
const TEAMS_FILE = resolve(NORMALIZED_DIR, "teams.json");

export type StatBlock = {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
};

export type PokemonSummary = {
  id: string;
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
  slug: string;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  category?: string;
  effectSummary?: string;
  source?: SourceMeta;
};

export type SourceMeta = {
  url: string;
  title: string;
  fetchedAt: string;
};

export type GenderRatio = {
  male?: string;
  female?: string;
};

export type PokemonEntry = PokemonSummary & {
  category?: string;
  abilities?: string[];
  hiddenAbility?: string;
  heightM?: number;
  weightKg?: number;
  color?: string;
  catchRate?: number;
  genderRatio?: GenderRatio;
  baseStats?: StatBlock;
  source?: SourceMeta;
  parseNote?: string;
};

export type TeamMember = {
  slot: number;
  pokemonId: string;
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

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function ensureJsonFile(filePath, initialValue) {
  if (!existsSync(filePath)) {
    ensureDir(filePath);
    writeFileSync(filePath, JSON.stringify(initialValue, null, 2));
  }
}

function readJson(filePath, fallbackValue) {
  ensureJsonFile(filePath, fallbackValue);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
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
