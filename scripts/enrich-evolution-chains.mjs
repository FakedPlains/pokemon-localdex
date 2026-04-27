import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizePokemonPage,
  resolvePokemonImageCandidateUrls
} from "../packages/scraper/src/index.ts";

const ROOT = resolve(import.meta.dirname, "..");
const POKEMON_FILE = resolve(ROOT, "data/normalized/pokemon.json");
const RAW_DIR = resolve(ROOT, "data/raw");
const WEB_PUBLIC_DIR = resolve(ROOT, "apps/web/public");

let pokemon = JSON.parse(readFileSync(POKEMON_FILE, "utf8"));

function slugify(input) {
  return String(input)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function decodeHtml(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeText(html) {
  return decodeHtml(String(html || ""))
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]*>/g, "\n")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function extractEvolutionSection(html) {
  const heading = html.match(/<h[23][^>]*>\s*<span[^>]*><\/span>\s*<span[^>]*class="mw-headline"[^>]*id="[进進]化"[^>]*>[进進]化<\/span>\s*<\/h[23]>/);
  if (heading?.index == null) {
    return "";
  }

  const start = heading.index + heading[0].length;
  const rest = html.slice(start);
  const nextHeading = rest.search(/<h[23][^>]*>/);
  return nextHeading >= 0 ? rest.slice(0, nextHeading) : rest;
}

function stageRank(label, originalIndex) {
  if (label.includes("幼年")) return -1;
  if (label.includes("未进化")) return 0;
  const rank = label.match(/(\d+)阶进化/);
  if (rank) return Number(rank[1]);
  return 1000 + originalIndex;
}

function pickImage(entry) {
  return entry.images?.official || entry.images?.sprite || entry.images?.shinyOfficial || entry.images?.shinySprite;
}

function toMember(entry, stageLabel) {
  return {
    id: entry.id,
    dexNumber: entry.dexNumber,
    slug: entry.slug,
    nameZh: entry.nameZh,
    nameEn: entry.nameEn,
    primaryType: entry.primaryType,
    secondaryType: entry.secondaryType,
    stageLabel,
    image: pickImage(entry)
  };
}

function extractChainFromHtml(html) {
  const section = extractEvolutionSection(html);
  if (!section) {
    return [];
  }

  const entries = [];
  const cardPattern = /<table class="bg-[^"]* roundy at-c a-c">([\s\S]*?)<\/table>/g;
  let match;
  while ((match = cardPattern.exec(section))) {
    const block = match[1];
    const link = block.match(/<a(?:\s+class="mw-selflink selflink")?(?:\s+href="[^"]*")?(?:\s+title="([^"]+)")?[^>]*>([^<]+)<\/a><br\s*\/?>/);
    if (!link) {
      continue;
    }

    const name = decodeHtml(link[1] || link[2]).trim();
    const entry = byName.get(name);
    if (!entry) {
      continue;
    }

    const labels = [...block.matchAll(/<small>([\s\S]*?)<\/small>/g)]
      .map((item) => stripTags(item[1]))
      .filter((item) => item && !item.includes("{{{"));
    entries.push({
      entry,
      stageLabel: labels[0] || "",
      originalIndex: entries.length
    });
  }

  const unique = new Map();
  for (const item of entries) {
    if (!unique.has(item.entry.id)) {
      unique.set(item.entry.id, item);
    }
  }

  return [...unique.values()]
    .sort((left, right) => {
      const rankDelta = stageRank(left.stageLabel, left.originalIndex) - stageRank(right.stageLabel, right.originalIndex);
      return rankDelta || left.entry.dexNumber - right.entry.dexNumber || left.originalIndex - right.originalIndex;
    })
    .map((item) => toMember(item.entry, item.stageLabel));
}

function localImageAsset(entry, kind, sourceUrl) {
  if (!sourceUrl) {
    return undefined;
  }

  const baseDir = `assets/cache/pokemon/${String(entry.dexNumber).padStart(4, "0")}-${slugify(entry.nameZh)}`;
  const fileNameByKind = {
    official: "official.webp",
    shinyOfficial: "shiny-official.webp",
    sprite: "sprite.webp",
    shinySprite: "shiny-sprite.webp"
  };
  const localPath = `/${baseDir}/${fileNameByKind[kind]}`;
  const absoluteLocalPath = resolve(WEB_PUBLIC_DIR, `.${localPath}`);

  return {
    url: existsSync(absoluteLocalPath) ? localPath : sourceUrl,
    alt: `${entry.nameZh}${kind === "shinyOfficial" || kind === "shinySprite" ? "闪光" : ""}${kind === "official" || kind === "shinyOfficial" ? "官方图" : "图像"}`,
    sourceUrl
  };
}

function localFormImageAsset(entry, form, kind, sourceUrl) {
  if (!sourceUrl) {
    return undefined;
  }

  const baseDir = `assets/cache/pokemon/${String(entry.dexNumber).padStart(4, "0")}-${slugify(entry.nameZh)}`;
  const suffix = kind === "shinyOfficial" ? "shiny-official" : "official";
  const localPath = `/${baseDir}/${slugify(form.nameZh)}-${suffix}.webp`;
  const absoluteLocalPath = resolve(WEB_PUBLIC_DIR, `.${localPath}`);

  return {
    url: existsSync(absoluteLocalPath) ? localPath : sourceUrl,
    alt: `${form.nameZh}${kind === "shinyOfficial" ? "闪光" : ""}官方图`,
    sourceUrl
  };
}

function resolveSeed(entry, raw) {
  return {
    dexNumber: entry.dexNumber,
    nameZh: entry.nameZh,
    nameJa: entry.nameJa,
    nameEn: entry.nameEn,
    generations: entry.generations || [],
    detailUrl: entry.source?.url || raw.url
  };
}

function statBlockFromValues(values) {
  const [hp, atk, def, spa, spd, spe] = values.map(Number);
  return { hp, atk, def, spa, spd, spe };
}

function extractStatBlocksFromText(text) {
  const pattern =
    /ＨＰ\s*[：:]?\s*(\d+)[\s\S]{0,360}?攻击\s*[：:]?\s*(\d+)[\s\S]{0,360}?防御\s*[：:]?\s*(\d+)[\s\S]{0,360}?特攻\s*[：:]?\s*(\d+)[\s\S]{0,360}?特防\s*[：:]?\s*(\d+)[\s\S]{0,360}?速度\s*[：:]?\s*(\d+)/g;
  return [...text.matchAll(pattern)]
    .map((match) => statBlockFromValues(match.slice(1, 7)))
    .filter((block) => block.hp + block.atk + block.def + block.spa + block.spd + block.spe >= 175);
}

function extractTrueFormNames(text, baseNameZh) {
  const marker = "\n形态\n";
  const start = text.indexOf(marker);
  if (start < 0) {
    return [];
  }

  const tokens = text
    .slice(start + marker.length)
    .split("\n")
    .map((item) => item.normalize("NFKC").trim())
    .filter(Boolean);
  const names = [];

  for (const token of tokens) {
    if (names.length > 0 && token === names[0]) {
      break;
    }
    if (/^#?\d+$/.test(token) || ["官方绘图", "属性", "分类", "特性"].includes(token)) {
      break;
    }
    if (token.includes("日文") || token.includes("英文")) {
      break;
    }
    names.push(token);
  }

  return [...new Set(names)].filter((name) => name && name !== baseNameZh);
}

function isPlausibleFormName(nameZh) {
  return nameZh.length <= 24 && !/[，。；：、,.!?]/.test(nameZh);
}

function buildTrueForms(entry, raw, seed) {
  const text = normalizeText(raw.html || "");
  const extractedFormNames = extractTrueFormNames(text, entry.nameZh);
  const formNames = extractedFormNames.filter(isPlausibleFormName);
  if (formNames.length === 0) {
    return extractedFormNames.length > 0
      ? []
      : (entry.forms || []).filter((form) => isPlausibleFormName(form.nameZh || ""));
  }

  const statBlocks = extractStatBlocksFromText(text);
  const baseStats = statBlocks[0] || entry.baseStats;
  const forms = formNames.map((name, index) => ({
    id: `${slugify(entry.nameZh)}-${slugify(name)}`,
    nameZh: name,
    isMega: name.includes("超级"),
    baseStats: statBlocks[index + 1] || (name.includes("超极巨") ? baseStats : undefined)
  }));
  const imageCandidates = resolvePokemonImageCandidateUrls(raw.html || "", seed, forms);

  return forms.map((form) => {
    const candidate = imageCandidates.forms?.[form.id] || {};
    const images = {};

    if (candidate.official) {
      images.official = localFormImageAsset(entry, form, "official", candidate.official);
    }
    if (candidate.shinyOfficial) {
      images.shinyOfficial = localFormImageAsset(entry, form, "shinyOfficial", candidate.shinyOfficial);
    }

    return {
      ...form,
      images: Object.keys(images).length > 0 ? images : undefined
    };
  });
}

function enrichCoreDataFromRaw(entry, raw) {
  const seed = resolveSeed(entry, raw);
  const normalized = normalizePokemonPage(raw, seed);
  const imageCandidates = resolvePokemonImageCandidateUrls(raw.html || "", seed, entry.forms || normalized.forms);
  const nextImages = {
    ...(entry.images || {})
  };

  for (const kind of ["official", "shinyOfficial", "sprite", "shinySprite"]) {
    const sourceUrl = imageCandidates[kind];
    if (!sourceUrl) {
      continue;
    }

    const current = nextImages[kind];
    if (!current?.sourceUrl || current.url?.includes("/assets/demo/") || current.sourceUrl !== sourceUrl) {
      nextImages[kind] = localImageAsset(entry, kind, sourceUrl);
    }
  }

  return {
    ...entry,
    baseStats: entry.baseStats || normalized.baseStats,
    images: Object.keys(nextImages).length > 0 ? nextImages : entry.images,
    forms: buildTrueForms({ ...entry, baseStats: entry.baseStats || normalized.baseStats }, raw, seed)
  };
}

let statsEnrichedCount = 0;
let imagesEnrichedCount = 0;
pokemon = pokemon.map((entry) => {
  const rawPath = resolve(RAW_DIR, `${entry.id}.json`);
  if (!existsSync(rawPath)) {
    return entry;
  }

  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  const nextEntry = enrichCoreDataFromRaw(entry, raw);
  if (!entry.baseStats && nextEntry.baseStats) {
    statsEnrichedCount += 1;
  }
  if (JSON.stringify(entry.images) !== JSON.stringify(nextEntry.images)) {
    imagesEnrichedCount += 1;
  }
  return nextEntry;
});

const byName = new Map(pokemon.map((entry) => [entry.nameZh, entry]));
const byId = new Map(pokemon.map((entry) => [entry.id, entry]));
const chainsByPokemonId = new Map();

for (const entry of pokemon) {
  const rawPath = resolve(RAW_DIR, `${entry.id}.json`);
  if (!existsSync(rawPath)) {
    continue;
  }

  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  const chain = extractChainFromHtml(raw.html || "");
  if (chain.length === 0) {
    continue;
  }

  for (const member of chain) {
    if (byId.has(member.id)) {
      const previous = chainsByPokemonId.get(member.id);
      if (!previous || chain.length > previous.length) {
        chainsByPokemonId.set(member.id, chain);
      }
    }
  }
}

let enrichedCount = 0;
const enrichedPokemon = pokemon.map((entry) => {
  const chain = chainsByPokemonId.get(entry.id);
  if (!chain) {
    return entry;
  }
  enrichedCount += 1;
  return {
    ...entry,
    evolutionChain: chain
  };
});

writeFileSync(POKEMON_FILE, `${JSON.stringify(enrichedPokemon, null, 2)}\n`);

console.log(`evolution chains enriched: ${enrichedCount}/${pokemon.length}`);
console.log(`base stats enriched: ${statsEnrichedCount}/${pokemon.length}`);
console.log(`images enriched: ${imagesEnrichedCount}/${pokemon.length}`);
