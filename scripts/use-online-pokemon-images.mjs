import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const POKEMON_FILE = resolve(ROOT, "data/normalized/pokemon.json");

function normalizeMediaUrl(url) {
  if (!url) return url;
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

function fileName(url) {
  return decodeURIComponent(String(url || "").split("?")[0].split("#")[0].split("/").pop() || "");
}

function isPokemonHomeUrl(url) {
  return /^HOME_/i.test(fileName(url).replace(/^\d+px-/i, ""));
}

function onlineImageAsset(asset, fallbackUrl) {
  const sourceUrl = normalizeMediaUrl(asset?.sourceUrl || fallbackUrl || asset?.url);
  if (!sourceUrl) {
    return asset;
  }

  return {
    ...asset,
    url: sourceUrl,
    sourceUrl
  };
}

function normalizePokemonImageSet(images) {
  if (!images) {
    return images;
  }

  const next = { ...images };
  for (const key of ["official", "shinyOfficial", "sprite", "shinySprite"]) {
    if (!next[key]) {
      continue;
    }
    next[key] = onlineImageAsset(next[key]);
  }

  const homeOfficial = Object.values(next).find((asset) => isPokemonHomeUrl(asset?.sourceUrl || asset?.url) && !/_s\./i.test(fileName(asset.sourceUrl || asset.url)));
  const homeShiny = Object.values(next).find((asset) => isPokemonHomeUrl(asset?.sourceUrl || asset?.url) && /_s\./i.test(fileName(asset.sourceUrl || asset.url)));

  if (homeOfficial) {
    next.official = onlineImageAsset({
      ...homeOfficial,
      alt: next.official?.alt || homeOfficial.alt
    });
  }
  if (homeShiny) {
    next.shinyOfficial = onlineImageAsset({
      ...homeShiny,
      alt: next.shinyOfficial?.alt || homeShiny.alt
    });
  }

  return next;
}

const pokemon = JSON.parse(readFileSync(POKEMON_FILE, "utf8"));
let pokemonUpdated = 0;
let formUpdated = 0;

for (const entry of pokemon) {
  const before = JSON.stringify(entry.images);
  entry.images = normalizePokemonImageSet(entry.images);
  if (JSON.stringify(entry.images) !== before) {
    pokemonUpdated += 1;
  }

  for (const form of entry.forms || []) {
    const formBefore = JSON.stringify(form.images);
    form.images = normalizePokemonImageSet(form.images);
    if (JSON.stringify(form.images) !== formBefore) {
      formUpdated += 1;
    }
  }

  if (Array.isArray(entry.evolutionChain)) {
    for (const member of entry.evolutionChain) {
      if (member.image) {
        member.image = onlineImageAsset(member.image);
      }
    }
  }
}

writeFileSync(POKEMON_FILE, `${JSON.stringify(pokemon, null, 2)}\n`);

console.log(`pokemon image sets updated: ${pokemonUpdated}`);
console.log(`form image sets updated: ${formUpdated}`);
