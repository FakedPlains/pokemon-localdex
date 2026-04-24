import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import {
  type AbilityEntry,
  type ItemEntry,
  type MoveEntry,
  type PokemonEntry,
  type PokemonForm,
  type RegionalDexRecord,
  listAbilities,
  listItems,
  listMoves,
  listPokemonEntries,
  replaceAbilities,
  replaceItems,
  replaceMoves,
  replacePokemonEntries
} from "../../data-model/src/index.ts";

const ROOT = resolve(import.meta.dirname, "../../../");
const RAW_DIR = resolve(ROOT, "data/raw");
const IMPORT_PROGRESS_FILE = resolve(RAW_DIR, "import-progress-52poke.json");
const FIXTURE_DIR = resolve(import.meta.dirname, "../fixtures");
const CACHE_DIR = resolve(ROOT, "apps/web/public/assets/cache");
const WEB_ASSET_ROOT = "/assets/demo";
const WEB_CACHE_ROOT = "/assets/cache";

const POKEMON_LIST_URL =
  "https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E5%85%A8%E5%9B%BD%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89/%E7%AE%80%E5%8D%95%E7%89%88";
const ITEM_LIST_URL = "https://wiki.52poke.com/wiki/%E9%81%93%E5%85%B7%E5%88%97%E8%A1%A8";

export type RawPage = {
  url: string;
  title: string;
  fetchedAt: string;
  html: string;
};

type PokemonSeed = {
  dexNumber: number;
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  generations: number[];
  detailUrl: string;
};

type ItemSeed = {
  nameZh: string;
  nameJa?: string;
  nameEn?: string;
  category?: string;
  effectSummary?: string;
  detailUrl: string;
};

type ScrapedMoveStub = {
  nameZh: string;
  generation: number;
  type?: string;
  category?: string;
  power?: number;
  accuracy?: string;
  pp?: number;
  source?: {
    url: string;
    title: string;
    fetchedAt: string;
  };
};

type FetchPageOptions = {
  preferCache?: boolean;
  refresh?: boolean;
};

type Import52pokeOptions = {
  pokemonLimit?: number;
  startDex?: number;
  endDex?: number;
  onlyMissing?: boolean;
  preferCache?: boolean;
  refreshRaw?: boolean;
  checkpointEvery?: number;
  concurrency?: number;
};

type Import52pokeProgress = {
  startedAt: string;
  updatedAt: string;
  totalSeeds: number;
  processedCount: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  lastDexNumber?: number;
  processedDexNumbers: number[];
  failed: Array<{ dexNumber: number; nameZh: string; error: string }>;
};

function ensureDir(pathname: string) {
  mkdirSync(dirname(pathname), { recursive: true });
}

function slugify(input: string) {
  return input
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(input: string) {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|table|section|h\d|ul|ol|li|tbody|thead|td|th)>/gi, "\n")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
  );
}

function normalizeText(input: string) {
  return stripTags(input)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function toAbsoluteUrl(href: string) {
  if (href.startsWith("http")) {
    return href;
  }
  return `https://wiki.52poke.com${href}`;
}

function readFixture(fileName: string) {
  return readFileSync(resolve(FIXTURE_DIR, fileName), "utf8");
}

function readRawPageCache(slug: string): RawPage | undefined {
  const pathname = resolve(RAW_DIR, `${slug}.json`);
  if (!existsSync(pathname)) {
    return undefined;
  }
  return JSON.parse(readFileSync(pathname, "utf8"));
}

function writeImportProgress(progress: Import52pokeProgress) {
  ensureDir(IMPORT_PROGRESS_FILE);
  writeFileSync(IMPORT_PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function assetUrl(pathname: string) {
  return `${WEB_ASSET_ROOT}/${pathname}`;
}

function cacheAssetUrl(pathname: string) {
  return `${WEB_CACHE_ROOT}/${pathname}`;
}

function readNumber(input: string | undefined) {
  if (!input) {
    return undefined;
  }

  const matched = input.match(/(\d+(?:\.\d+)?)/);
  return matched ? Number(matched[1]) : undefined;
}

function normalizeCategory(input: string | undefined) {
  if (!input) {
    return undefined;
  }
  if (input === "物理") {
    return "physical";
  }
  if (input === "特殊") {
    return "special";
  }
  if (input === "变化") {
    return "status";
  }
  return input.toLowerCase();
}

function formatAccuracy(input: string | undefined) {
  if (!input || input === "—") {
    return input;
  }
  return /^\d+$/.test(input) ? `${input}%` : input;
}

function normalizePower(input: string | undefined) {
  if (!input || input === "—" || input === "变化") {
    return undefined;
  }
  const matched = input.match(/^\d+$/);
  return matched ? Number(input) : undefined;
}

function normalizePp(input: string | undefined) {
  if (!input || input === "—") {
    return undefined;
  }
  return /^\d+$/.test(input) ? Number(input) : undefined;
}

function normalizeMediaUrl(url: string) {
  const absolute = url.startsWith("//")
    ? `https:${url}`
    : url.startsWith("/")
      ? `https://wiki.52poke.com${url}`
      : url;

  if (!absolute.includes("/thumb/")) {
    return absolute;
  }

  const [prefix = "", tail = ""] = absolute.split("/thumb/");
  const parts = tail.split("/");
  if (parts.length < 3) {
    return absolute;
  }
  return `${prefix}/${parts[0]}/${parts[1]}/${parts[2]}`;
}

function extractFileNameFromUrl(url: string) {
  const fileName = decodeURIComponent(url.split("?")[0].split("#")[0].split("/").pop() || "");
  return fileName.replace(/^\d+px-/, "");
}

function inferImageExtension(url: string, contentType?: string | null) {
  const byType = contentType?.split(";")[0]?.trim().toLowerCase();
  const contentTypeMap = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg"
  };
  if (byType && contentTypeMap[byType as keyof typeof contentTypeMap]) {
    return contentTypeMap[byType as keyof typeof contentTypeMap];
  }

  const extension = extname(extractFileNameFromUrl(url)).toLowerCase();
  return extension || ".png";
}

function extractImageCandidates(html: string) {
  const found = new Set<string>();
  const pattern = /\b(?:src|data-src|srcset)=["']([^"']+)["']/gi;

  for (const match of html.matchAll(pattern)) {
    const rawValue = match[1];
    const candidates = rawValue.includes(",")
      ? rawValue.split(",").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean)
      : [rawValue.trim()];

    for (const candidate of candidates) {
      const normalized = normalizeMediaUrl(candidate);
      const fileName = extractFileNameFromUrl(normalized);
      if (!/^https?:/.test(normalized)) {
        continue;
      }
      if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(fileName)) {
        continue;
      }
      if (
        /favicon|logo|spritecss|wiki\.png|commons-logo|poweredby_mediawiki|blank\.png/i.test(fileName)
      ) {
        continue;
      }
      found.add(normalized);
    }
  }

  return [...found];
}

function getPokemonImageHeuristics(seed: PokemonSeed) {
  const dex3 = seed.dexNumber.toString().padStart(3, "0");
  const dex4 = seed.dexNumber.toString().padStart(4, "0");
  const englishToken = (seed.nameEn || "")
    .replace(/[♀♂]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "");
  return {
    dex3,
    dex4,
    englishToken: englishToken.toLowerCase()
  };
}

function hasShinyMarker(fileName: string) {
  return /(?:^|[_\-\s])s(?:[_\-.]|$)|spr_[0-9]+s_|shiny|色违|異色|异色/i.test(fileName);
}

function hasSpriteMarker(fileName: string) {
  return /^(spr|mspr)|sprite|icon/i.test(fileName);
}

function hasOfficialMarker(fileName: string) {
  return /artwork|official|home|poke_capture|cap\d+/i.test(fileName);
}

function scoreBasePokemonImage(fileName: string, seed: PokemonSeed, kind: "official" | "sprite" | "shinySprite" | "shinyOfficial") {
  const normalized = fileName.toLowerCase();
  const { dex3, dex4, englishToken } = getPokemonImageHeuristics(seed);
  let score = 0;

  if (normalized.includes(dex3.toLowerCase())) score += 5;
  if (normalized.includes(dex4.toLowerCase())) score += 5;
  if (englishToken && normalized.includes(englishToken)) score += 6;
  if (hasSpriteMarker(fileName)) score += kind.includes("sprite") ? 7 : -4;
  if (hasOfficialMarker(fileName)) score += kind.includes("official") ? 7 : -2;
  if (normalized.includes("dream")) score -= 3;
  if (normalized.includes("home")) score += 1;
  if (normalized.includes("mega") || normalized.includes("alola") || normalized.includes("galar") || normalized.includes("hisui") || normalized.includes("paldea")) score -= 4;
  if (hasShinyMarker(fileName)) score += kind.startsWith("shiny") ? 8 : -6;
  if (kind === "official" && !hasSpriteMarker(fileName) && !hasShinyMarker(fileName)) score += 4;
  if (kind === "shinyOfficial" && !hasSpriteMarker(fileName) && hasShinyMarker(fileName)) score += 5;
  if (kind === "sprite" && hasSpriteMarker(fileName) && !hasShinyMarker(fileName)) score += 4;
  if (kind === "shinySprite" && hasSpriteMarker(fileName) && hasShinyMarker(fileName)) score += 5;
  return score;
}

function getFormKeywordHints(nameZh: string) {
  const hints = [];
  if (nameZh.includes("超级")) hints.push("mega");
  if (nameZh.includes("超极巨")) hints.push("gigantamax");
  if (nameZh.includes("阿罗拉")) hints.push("alola");
  if (nameZh.includes("伽勒尔")) hints.push("galar");
  if (nameZh.includes("洗翠")) hints.push("hisui");
  if (nameZh.includes("帕底亚")) hints.push("paldea");
  if (nameZh.includes("X")) hints.push("mega x", "x");
  if (nameZh.includes("Y")) hints.push("mega y", "y");
  return hints;
}

function scoreFormImage(fileName: string, seed: PokemonSeed, form: PokemonForm, kind: "official" | "shinyOfficial" = "official") {
  const normalized = fileName.toLowerCase();
  const { dex3, dex4, englishToken } = getPokemonImageHeuristics(seed);
  let score = 0;
  if (normalized.includes(dex3.toLowerCase())) score += 5;
  if (normalized.includes(dex4.toLowerCase())) score += 5;
  if (englishToken && normalized.includes(englishToken)) score += 6;
  for (const hint of getFormKeywordHints(form.nameZh)) {
    if (normalized.includes(hint)) {
      score += 6;
    }
  }
  if (hasSpriteMarker(fileName)) score -= 3;
  if (hasShinyMarker(fileName)) {
    score += kind === "shinyOfficial" ? 7 : -6;
  } else if (kind === "shinyOfficial") {
    score -= 5;
  }
  return score;
}

function scoreItemImage(fileName: string, item: ItemSeed) {
  const normalized = fileName.toLowerCase();
  const englishToken = (item.nameEn || "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toLowerCase();
  let score = 0;
  if (englishToken && normalized.includes(englishToken)) score += 7;
  if (normalized.includes(slugify(item.nameZh).replace(/-/g, ""))) score += 4;
  if (normalized.includes("bag") || normalized.includes("item")) score += 2;
  if (normalized.includes("icon")) score += 2;
  if (normalized.includes("sprite") || normalized.startsWith("spr")) score -= 3;
  if (normalized.includes("type") || normalized.includes("move")) score -= 5;
  return score;
}

export function resolvePokemonImageCandidateUrls(pageHtml: string, seed: PokemonSeed, forms?: PokemonForm[]) {
  const imageUrls = extractImageCandidates(pageHtml);
  const shinyImageUrls = imageUrls.filter((url) => hasShinyMarker(extractFileNameFromUrl(url)));
  const shinyOfficialUrls = shinyImageUrls.filter((url) => !hasSpriteMarker(extractFileNameFromUrl(url)));
  const formCandidates = Object.fromEntries((forms || []).map((form) => {
    const official = pickBestImageUrl(imageUrls, (fileName) => scoreFormImage(fileName, seed, form, "official"));
    const shinyOfficial = pickBestImageUrl(
      shinyOfficialUrls,
      (fileName) => scoreFormImage(fileName, seed, form, "shinyOfficial")
    );
    return [form.id, { official, shinyOfficial }];
  }));

  return {
    official: pickBestImageUrl(imageUrls, (fileName) => scoreBasePokemonImage(fileName, seed, "official")),
    shinyOfficial: pickBestImageUrl(shinyOfficialUrls, (fileName) => scoreBasePokemonImage(fileName, seed, "shinyOfficial")),
    sprite: pickBestImageUrl(imageUrls, (fileName) => scoreBasePokemonImage(fileName, seed, "sprite")),
    shinySprite: pickBestImageUrl(shinyImageUrls, (fileName) => scoreBasePokemonImage(fileName, seed, "shinySprite")),
    forms: formCandidates
  };
}

function pickBestImageUrl(urls: string[], scorer: (fileName: string) => number) {
  const ranked = urls
    .map((url) => ({ url, fileName: extractFileNameFromUrl(url), score: scorer(extractFileNameFromUrl(url)) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.fileName.length - right.fileName.length);

  return ranked[0]?.url;
}

async function downloadAssetToCache(remoteUrl: string, cacheRelativePath: string) {
  const normalizedUrl = normalizeMediaUrl(remoteUrl);
  const guessedExtension = inferImageExtension(normalizedUrl);
  const normalizedRelativePath = cacheRelativePath.replace(/\.[^.]+$/, "");
  const guessedRelativePath = `${normalizedRelativePath}${guessedExtension}`;
  const guessedOutputPath = resolve(CACHE_DIR, guessedRelativePath);

  if (existsSync(guessedOutputPath)) {
    return {
      localUrl: cacheAssetUrl(guessedRelativePath),
      sourceUrl: normalizedUrl
    };
  }

  const response = await fetch(normalizedUrl, {
    headers: {
      "User-Agent": "pokemon-localdex-bot/0.2"
    }
  });

  if (!response.ok) {
    throw new Error(`Asset fetch failed: ${response.status} ${response.statusText}`);
  }

  const extension = inferImageExtension(normalizedUrl, response.headers.get("content-type"));
  const outputRelativePath = `${normalizedRelativePath}${extension}`;
  const outputPath = resolve(CACHE_DIR, outputRelativePath);

  if (!existsSync(outputPath)) {
    ensureDir(outputPath);
    const arrayBuffer = await response.arrayBuffer();
    writeFileSync(outputPath, Buffer.from(arrayBuffer));
  }

  return {
    localUrl: cacheAssetUrl(outputRelativePath),
    sourceUrl: normalizedUrl
  };
}

function generationToChinese(generation: number) {
  const map: Record<number, string> = {
    1: "一",
    2: "二",
    3: "三",
    4: "四",
    5: "五",
    6: "六",
    7: "七",
    8: "八",
    9: "九"
  };
  return map[generation];
}

function buildLearnsetPageUrl(nameZh: string, generation: number) {
  const generationText = generationToChinese(generation);
  if (!generationText) {
    return undefined;
  }
  return `https://wiki.52poke.com/wiki/${encodeURIComponent(nameZh)}/${encodeURIComponent(`第${generationText}世代招式表`)}`;
}

function collectGenerationsAround(index: number, text: string) {
  const window = text.slice(Math.max(0, index - 120), index + 120);
  const matched = [...window.matchAll(/第([一二三四五六七八九])世代/g)];
  const map = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  const generations = matched
    .map((item) => map[item[1] as keyof typeof map])
    .filter(Boolean);
  return generations.length > 0 ? [...new Set(generations)] : [];
}

function dedupe<T>(items: T[]) {
  return [...new Set(items)];
}

function extractStatBlocks(text: string) {
  const pattern =
    /ＨＰ[：:]\s*(\d+)[\s\S]{0,80}?攻击[：:]\s*(\d+)[\s\S]{0,80}?防御[：:]\s*(\d+)[\s\S]{0,80}?特攻[：:]\s*(\d+)[\s\S]{0,80}?特防[：:]\s*(\d+)[\s\S]{0,80}?速度[：:]\s*(\d+)/g;
  const blocks = [];

  for (const match of text.matchAll(pattern)) {
    blocks.push({
      hp: Number(match[1]),
      atk: Number(match[2]),
      def: Number(match[3]),
      spa: Number(match[4]),
      spd: Number(match[5]),
      spe: Number(match[6]),
      total:
        Number(match[1]) +
        Number(match[2]) +
        Number(match[3]) +
        Number(match[4]) +
        Number(match[5]) +
        Number(match[6])
    });
  }

  return blocks;
}

function chooseBaseStatBlock(blocks: ReturnType<typeof extractStatBlocks>) {
  if (blocks.length === 0) {
    return undefined;
  }

  blocks.sort((left, right) => left.total - right.total);
  return blocks[0];
}

function extractLineValue(text: string, label: string) {
  const pattern = new RegExp(`(?:^|\\n)${label}\\s+([^\\n]+)`);
  return text.match(pattern)?.[1]?.trim();
}

function splitTokens(value: string | undefined) {
  return value?.split(/\s+/).map((item) => item.trim()).filter(Boolean) ?? [];
}

function uniqueByJson<T>(items: T[]) {
  return dedupe(items.map((item) => JSON.stringify(item))).map((item) => JSON.parse(item));
}

function cleanLearnsetLine(line: string) {
  return line
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/（详）|【详】|详/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitLearnsetLines(html: string) {
  return normalizeText(html)
    .split("\n")
    .map((line) => cleanLearnsetLine(line))
    .filter(Boolean);
}

function isLearnsetSectionHeading(line: string) {
  return [
    "可学会的招式",
    "能使用的招式学习器",
    "能使用的秘传学习器",
    "能使用的招式记录",
    "教授招式",
    "能使用的招式教学",
    "遗传招式",
    "进化前招式",
    "其他世代："
  ].some((heading) => line.includes(heading));
}

function parseLearnsetTableCells(
  cells: string[],
  method: "level-up" | "tm" | "hm",
  generation: number,
  notes?: string
) {
  const headerStartCandidates =
    method === "level-up"
      ? ["等级"]
      : method === "hm"
        ? ["秘传学习器", "学习器"]
        : ["学习器", "招式记录", "招式記錄"];
  const headerStart = cells.findIndex((cell) => headerStartCandidates.includes(cell));
  if (headerStart < 0) {
    return { learnset: [], moves: [] };
  }

  const headerEnd = cells.findIndex((cell, index) => index >= headerStart && cell === "PP");
  if (headerEnd < 0) {
    return { learnset: [], moves: [] };
  }

  const header = cells.slice(headerStart, headerEnd + 1);
  const rowSize = header.length;
  const learnset = [];
  const moves: ScrapedMoveStub[] = [];

  for (let index = headerEnd + 1; index + rowSize - 1 < cells.length; index += rowSize) {
    const row = cells.slice(index, index + rowSize);
    if (row.length < rowSize || row.some((cell) => isLearnsetSectionHeading(cell))) {
      break;
    }

    const firstCell = row[0];
    const moveNameZh = row[1];
    if (!moveNameZh) {
      continue;
    }

    let learnMethod: "level-up" | "tm" | "hm" | "other" = method;
    let level: number | undefined;
    if (method === "level-up") {
      if (/^\d+$/.test(firstCell)) {
        level = Number(firstCell);
      } else if (firstCell === "—" || firstCell === "-") {
        learnMethod = "other";
      } else {
        continue;
      }
    }

    const hasCategory = header.includes("分类");
    const typeToken = row[2];
    const categoryToken = hasCategory ? row[3] : undefined;
    const powerToken = row[hasCategory ? 4 : 3];
    const accuracyToken = row[hasCategory ? 5 : 4];
    const ppToken = row[hasCategory ? 6 : 5];

    learnset.push({
      moveId: moveNameZh,
      moveNameZh,
      learnMethod,
      level,
      notes
    });
    moves.push({
      nameZh: moveNameZh,
      generation,
      type: typeToken,
      category: normalizeCategory(categoryToken),
      power: normalizePower(powerToken),
      accuracy: formatAccuracy(accuracyToken),
      pp: normalizePp(ppToken)
    });
  }

  return { learnset, moves };
}

export function parseLearnsetPage(page: RawPage, generation: number) {
  const lines = splitLearnsetLines(page.html);
  const learnset = [];
  const moves: ScrapedMoveStub[] = [];
  let currentGameLabel = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^《.+》$/.test(line) || /^第.+世代$/.test(line)) {
      currentGameLabel = line;
      continue;
    }

    const method = line.includes("可学会的招式")
      ? "level-up"
      : line.includes("能使用的招式学习器") || line.includes("能使用的招式记录")
        ? "tm"
        : line.includes("能使用的秘传学习器")
          ? "hm"
          : undefined;
    if (!method) {
      continue;
    }

    const sectionCells = [];
    for (let pointer = index + 1; pointer < lines.length; pointer += 1) {
      const cell = lines[pointer];
      if (isLearnsetSectionHeading(cell)) {
        break;
      }
      sectionCells.push(cell);
    }

    const parsed = parseLearnsetTableCells(sectionCells, method, generation, currentGameLabel || undefined);
    learnset.push(...parsed.learnset);
    moves.push(...parsed.moves.map((move) => ({
      ...move,
      source: {
        url: page.url,
        title: page.title,
        fetchedAt: page.fetchedAt
      }
    })));
  }

  return {
    learnset: uniqueByJson(learnset),
    moves: uniqueByJson(moves)
  };
}

function mergeMoveStubs(existingMoves: MoveEntry[], scrapedMoves: ScrapedMoveStub[]) {
  const byName = new Map<string, MoveEntry>();

  for (const move of existingMoves) {
    byName.set(move.nameZh, {
      ...move,
      generations: [...(move.generations || [])]
    });
  }

  for (const stub of scrapedMoves) {
    const existing = byName.get(stub.nameZh);
    const nextGenerationRecord = {
      generation: stub.generation,
      type: stub.type,
      category: stub.category,
      power: stub.power,
      accuracy: stub.accuracy,
      pp: stub.pp,
      effectSummary: "来自 52Poké 宝可梦学招式表的基础参数记录。"
    };

    if (!existing) {
      byName.set(stub.nameZh, {
        id: `move-${slugify(stub.nameZh)}`,
        slug: stub.nameZh,
        nameZh: stub.nameZh,
        type: stub.type,
        category: stub.category,
        power: stub.power,
        accuracy: stub.accuracy,
        pp: stub.pp,
        effectSummary: "来自 52Poké 宝可梦学招式表的基础参数记录。",
        generations: [nextGenerationRecord],
        source: stub.source
      });
      continue;
    }

    existing.type = existing.type ?? stub.type;
    existing.category = existing.category ?? stub.category;
    existing.power = existing.power ?? stub.power;
    existing.accuracy = existing.accuracy ?? stub.accuracy;
    existing.pp = existing.pp ?? stub.pp;
    existing.effectSummary = existing.effectSummary ?? "来自 52Poké 宝可梦学招式表的基础参数记录。";
    existing.source = existing.source ?? stub.source;

    if (!existing.generations.some((record) => record.generation === stub.generation)) {
      existing.generations.push(nextGenerationRecord);
    }
  }

  return [...byName.values()]
    .map((move) => ({
      ...move,
      generations: [...move.generations].sort((left, right) => left.generation - right.generation)
    }))
    .sort((left, right) => left.nameZh.localeCompare(right.nameZh, "zh-Hans-CN"));
}

function listCurrentMovesSafe() {
  try {
    return listMoves();
  } catch {
    return [];
  }
}

function listCurrentPokemonEntriesSafe() {
  try {
    return listPokemonEntries();
  } catch {
    return [];
  }
}

function listCurrentItemsSafe() {
  try {
    return listItems();
  } catch {
    return [];
  }
}

function listCurrentAbilitiesSafe() {
  try {
    return listAbilities();
  } catch {
    return [];
  }
}

function mergePokemonEntriesByDex(existingEntries: PokemonEntry[], updatedEntries: PokemonEntry[]) {
  const byDex = new Map<number, PokemonEntry>();
  for (const entry of existingEntries) {
    byDex.set(entry.dexNumber, entry);
  }
  for (const entry of updatedEntries) {
    byDex.set(entry.dexNumber, entry);
  }
  return [...byDex.values()].sort((left, right) => left.dexNumber - right.dexNumber);
}

function checkpointNormalizedData(input: {
  pokemonEntries: PokemonEntry[];
  items: ItemEntry[];
  moves: MoveEntry[];
  abilities: AbilityEntry[];
}) {
  replacePokemonEntries(input.pokemonEntries);
  replaceItems(input.items);
  replaceMoves(input.moves);
  replaceAbilities(input.abilities);
}

function extractBlock(text: string, startLabel: string, endLabelCandidates: string[]) {
  const startPattern = new RegExp(`(?:^|\\n)${startLabel}\\s*`);
  const startMatch = text.match(startPattern);
  if (!startMatch || startMatch.index === undefined) {
    return "";
  }

  const startIndex = startMatch.index + startMatch[0].length;
  const tail = text.slice(startIndex);
  let endIndex = tail.length;

  for (const label of endLabelCandidates) {
    const pattern = new RegExp(`\\n${label}\\s`);
    const match = tail.match(pattern);
    if (match && match.index !== undefined) {
      endIndex = Math.min(endIndex, match.index);
    }
  }

  return tail.slice(0, endIndex).trim();
}

function extractForms(text: string, baseNameZh: string): PokemonForm[] {
  const block = extractBlock(text, "形态", ["概述", "属性", "分类", "身高", "体重", "种族值", "取得基础点数"]);
  if (!block) {
    return [];
  }

  const candidates = block
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item !== "形态");

  const forms = candidates.map((nameZh) => ({
    id: `${slugify(baseNameZh)}-${slugify(nameZh)}`,
    nameZh
  }));

  return uniqueByJson(forms).filter((form) => form.nameZh !== baseNameZh);
}

function generationFromRegion(region: string) {
  const regionMap: Record<string, number> = {
    关都: 1,
    城都: 2,
    丰缘: 3,
    神奥: 4,
    合众: 5,
    卡洛斯: 6,
    阿罗拉: 7,
    伽勒尔: 8,
    洗翠: 8,
    帕底亚: 9,
    北上: 9,
    蓝莓: 9,
    密阿雷: 10
  };

  return regionMap[region];
}

function extractRegionalDexRecords(text: string): RegionalDexRecord[] {
  const block = extractBlock(text, "地区图鉴编号", ["地区浏览器编号", "身高", "体重", "叫声"]);
  if (!block) {
    return [];
  }

  const records: RegionalDexRecord[] = [];
  const pattern = /(关都|城都|丰缘|神奥|合众|卡洛斯|阿罗拉|伽勒尔|铠岛|王冠雪原|洗翠|帕底亚|北上|蓝莓|密阿雷)\s+#?([0-9A-Z\-]*)/g;

  for (const match of block.matchAll(pattern)) {
    records.push({
      region: match[1],
      dexNumber: match[2] || undefined
    });
  }

  return uniqueByJson(records);
}

function buildGenerationAvailability(seedGenerations: number[], regionalDexRecords: RegionalDexRecord[]) {
  const grouped = new Map<number, RegionalDexRecord[]>();

  for (const generation of seedGenerations) {
    grouped.set(generation, grouped.get(generation) ?? []);
  }

  for (const record of regionalDexRecords) {
    const generation = generationFromRegion(record.region);
    if (!generation) {
      continue;
    }

    grouped.set(generation, [...(grouped.get(generation) ?? []), record]);
  }

  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([generation, regions]) => ({
      generation,
      regions: regions.length > 0 ? uniqueByJson(regions) : undefined
    }));
}

async function cachePokemonImagesFromPage(page: RawPage, seed: PokemonSeed, forms?: PokemonForm[]) {
  const resolved = resolvePokemonImageCandidateUrls(page.html, seed, forms);
  const baseDir = `pokemon/${seed.dexNumber.toString().padStart(4, "0")}-${slugify(seed.nameZh)}`;

  const images = {};

  if (resolved.official) {
    const cached = await downloadAssetToCache(resolved.official, `${baseDir}/official`);
    images.official = {
      url: cached.localUrl,
      alt: `${seed.nameZh}官方图`,
      sourceUrl: cached.sourceUrl
    };
  }

  if (resolved.shinyOfficial) {
    const cached = await downloadAssetToCache(resolved.shinyOfficial, `${baseDir}/shiny-official`);
    images.shinyOfficial = {
      url: cached.localUrl,
      alt: `${seed.nameZh}闪光官方图`,
      sourceUrl: cached.sourceUrl
    };
  }

  if (resolved.sprite) {
    const cached = await downloadAssetToCache(resolved.sprite, `${baseDir}/sprite`);
    images.sprite = {
      url: cached.localUrl,
      alt: `${seed.nameZh}图像`,
      sourceUrl: cached.sourceUrl
    };
  }

  if (resolved.shinySprite) {
    const cached = await downloadAssetToCache(resolved.shinySprite, `${baseDir}/shiny-sprite`);
    images.shinySprite = {
      url: cached.localUrl,
      alt: `${seed.nameZh}闪光图像`,
      sourceUrl: cached.sourceUrl
    };
  }

  const nextForms = await Promise.all((forms || []).map(async (form) => {
    const candidates = resolved.forms?.[form.id] || {};
    if (!candidates.official && !candidates.shinyOfficial) {
      return form;
    }

    const nextImages = { ...(form.images || {}) };

    if (candidates.official) {
      const cached = await downloadAssetToCache(candidates.official, `${baseDir}/${slugify(form.nameZh)}-official`);
      nextImages.official = {
        url: cached.localUrl,
        alt: `${form.nameZh}官方图`,
        sourceUrl: cached.sourceUrl
      };
    }

    if (candidates.shinyOfficial) {
      const cached = await downloadAssetToCache(candidates.shinyOfficial, `${baseDir}/${slugify(form.nameZh)}-shiny-official`);
      nextImages.shinyOfficial = {
        url: cached.localUrl,
        alt: `${form.nameZh}闪光官方图`,
        sourceUrl: cached.sourceUrl
      };
    }

    return {
      ...form,
      images: nextImages
    };
  }));

  return {
    images: Object.keys(images).length > 0 ? images : undefined,
    forms: nextForms.length > 0 ? nextForms : forms
  };
}

async function cacheItemImageFromPage(page: RawPage, item: ItemSeed) {
  const imageUrls = extractImageCandidates(page.html);
  const bestUrl = pickBestImageUrl(imageUrls, (fileName) => scoreItemImage(fileName, item));
  if (!bestUrl) {
    return undefined;
  }

  const cached = await downloadAssetToCache(bestUrl, `items/${slugify(item.nameZh)}/official`);
  return {
    url: cached.localUrl,
    alt: `${item.nameZh}图片`,
    sourceUrl: cached.sourceUrl
  };
}

export async function fetchRawPage(url: string, slug: string, options?: FetchPageOptions): Promise<RawPage> {
  if (options?.preferCache && !options?.refresh) {
    const cached = readRawPageCache(slug);
    if (cached?.html) {
      return cached;
    }
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "pokemon-localdex-bot/0.2"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);

  const page: RawPage = {
    url,
    title: titleMatch?.[1]?.trim() ?? slug,
    fetchedAt: new Date().toISOString(),
    html
  };

  const output = resolve(RAW_DIR, `${slug}.json`);
  ensureDir(output);
  writeFileSync(output, JSON.stringify(page, null, 2));
  return page;
}

export function parsePokemonListPage(html: string): PokemonSeed[] {
  const text = normalizeText(html);
  const entries = [];
  const pattern =
    /#(\d{4})\s+([^\s#]+)\s+([^\s#]+)\s+([A-Za-z0-9.'♀♂\- :]+)/g;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const generations = collectGenerationsAround(index, text);
    const nameZh = match[2].trim();
    entries.push({
      dexNumber: Number(match[1]),
      nameZh,
      nameJa: match[3].trim(),
      nameEn: match[4].trim(),
      generations,
      detailUrl: `https://wiki.52poke.com/wiki/${encodeURIComponent(nameZh)}`
    });
  }

  return dedupe(entries.map((item) => JSON.stringify(item))).map((item) => JSON.parse(item));
}

export function parseItemListPage(html: string): ItemSeed[] {
  const text = normalizeText(html);
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const items: ItemSeed[] = [];
  let currentCategory = "";

  for (const line of lines) {
    if (line.startsWith("### ")) {
      currentCategory = line.replace(/^###\s*/, "");
      continue;
    }

    const match = line.match(/^([^\s]+)\s+([^\s]+)\s+([A-Za-z0-9.'\- ]+)\s+(.+)$/);
    if (!match) {
      continue;
    }

    const [_, nameZh, nameJa, nameEn, effectSummary] = match;
    if (["中文", "日文", "英文", "道具說明"].includes(nameZh)) {
      continue;
    }

    items.push({
      nameZh,
      nameJa,
      nameEn: nameEn.trim(),
      effectSummary: effectSummary.trim(),
      category: currentCategory || "未分类",
      detailUrl: `https://wiki.52poke.com/wiki/${encodeURIComponent(nameZh)}`
    });
  }

  return items;
}

export function normalizePokemonPage(page: RawPage, seed: PokemonSeed): PokemonEntry {
  const text = normalizeText(page.html);
  const typeLine = extractLineValue(text, "属性");
  const categoryLine = extractLineValue(text, "分类");
  const abilityLine = extractLineValue(text, "特性");
  const hiddenAbilityLine = extractLineValue(text, "隐藏特性") ?? extractLineValue(text, "隱藏特性");
  const heightLine = extractLineValue(text, "身高");
  const weightLine = extractLineValue(text, "体重");
  const colorLine = extractLineValue(text, "图鉴颜色");
  const catchRateLine = extractLineValue(text, "捕获率");
  const genderMatch = text.match(/雄性\s*([0-9.]+%)｜雌性\s*([0-9.]+%)/);
  const statBlock = chooseBaseStatBlock(extractStatBlocks(text));
  const typeTokens = splitTokens(typeLine);
  const abilityTokens = splitTokens(abilityLine);
  const forms = extractForms(text, seed.nameZh);
  const regionalDexRecords = extractRegionalDexRecords(text);
  const generationAvailability = buildGenerationAvailability(seed.generations, regionalDexRecords);

  return {
    id: `pokemon-${seed.dexNumber.toString().padStart(4, "0")}`,
    dexNumber: seed.dexNumber,
    slug: slugify(seed.nameZh),
    nameZh: seed.nameZh,
    nameJa: seed.nameJa,
    nameEn: seed.nameEn,
    generations: seed.generations.length > 0 ? seed.generations : [Math.ceil(seed.dexNumber / 151)],
    primaryType: typeTokens[0],
    secondaryType: typeTokens[1],
    category: categoryLine,
    abilities: abilityTokens,
    hiddenAbility: hiddenAbilityLine,
    heightM: readNumber(heightLine),
    weightKg: readNumber(weightLine),
    color: colorLine,
    catchRate: readNumber(catchRateLine),
    genderRatio: genderMatch
      ? {
          male: genderMatch[1],
          female: genderMatch[2]
        }
      : undefined,
    baseStats: statBlock
      ? {
          hp: statBlock.hp,
          atk: statBlock.atk,
          def: statBlock.def,
          spa: statBlock.spa,
          spd: statBlock.spd,
          spe: statBlock.spe
        }
      : undefined,
    forms: forms.length > 0 ? forms : undefined,
    generationAvailability: generationAvailability.length > 0 ? generationAvailability : undefined,
    source: {
      url: page.url,
      title: page.title,
      fetchedAt: page.fetchedAt
    }
  };
}

export async function importFromFixtures() {
  const pokemonListHtml = readFixture("pokemon-list-simple.html");
  const itemListHtml = readFixture("item-list.html");
  const pikachuHtml = readFixture("pokemon-detail-pikachu.html");
  const charizardHtml = readFixture("pokemon-detail-charizard.html");
  const now = new Date().toISOString();

  const parsedSeeds = parsePokemonListPage(pokemonListHtml);
  const pokemonSeeds = dedupe(
    [
      ...parsedSeeds.slice(0, 3),
      ...parsedSeeds.filter((item) => item.nameZh === "皮卡丘" || item.nameZh === "喷火龙")
    ].map((item) => JSON.stringify(item))
  ).map((item) => JSON.parse(item));
  const itemSeeds = parseItemListPage(itemListHtml).slice(0, 5);
  const pikachuSeed = pokemonSeeds.find((item) => item.nameZh === "皮卡丘");
  const charizardSeed = pokemonSeeds.find((item) => item.nameZh === "喷火龙");

  const pokemonEntries = pikachuSeed
    ? [
        ...pokemonSeeds
          .filter((item) => item.nameZh !== "皮卡丘" && item.nameZh !== "喷火龙")
          .map((item) => ({
            id: `pokemon-${item.dexNumber.toString().padStart(4, "0")}`,
            dexNumber: item.dexNumber,
            slug: slugify(item.nameZh),
            nameZh: item.nameZh,
            nameJa: item.nameJa,
            nameEn: item.nameEn,
            generations: item.generations,
            primaryType: undefined,
            secondaryType: undefined,
            source: {
              url: item.detailUrl,
              title: item.nameZh,
              fetchedAt: now
            }
          })),
        {
          ...normalizePokemonPage(
            {
              url: pikachuSeed.detailUrl,
              title: "皮卡丘 - 神奇宝贝百科，关于宝可梦的百科全书",
              fetchedAt: now,
              html: pikachuHtml
            },
            pikachuSeed
          ),
          abilityIds: ["ability-static", "ability-lightning-rod"],
          hiddenAbilityId: "ability-lightning-rod",
          moveIds: ["move-thunderbolt", "move-quick-attack"],
          images: {
            official: {
              url: assetUrl("pokemon/pikachu-official.svg"),
              alt: "皮卡丘官方绘图"
            },
            shinyOfficial: {
              url: assetUrl("pokemon/pikachu-shiny.svg"),
              alt: "皮卡丘闪光官方绘图"
            }
          },
          generationRecords: [
            {
              generation: 1,
              label: "红／绿／蓝",
              primaryType: "电",
              abilityIds: [],
              baseStats: { hp: 35, atk: 55, def: 30, spa: 50, spd: 40, spe: 90 },
              moveIds: ["move-thunderbolt", "move-quick-attack"],
              learnset: [
                {
                  moveId: "move-quick-attack",
                  moveNameZh: "电光一闪",
                  learnMethod: "level-up",
                  level: 11
                },
                {
                  moveId: "move-thunderbolt",
                  moveNameZh: "十万伏特",
                  learnMethod: "tm",
                  notes: "可通过招式机器习得。"
                }
              ],
              notes: "在第一世代中，特攻与特防尚未拆分。"
            },
            {
              generation: 3,
              label: "红宝石／蓝宝石",
              primaryType: "电",
              abilityIds: ["ability-static"],
              hiddenAbilityId: undefined,
              baseStats: { hp: 35, atk: 55, def: 30, spa: 50, spd: 40, spe: 90 },
              moveIds: ["move-thunderbolt", "move-quick-attack"],
              learnset: [
                {
                  moveId: "move-quick-attack",
                  moveNameZh: "电光一闪",
                  learnMethod: "level-up",
                  level: 11
                },
                {
                  moveId: "move-thunderbolt",
                  moveNameZh: "十万伏特",
                  learnMethod: "tm",
                  notes: "可通过招式机器24习得。"
                }
              ]
            },
            {
              generation: 5,
              label: "黑／白",
              primaryType: "电",
              abilityIds: ["ability-static"],
              hiddenAbilityId: "ability-lightning-rod",
              baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
              moveIds: ["move-thunderbolt", "move-quick-attack"],
              learnset: [
                {
                  moveId: "move-quick-attack",
                  moveNameZh: "电光一闪",
                  learnMethod: "level-up",
                  level: 13
                },
                {
                  moveId: "move-thunderbolt",
                  moveNameZh: "十万伏特",
                  learnMethod: "tm"
                }
              ]
            },
            {
              generation: 9,
              label: "朱／紫",
              primaryType: "电",
              abilityIds: ["ability-static"],
              hiddenAbilityId: "ability-lightning-rod",
              baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
              moveIds: ["move-thunderbolt", "move-quick-attack"],
              learnset: [
                {
                  moveId: "move-quick-attack",
                  moveNameZh: "电光一闪",
                  learnMethod: "level-up",
                  level: 10
                },
                {
                  moveId: "move-thunderbolt",
                  moveNameZh: "十万伏特",
                  learnMethod: "tm"
                }
              ]
            }
          ]
        },
        ...(charizardSeed
          ? [
              {
                ...normalizePokemonPage(
                  {
                    url: charizardSeed.detailUrl,
                    title: "喷火龙 - 神奇宝贝百科，关于宝可梦的百科全书",
                    fetchedAt: now,
                    html: charizardHtml
                  },
                  charizardSeed
                ),
                abilityIds: ["ability-blaze"],
                hiddenAbilityId: "ability-solar-power",
                moveIds: ["move-flamethrower", "move-air-slash"],
                images: {
                  official: {
                    url: assetUrl("pokemon/charizard-official.svg"),
                    alt: "喷火龙官方绘图"
                  },
                  shinyOfficial: {
                    url: assetUrl("pokemon/charizard-shiny.svg"),
                    alt: "喷火龙闪光官方绘图"
                  }
                },
                forms: [
                  ...(normalizePokemonPage(
                    {
                      url: charizardSeed.detailUrl,
                      title: "喷火龙 - 神奇宝贝百科，关于宝可梦的百科全书",
                      fetchedAt: now,
                      html: charizardHtml
                    },
                    charizardSeed
                  ).forms ?? []),
                  {
                    id: "charizard-mega-x",
                    nameZh: "超级喷火龙X",
                    primaryType: "火",
                    secondaryType: "龙",
                    abilityIds: ["ability-tough-claws"],
                    baseStats: { hp: 78, atk: 130, def: 111, spa: 130, spd: 85, spe: 100 },
                    introducedGeneration: 6,
                    isMega: true,
                    images: {
                      official: {
                        url: assetUrl("pokemon/charizard-mega-x.svg"),
                        alt: "超级喷火龙X官方绘图"
                      },
                      shinyOfficial: {
                        url: assetUrl("pokemon/charizard-mega-x-shiny.svg"),
                        alt: "超级喷火龙X闪光官方绘图"
                      }
                    }
                  },
                  {
                    id: "charizard-mega-y",
                    nameZh: "超级喷火龙Y",
                    primaryType: "火",
                    secondaryType: "飞行",
                    abilityIds: ["ability-drought"],
                    baseStats: { hp: 78, atk: 104, def: 78, spa: 159, spd: 115, spe: 100 },
                    introducedGeneration: 6,
                    isMega: true,
                    images: {
                      official: {
                        url: assetUrl("pokemon/charizard-mega-y.svg"),
                        alt: "超级喷火龙Y官方绘图"
                      }
                    }
                  }
                ],
                generationRecords: [
                  {
                    generation: 1,
                    label: "红／绿／蓝",
                    primaryType: "火",
                    secondaryType: "飞行",
                    abilityIds: [],
                    baseStats: { hp: 78, atk: 84, def: 78, spa: 85, spd: 85, spe: 100 },
                    moveIds: ["move-flamethrower"],
                    learnset: [
                      {
                        moveId: "move-flamethrower",
                        moveNameZh: "喷射火焰",
                        learnMethod: "level-up",
                        level: 46
                      }
                    ],
                    notes: "第一世代未引入特性与隐藏特性。"
                  },
                  {
                    generation: 3,
                    label: "红宝石／蓝宝石",
                    primaryType: "火",
                    secondaryType: "飞行",
                    abilityIds: ["ability-blaze"],
                    baseStats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
                    moveIds: ["move-flamethrower"],
                    learnset: [
                      {
                        moveId: "move-flamethrower",
                        moveNameZh: "喷射火焰",
                        learnMethod: "level-up",
                        level: 49
                      }
                    ]
                  },
                  {
                    generation: 6,
                    label: "X／Y",
                    primaryType: "火",
                    secondaryType: "飞行",
                    abilityIds: ["ability-blaze"],
                    hiddenAbilityId: "ability-solar-power",
                    baseStats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
                    moveIds: ["move-flamethrower", "move-air-slash"],
                    learnset: [
                      {
                        moveId: "move-flamethrower",
                        moveNameZh: "喷射火焰",
                        learnMethod: "level-up",
                        level: 47
                      },
                      {
                        moveId: "move-air-slash",
                        moveNameZh: "空气斩",
                        learnMethod: "level-up",
                        level: 1,
                        notes: "可通过回忆招式重新习得。"
                      }
                    ],
                    notes: "此世代引入超级喷火龙X与超级喷火龙Y。"
                  },
                  {
                    generation: 9,
                    label: "朱／紫",
                    primaryType: "火",
                    secondaryType: "飞行",
                    abilityIds: ["ability-blaze"],
                    hiddenAbilityId: "ability-solar-power",
                    baseStats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
                    moveIds: ["move-flamethrower", "move-air-slash"],
                    learnset: [
                      {
                        moveId: "move-flamethrower",
                        moveNameZh: "喷射火焰",
                        learnMethod: "level-up",
                        level: 48
                      },
                      {
                        moveId: "move-air-slash",
                        moveNameZh: "空气斩",
                        learnMethod: "level-up",
                        level: 1,
                        notes: "可通过回忆招式重新习得。"
                      }
                    ]
                  }
                ]
              }
            ]
          : [])
      ]
    : [];

  const items: ItemEntry[] = itemSeeds.map((item) => ({
    id: `item-${slugify(item.nameZh)}`,
    slug: slugify(item.nameZh),
    nameZh: item.nameZh,
    nameJa: item.nameJa,
    nameEn: item.nameEn,
    category: item.category,
    effectSummary: item.effectSummary,
    image: {
      url: assetUrl(`items/${slugify(item.nameZh)}.svg`),
      alt: `${item.nameZh}图片`
    },
    source: {
      url: item.detailUrl,
      title: item.nameZh,
      fetchedAt: now
    }
  }));

  const moves: MoveEntry[] = [
    {
      id: "move-thunderbolt",
      slug: "十万伏特",
      nameZh: "十万伏特",
      nameJa: "１０まんボルト",
      nameEn: "Thunderbolt",
      type: "电",
      category: "special",
      power: 90,
      accuracy: "100%",
      pp: 15,
      effectSummary: "攻击目标造成伤害。有10%的概率使目标陷入麻痹状态。",
      image: {
        url: assetUrl("moves/thunderbolt.svg"),
        alt: "十万伏特图标"
      },
      generations: [
        {
          generation: 1,
          type: "电",
          category: "special",
          power: 95,
          accuracy: "100%",
          pp: 15,
          effectSummary: "攻击目标造成伤害。有10%的概率使目标陷入麻痹状态。"
        },
        {
          generation: 6,
          type: "电",
          category: "special",
          power: 90,
          accuracy: "100%",
          pp: 15,
          effectSummary: "攻击目标造成伤害。有10%的概率使目标陷入麻痹状态。"
        }
      ],
      source: {
        url: "https://wiki.52poke.com/wiki/%E5%8D%81%E4%B8%87%E4%BC%8F%E7%89%B9",
        title: "十万伏特 - 神奇宝贝百科，关于宝可梦的百科全书",
        fetchedAt: now
      }
    },
    {
      id: "move-flamethrower",
      slug: "喷射火焰",
      nameZh: "喷射火焰",
      nameJa: "かえんほうしゃ",
      nameEn: "Flamethrower",
      type: "火",
      category: "special",
      power: 90,
      accuracy: "100%",
      pp: 15,
      effectSummary: "攻击目标造成伤害。有10%的概率使目标陷入灼伤状态。",
      image: {
        url: assetUrl("moves/flamethrower.svg"),
        alt: "喷射火焰图标"
      },
      generations: [
        {
          generation: 1,
          type: "火",
          category: "special",
          power: 95,
          accuracy: "100%",
          pp: 15,
          effectSummary: "攻击目标造成伤害。有10%的概率使目标陷入灼伤状态。"
        },
        {
          generation: 6,
          type: "火",
          category: "special",
          power: 90,
          accuracy: "100%",
          pp: 15,
          effectSummary: "攻击目标造成伤害。有10%的概率使目标陷入灼伤状态。"
        }
      ],
      source: {
        url: "https://wiki.52poke.com/wiki/%E5%96%B7%E5%B0%84%E7%81%AB%E7%84%B0",
        title: "喷射火焰 - 神奇宝贝百科，关于宝可梦的百科全书",
        fetchedAt: now
      }
    },
    {
      id: "move-quick-attack",
      slug: "电光一闪",
      nameZh: "电光一闪",
      nameJa: "でんこうせっか",
      nameEn: "Quick Attack",
      type: "一般",
      category: "physical",
      power: 40,
      accuracy: "100%",
      pp: 30,
      effectSummary: "必定先制攻击。",
      image: {
        url: assetUrl("moves/quick-attack.svg"),
        alt: "电光一闪图标"
      },
      generations: [
        {
          generation: 1,
          type: "一般",
          category: "physical",
          power: 40,
          accuracy: "100%",
          pp: 30,
          effectSummary: "必定先制攻击。"
        }
      ],
      source: {
        url: "https://wiki.52poke.com/wiki/%E7%94%B5%E5%85%89%E4%B8%80%E9%97%AA",
        title: "电光一闪 - 神奇宝贝百科，关于宝可梦的百科全书",
        fetchedAt: now
      }
    },
    {
      id: "move-air-slash",
      slug: "空气斩",
      nameZh: "空气斩",
      nameJa: "エアスラッシュ",
      nameEn: "Air Slash",
      type: "飞行",
      category: "special",
      power: 75,
      accuracy: "95%",
      pp: 15,
      effectSummary: "攻击目标造成伤害。有30%的概率使目标畏缩。",
      image: {
        url: assetUrl("moves/air-slash.svg"),
        alt: "空气斩图标"
      },
      generations: [
        {
          generation: 4,
          type: "飞行",
          category: "special",
          power: 75,
          accuracy: "95%",
          pp: 15,
          effectSummary: "攻击目标造成伤害。有30%的概率使目标畏缩。"
        }
      ],
      source: {
        url: "https://wiki.52poke.com/wiki/%E7%A9%BA%E6%B0%94%E6%96%A9",
        title: "空气斩 - 神奇宝贝百科，关于宝可梦的百科全书",
        fetchedAt: now
      }
    }
  ];

  const abilities: AbilityEntry[] = [
    {
      id: "ability-static",
      slug: "静电",
      nameZh: "静电",
      nameJa: "せいでんき",
      nameEn: "Static",
      effectSummary: "身上带有静电，有时会让接触到的对手麻痹。",
      image: {
        url: assetUrl("abilities/static.svg"),
        alt: "静电特性图标"
      },
      generations: [
        {
          generation: 3,
          effectSummary: "使用接触类招式攻击该特性的宝可梦时会有30%的机率麻痹。"
        },
        {
          generation: 9,
          effectSummary: "使用接触类招式攻击该特性的宝可梦时会有30%的机率麻痹。对战外还能提高遇见电属性宝可梦的概率。"
        }
      ],
      source: {
        url: "https://wiki.52poke.com/wiki/%E9%9D%99%E7%94%B5%EF%BC%88%E7%89%B9%E6%80%A7%EF%BC%89",
        title: "静电（特性） - 神奇宝贝百科，关于宝可梦的百科全书",
        fetchedAt: now
      }
    },
    {
      id: "ability-lightning-rod",
      slug: "避雷针",
      nameZh: "避雷针",
      nameJa: "ひらいしん",
      nameEn: "Lightning Rod",
      effectSummary: "将电属性的招式吸引到自己身上，不会受到伤害，还会提高特攻。",
      image: {
        url: assetUrl("abilities/lightning-rod.svg"),
        alt: "避雷针特性图标"
      },
      generations: [
        {
          generation: 3,
          effectSummary: "将单体电属性招式吸引到自己身上。"
        },
        {
          generation: 5,
          effectSummary: "将电属性招式吸引到自己身上并无效，还会提升一级特攻。"
        }
      ],
      source: {
        url: "https://wiki.52poke.com/wiki/%E9%81%BF%E9%9B%B7%E9%92%88%EF%BC%88%E7%89%B9%E6%80%A7%EF%BC%89",
        title: "避雷针（特性） - 神奇宝贝百科，关于宝可梦的百科全书",
        fetchedAt: now
      }
    },
    {
      id: "ability-blaze",
      slug: "猛火",
      nameZh: "猛火",
      nameJa: "もうか",
      nameEn: "Blaze",
      effectSummary: "ＨＰ减少时，火属性的招式威力会提高。",
      image: {
        url: assetUrl("abilities/blaze.svg"),
        alt: "猛火特性图标"
      },
      generations: [
        {
          generation: 3,
          effectSummary: "ＨＰ不大于最大值的1/3时，火属性招式威力提升为1.5倍。"
        }
      ],
      source: {
        url: "https://wiki.52poke.com/wiki/%E7%8C%9B%E7%81%AB%EF%BC%88%E7%89%B9%E6%80%A7%EF%BC%89",
        title: "猛火（特性） - 神奇宝贝百科，关于宝可梦的百科全书",
        fetchedAt: now
      }
    },
    {
      id: "ability-solar-power",
      slug: "太阳之力",
      nameZh: "太阳之力",
      nameJa: "サンパワー",
      nameEn: "Solar Power",
      effectSummary: "大晴天或大日照下特攻提高，但每回合会损失HP。",
      generations: [
        {
          generation: 4,
          effectSummary: "在晴天天气下特攻提高1.5倍，但每回合损失最大HP的1/8。"
        }
      ],
      source: {
        url: "https://wiki.52poke.com/wiki/%E5%A4%AA%E9%98%B3%E4%B9%8B%E5%8A%9B%EF%BC%88%E7%89%B9%E6%80%A7%EF%BC%89",
        title: "太阳之力（特性） - 神奇宝贝百科，关于宝可梦的百科全书",
        fetchedAt: now
      }
    },
    {
      id: "ability-tough-claws",
      slug: "硬爪",
      nameZh: "硬爪",
      nameJa: "かたいツメ",
      nameEn: "Tough Claws",
      effectSummary: "接触类招式威力会提高。",
      generations: [
        {
          generation: 6,
          effectSummary: "接触类招式的威力提高约1.3倍。"
        }
      ],
      source: {
        url: "https://wiki.52poke.com/wiki/%E7%A1%AC%E7%88%AA%EF%BC%88%E7%89%B9%E6%80%A7%EF%BC%89",
        title: "硬爪（特性） - 神奇宝贝百科，关于宝可梦的百科全书",
        fetchedAt: now
      }
    },
    {
      id: "ability-drought",
      slug: "日照",
      nameZh: "日照",
      nameJa: "ひでり",
      nameEn: "Drought",
      effectSummary: "出场时，会将天气变为大晴天。",
      generations: [
        {
          generation: 3,
          effectSummary: "出场时，将天气变为大晴天。"
        }
      ],
      source: {
        url: "https://wiki.52poke.com/wiki/%E6%97%A5%E7%85%A7%EF%BC%88%E7%89%B9%E6%80%A7%EF%BC%89",
        title: "日照（特性） - 神奇宝贝百科，关于宝可梦的百科全书",
        fetchedAt: now
      }
    }
  ];

  replacePokemonEntries(pokemonEntries);
  replaceItems(items);
  replaceMoves(moves);
  replaceAbilities(abilities);

  return {
    pokemonCount: pokemonEntries.length,
    itemCount: items.length,
    moveCount: moves.length,
    abilityCount: abilities.length
  };
}

export async function importFrom52poke(options?: Import52pokeOptions) {
  const preferCache = options?.preferCache ?? true;
  const refreshRaw = options?.refreshRaw ?? false;
  const checkpointEvery = Math.max(1, Number(options?.checkpointEvery ?? 20));

  const pokemonListPage = await fetchRawPage(POKEMON_LIST_URL, "pokemon-list-simple", {
    preferCache,
    refresh: refreshRaw
  });
  const itemListPage = await fetchRawPage(ITEM_LIST_URL, "item-list", {
    preferCache,
    refresh: refreshRaw
  });

  const pokemonSeeds = parsePokemonListPage(pokemonListPage.html);
  const itemSeeds = parseItemListPage(itemListPage.html);
  const startDex = options?.startDex ?? 1;
  const endDex = options?.endDex ?? Number.MAX_SAFE_INTEGER;
  const dexFilteredSeeds = pokemonSeeds.filter((seed) => seed.dexNumber >= startDex && seed.dexNumber <= endDex);
  const pokemonLimit = options?.pokemonLimit ?? dexFilteredSeeds.length;
  const limitedSeeds = dexFilteredSeeds.slice(0, pokemonLimit);
  const existingPokemonEntries = listCurrentPokemonEntriesSafe();
  const existingItems = listCurrentItemsSafe();
  const existingMoves = listCurrentMovesSafe();
  const existingAbilities = listCurrentAbilitiesSafe();
  const existingPokemonDexSet = new Set(existingPokemonEntries.map((entry) => entry.dexNumber));
  const selectedSeeds = options?.onlyMissing
    ? limitedSeeds.filter((seed) => !existingPokemonDexSet.has(seed.dexNumber))
    : limitedSeeds;
  const fetchedAt = new Date().toISOString();

  const importedPokemonEntries: PokemonEntry[] = [];
  const importedItems: ItemEntry[] = [];
  const scrapedMoves: ScrapedMoveStub[] = [];
  const progress: Import52pokeProgress = {
    startedAt: fetchedAt,
    updatedAt: fetchedAt,
    totalSeeds: selectedSeeds.length,
    processedCount: 0,
    successCount: 0,
    failureCount: 0,
    skippedCount: limitedSeeds.length - selectedSeeds.length,
    processedDexNumbers: [],
    failed: []
  };
  writeImportProgress(progress);

  for (const [index, seed] of selectedSeeds.entries()) {
    try {
      const detailPage = await fetchRawPage(seed.detailUrl, `pokemon-${seed.dexNumber.toString().padStart(4, "0")}`, {
        preferCache,
        refresh: refreshRaw
      });
      const normalized = normalizePokemonPage(detailPage, seed);
      const cachedImages = await cachePokemonImagesFromPage(detailPage, seed, normalized.forms);
      const generationsToFetch = uniqueByJson(
        [
          ...(normalized.generationAvailability?.map((item) => item.generation) ?? []),
          ...(seed.generations ?? [])
        ].filter(Boolean)
      ).sort((left, right) => left - right);

      const generationRecords = [];

      for (const generation of generationsToFetch) {
        const learnsetUrl = buildLearnsetPageUrl(seed.nameZh, generation);
        if (!learnsetUrl) {
          continue;
        }

        try {
          const learnsetPage = await fetchRawPage(
            learnsetUrl,
            `pokemon-${seed.dexNumber.toString().padStart(4, "0")}-gen-${generation}-moves`,
            {
              preferCache,
              refresh: refreshRaw
            }
          );
          const parsedLearnset = parseLearnsetPage(learnsetPage, generation);
          if (parsedLearnset.learnset.length === 0) {
            continue;
          }

          generationRecords.push({
            generation,
            moveIds: parsedLearnset.learnset.map((entry) => entry.moveId),
            learnset: parsedLearnset.learnset
          });
          scrapedMoves.push(...parsedLearnset.moves);
        } catch (error) {
          generationRecords.push({
            generation,
            notes: `learnset fetch failed: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      }

      importedPokemonEntries.push({
        ...normalized,
        images: cachedImages.images ?? normalized.images,
        forms: cachedImages.forms ?? normalized.forms,
        moveIds: uniqueByJson(
          generationRecords.flatMap((record) => record.learnset?.map((item) => item.moveId) ?? [])
        ),
        generationRecords: generationRecords.length > 0 ? generationRecords : undefined
      });
      progress.successCount += 1;
    } catch (error) {
      importedPokemonEntries.push({
        id: `pokemon-${seed.dexNumber.toString().padStart(4, "0")}`,
        dexNumber: seed.dexNumber,
        slug: slugify(seed.nameZh),
        nameZh: seed.nameZh,
        nameJa: seed.nameJa,
        nameEn: seed.nameEn,
        generations: seed.generations,
        primaryType: undefined,
        secondaryType: undefined,
        source: {
          url: seed.detailUrl,
          title: seed.nameZh,
          fetchedAt
        },
        parseNote: `detail fetch failed: ${error instanceof Error ? error.message : String(error)}`
      });
      progress.failureCount += 1;
      progress.failed.push({
        dexNumber: seed.dexNumber,
        nameZh: seed.nameZh,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    progress.processedCount += 1;
    progress.lastDexNumber = seed.dexNumber;
    progress.updatedAt = new Date().toISOString();
    progress.processedDexNumbers.push(seed.dexNumber);

    if ((index + 1) % checkpointEvery === 0) {
      const checkpointMoves = mergeMoveStubs(existingMoves, scrapedMoves);
      checkpointNormalizedData({
        pokemonEntries: mergePokemonEntriesByDex(existingPokemonEntries, importedPokemonEntries),
        items: existingItems,
        moves: checkpointMoves,
        abilities: existingAbilities
      });
      writeImportProgress(progress);
    }
  }

  for (const item of itemSeeds) {
    let image;
    try {
      const detailPage = await fetchRawPage(item.detailUrl, `item-${slugify(item.nameZh)}`, {
        preferCache,
        refresh: refreshRaw
      });
      image = await cacheItemImageFromPage(detailPage, item);
    } catch {
      image = undefined;
    }

    importedItems.push({
      id: `item-${slugify(item.nameZh)}`,
      slug: slugify(item.nameZh),
      nameZh: item.nameZh,
      nameJa: item.nameJa,
      nameEn: item.nameEn,
      category: item.category,
      effectSummary: item.effectSummary,
      image,
      source: {
        url: item.detailUrl,
        title: item.nameZh,
        fetchedAt
      }
    });
  }

  const moves = mergeMoveStubs(existingMoves, scrapedMoves);
  const mergedPokemonEntries = mergePokemonEntriesByDex(existingPokemonEntries, importedPokemonEntries);
  const mergedItems = mergeItems(existingItems, importedItems);

  checkpointNormalizedData({
    pokemonEntries: mergedPokemonEntries,
    items: mergedItems,
    moves,
    abilities: existingAbilities
  });
  writeImportProgress({
    ...progress,
    updatedAt: new Date().toISOString()
  });

  return {
    requestedPokemonCount: limitedSeeds.length,
    processedPokemonCount: selectedSeeds.length,
    pokemonCount: mergedPokemonEntries.length,
    itemCount: mergedItems.length,
    moveCount: moves.length,
    skippedPokemonCount: progress.skippedCount,
    failedPokemonCount: progress.failureCount,
    progressFile: IMPORT_PROGRESS_FILE
  };
}
