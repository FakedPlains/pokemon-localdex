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
  image?: ImageAsset;
  source?: SourceMeta;
};

export type GenderRatio = {
  male?: string;
  female?: string;
};

export type PokemonForm = {
  id: string;
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

export type PokemonGenerationRecord = {
  generation: number;
  label?: string;
  primaryType?: string;
  secondaryType?: string;
  abilityIds?: string[];
  hiddenAbilityId?: string;
  baseStats?: StatBlock;
  moveIds?: string[];
  notes?: string;
};

export type PokemonEntry = PokemonSummary & {
  category?: string;
  abilities?: string[];
  hiddenAbility?: string;
  abilityIds?: string[];
  hiddenAbilityId?: string;
  moveIds?: string[];
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
  effectSummary: string;
  notes?: string;
};

export type AbilityEntry = {
  id: string;
  slug: string;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  effectSummary?: string;
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
          ...(entry.forms?.map((form) => form.nameZh) ?? [])
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

    const matchesType = !type
      ? true
      : entry.primaryType === type ||
        entry.secondaryType === type ||
        entry.forms?.some((form) => form.primaryType === type || form.secondaryType === type) ||
        entry.generationRecords?.some((record) => record.primaryType === type || record.secondaryType === type);

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
