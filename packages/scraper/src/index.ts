import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  type ItemEntry,
  type PokemonEntry,
  replaceItems,
  replacePokemonEntries
} from "../../data-model/src/index.ts";

const ROOT = resolve(import.meta.dirname, "../../../");
const RAW_DIR = resolve(ROOT, "data/raw");
const FIXTURE_DIR = resolve(import.meta.dirname, "../fixtures");

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

function readNumber(input: string | undefined) {
  if (!input) {
    return undefined;
  }

  const matched = input.match(/(\d+(?:\.\d+)?)/);
  return matched ? Number(matched[1]) : undefined;
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

export async function fetchRawPage(url: string, slug: string): Promise<RawPage> {
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
  const typeTokens = typeLine?.split(/\s+/).filter(Boolean) ?? [];
  const abilityTokens = abilityLine?.split(/\s+/).filter(Boolean) ?? [];

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

  const parsedSeeds = parsePokemonListPage(pokemonListHtml);
  const pokemonSeeds = dedupe(
    [
      ...parsedSeeds.slice(0, 3),
      ...parsedSeeds.filter((item) => item.nameZh === "皮卡丘")
    ].map((item) => JSON.stringify(item))
  ).map((item) => JSON.parse(item));
  const itemSeeds = parseItemListPage(itemListHtml).slice(0, 5);
  const pikachuSeed = pokemonSeeds.find((item) => item.nameZh === "皮卡丘");

  const pokemonEntries = pikachuSeed
    ? [
        ...pokemonSeeds
          .filter((item) => item.nameZh !== "皮卡丘")
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
              fetchedAt: new Date().toISOString()
            }
          })),
        normalizePokemonPage(
          {
            url: pikachuSeed.detailUrl,
            title: "皮卡丘 - 神奇宝贝百科，关于宝可梦的百科全书",
            fetchedAt: new Date().toISOString(),
            html: pikachuHtml
          },
          pikachuSeed
        )
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
    source: {
      url: item.detailUrl,
      title: item.nameZh,
      fetchedAt: new Date().toISOString()
    }
  }));

  replacePokemonEntries(pokemonEntries);
  replaceItems(items);

  return {
    pokemonCount: pokemonEntries.length,
    itemCount: items.length
  };
}

export async function importFrom52poke(options?: { pokemonLimit?: number }) {
  const pokemonListPage = await fetchRawPage(POKEMON_LIST_URL, "pokemon-list-simple");
  const itemListPage = await fetchRawPage(ITEM_LIST_URL, "item-list");

  const pokemonSeeds = parsePokemonListPage(pokemonListPage.html);
  const itemSeeds = parseItemListPage(itemListPage.html);
  const pokemonLimit = options?.pokemonLimit ?? pokemonSeeds.length;
  const selectedSeeds = pokemonSeeds.slice(0, pokemonLimit);
  const fetchedAt = new Date().toISOString();

  const pokemonEntries: PokemonEntry[] = [];

  for (const seed of selectedSeeds) {
    try {
      const detailPage = await fetchRawPage(seed.detailUrl, `pokemon-${seed.dexNumber.toString().padStart(4, "0")}`);
      pokemonEntries.push(normalizePokemonPage(detailPage, seed));
    } catch (error) {
      pokemonEntries.push({
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
    }
  }

  const items: ItemEntry[] = itemSeeds.map((item) => ({
    id: `item-${slugify(item.nameZh)}`,
    slug: slugify(item.nameZh),
    nameZh: item.nameZh,
    nameJa: item.nameJa,
    nameEn: item.nameEn,
    category: item.category,
    effectSummary: item.effectSummary,
    source: {
      url: item.detailUrl,
      title: item.nameZh,
      fetchedAt
    }
  }));

  replacePokemonEntries(pokemonEntries);
  replaceItems(items);

  return {
    pokemonCount: pokemonEntries.length,
    itemCount: items.length
  };
}
