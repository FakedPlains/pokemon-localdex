import type { StatBlock } from "@pokemon-localdex/store-types";
import { GAME_VERSION_NAMES } from "@pokemon-localdex/store-types";

export function buildStatBlock(row: Record<string, unknown>): StatBlock | undefined {
  if (row.hp == null) return undefined;
  return {
    hp: Number(row.hp),
    atk: Number(row.atk),
    def: Number(row.def),
    spa: Number(row.spa),
    spd: Number(row.spd),
    spe: Number(row.spe),
  };
}

export function buildSource(row: Record<string, unknown>) {
  return (row.sourceUrl || row.sourceTitle || row.sourceFetchedAt)
    ? {
        url: String(row.sourceUrl ?? ""),
        title: String(row.sourceTitle ?? ""),
        fetchedAt: String(row.sourceFetchedAt ?? ""),
      }
    : undefined;
}

export function hydrateGenRecord(r: Record<string, unknown>) {
  const code = r.gameVersionCode ? String(r.gameVersionCode) : undefined;
  return {
    generation: Number(r.generation),
    gameVersionCode: code,
    gameVersionName: code ? GAME_VERSION_NAMES.get(code) : undefined,
    versionExclusive: Number(r.versionExclusive) === 1,
    description: r.description ? String(r.description) : "",
    notes: r.notes ? String(r.notes) : undefined,
  };
}

function normalizeChampionFormName(value: string | undefined, speciesName?: string): string {
  const normalizeBasic = (input: string | undefined) =>
    (input || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[（）()・·･\s　\-_]/g, "");

  let normalized = normalizeBasic(value);
  const species = normalizeBasic(speciesName);
  if (species) normalized = normalized.replaceAll(species, "");
  return normalized.replaceAll("的样子", "").replaceAll("样子", "");
}

export function championFormNameMatches(form: any, championName: string, speciesName?: string): boolean {
  const target = normalizeChampionFormName(championName, speciesName);
  if (!target) return false;

  const candidates = [
    normalizeChampionFormName(form.nameZh, speciesName),
    normalizeChampionFormName(form.formKey, speciesName),
  ].filter(Boolean);

  return candidates.some((candidate) =>
    candidate === target || candidate.includes(target) || target.includes(candidate),
  );
}
