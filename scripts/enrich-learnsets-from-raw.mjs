import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const RAW_DIR = resolve(ROOT, "data/raw");
const POKEMON_FILE = resolve(ROOT, "data/normalized/pokemon.json");

const SECTION_DEFINITIONS = [
  { id: "可学会的招式", method: "level-up" },
  { id: "能使用的招式学习器", method: "tm" },
  { id: "能使用的招式记录", method: "tm" },
  { id: "能使用的秘传学习器", method: "hm" },
  { id: "蛋招式", method: "egg" },
  { id: "教授招式", method: "tutor" },
  { id: "活动赠送招式", method: "event" }
];

function slugify(input) {
  return String(input || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function decodeHtmlEntities(input) {
  return String(input || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function cleanText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<sup\b[\s\S]*?<\/sup>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMoveName(cellHtml) {
  const titleMatch = String(cellHtml || "").match(/title="([^"]+?)（招式）"/);
  if (titleMatch) {
    return decodeHtmlEntities(titleMatch[1]).trim();
  }
  return cleanText(cellHtml).replace(/（招式）$/u, "").trim();
}

function extractSection(html, headingId) {
  const escapedId = headingId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const marker = new RegExp(`id="${escapedId}"`, "u");
  const match = marker.exec(html);
  if (!match) {
    return "";
  }

  const start = match.index;
  const rest = html.slice(start + match[0].length);
  const nextHeading = rest.search(/<h[3-5]\b/iu);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

function extractRows(sectionHtml) {
  return [...String(sectionHtml || "").matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)]
    .map((match) => match[0]);
}

function extractCells(rowHtml) {
  return [...String(rowHtml || "").matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => match[2]);
}

function parseLevel(rawLevel) {
  const text = String(rawLevel || "").normalize("NFKC").trim();
  const numeric = Number(text.match(/\d+/)?.[0]);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function pickMoveCell(cells, method) {
  if (method === "level-up") {
    return { index: 2, notes: cleanText(cells[0]) };
  }
  if (method === "tm" || method === "hm") {
    return { index: 2, notes: cleanText(cells[1]) || cleanText(cells[0]) };
  }

  const index = cells.findIndex((cell) => /（招式）"/.test(cell) || /title="[^"]+?（招式）"/.test(cell));
  return { index, notes: "" };
}

function parseSection(sectionHtml, method, generation) {
  const learnset = [];
  for (const row of extractRows(sectionHtml)) {
    const cells = extractCells(row);
    if (cells.length < 4) {
      continue;
    }

    const { index: moveIndex, notes } = pickMoveCell(cells, method);
    if (moveIndex < 0 || moveIndex >= cells.length) {
      continue;
    }

    const moveNameZh = extractMoveName(cells[moveIndex]);
    if (!moveNameZh || moveNameZh === "招式" || moveNameZh.includes("其他世代")) {
      continue;
    }

    const entry = {
      generation,
      moveId: `move-${slugify(moveNameZh)}`,
      moveNameZh,
      learnMethod: method
    };

    if (method === "level-up") {
      const level = parseLevel(cells[0]);
      if (level !== undefined) {
        entry.level = level;
      } else if (notes && notes !== "—" && notes !== "-") {
        entry.notes = notes;
      }
    } else if (notes) {
      entry.notes = notes;
    }

    learnset.push(entry);
  }

  return uniqueLearnset(learnset);
}

function uniqueLearnset(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = [entry.moveId, entry.learnMethod, entry.level ?? "", entry.notes ?? ""].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function parseLearnsetPage(page, generation) {
  const learnset = [];
  for (const section of SECTION_DEFINITIONS) {
    const sectionHtml = extractSection(page.html, section.id);
    if (!sectionHtml) {
      continue;
    }
    learnset.push(...parseSection(sectionHtml, section.method, generation));
  }
  return uniqueLearnset(learnset);
}

function mergeRecord(existing, generation, learnset) {
  const next = { ...(existing || {}), generation };
  next.learnset = learnset;
  next.moveIds = [...new Set(learnset.map((entry) => entry.moveId))];
  if (typeof next.notes === "string" && next.notes.startsWith("learnset fetch failed:")) {
    delete next.notes;
  }
  return next;
}

const pokemon = JSON.parse(readFileSync(POKEMON_FILE, "utf8"));
const byDex = new Map(pokemon.map((entry) => [String(entry.dexNumber).padStart(4, "0"), entry]));
const files = readdirSync(RAW_DIR)
  .filter((file) => /^pokemon-\d{4}-gen-\d+-moves\.json$/.test(file))
  .sort();

let parsedFiles = 0;
let mergedRecords = 0;
let mergedEntries = 0;

for (const file of files) {
  const [, dexNumber, generationText] = file.match(/^pokemon-(\d{4})-gen-(\d+)-moves\.json$/) || [];
  const entry = byDex.get(dexNumber);
  if (!entry) {
    continue;
  }

  const page = JSON.parse(readFileSync(resolve(RAW_DIR, file), "utf8"));
  const generation = Number(generationText);
  const learnset = parseLearnsetPage(page, generation);
  parsedFiles += 1;
  if (learnset.length === 0) {
    continue;
  }

  const records = [...(entry.generationRecords || [])];
  const recordIndex = records.findIndex((record) => Number(record.generation) === generation);
  if (recordIndex >= 0) {
    records[recordIndex] = mergeRecord(records[recordIndex], generation, learnset);
  } else {
    records.push(mergeRecord(undefined, generation, learnset));
  }
  records.sort((left, right) => Number(left.generation) - Number(right.generation));

  entry.generationRecords = records;
  entry.moveIds = [...new Set(records.flatMap((record) => record.moveIds || []))];
  entry.generations = [...new Set([...(entry.generations || []), generation])].sort((left, right) => left - right);
  mergedRecords += 1;
  mergedEntries += learnset.length;
}

writeFileSync(POKEMON_FILE, `${JSON.stringify(pokemon, null, 2)}\n`);

console.log(`Parsed ${parsedFiles} raw learnset pages.`);
console.log(`Merged ${mergedRecords} generation records with ${mergedEntries} learnset entries.`);
