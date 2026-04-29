import { ALL_TYPE_OPTIONS, TYPE_ALIASES, NATURE_EFFECTS, STAT_KEYS, LEARN_METHOD_LABELS } from "./constants.js";

export function normalizeTypeName(type) {
  return TYPE_ALIASES[String(type || "").trim()] || String(type || "").trim();
}

export function splitTypeNames(type) {
  const normalized = normalizeTypeName(type);
  if (!normalized) return [];
  if (ALL_TYPE_OPTIONS.includes(normalized)) return [normalized];

  const result = [];
  let remaining = normalized;
  const candidates = [...ALL_TYPE_OPTIONS, ...Object.keys(TYPE_ALIASES)]
    .sort((a, b) => b.length - a.length);

  while (remaining) {
    const matched = candidates.find((c) => remaining.startsWith(c));
    if (!matched) return [normalized];
    result.push(normalizeTypeName(matched));
    remaining = remaining.slice(matched.length);
  }
  return result;
}

export function hasType(typeValue, expectedType) {
  return splitTypeNames(typeValue).includes(expectedType);
}

export function getTypeChips(type) {
  if (!type) return [];
  return [...new Set(splitTypeNames(type))];
}

export function getNatureMultiplier(nature, statKey) {
  const effect = NATURE_EFFECTS[nature];
  if (!effect) return 1;
  if (effect.up === statKey) return 1.1;
  if (effect.down === statKey) return 0.9;
  return 1;
}

export function calculateFinalStat(member, detail, statKey) {
  const base = detail?.baseStats?.[statKey];
  if (base === undefined) return undefined;

  const level = Number(member.level || 50);
  const iv = Number(member.ivs?.[statKey] ?? 31);
  const ev = Number(member.evs?.[statKey] ?? 0);

  if (statKey === "hp") {
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }

  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(raw * getNatureMultiplier(member.nature || "认真", statKey));
}

export function buildDerivedStats(member, detail) {
  if (!detail?.baseStats) return undefined;
  return Object.fromEntries(
    STAT_KEYS.map((key) => [key, calculateFinalStat(member, detail, key)])
  );
}

export function createDefaultStats(kind) {
  return Object.fromEntries(
    STAT_KEYS.map((key) => [key, kind === "iv" ? 31 : 0])
  );
}

export function createDraftMember(pokemon) {
  return {
    pokemonId: pokemon?.slug || pokemon?.id || "",
    nameZh: pokemon?.nameZh || "",
    level: 50,
    itemId: "",
    abilityId: "",
    nature: "认真",
    moves: ["", "", "", ""],
    ivs: createDefaultStats("iv"),
    evs: createDefaultStats("ev")
  };
}

export function getPokemonPreviewImage(pokemon) {
  return pokemon?.image || pokemon?.images?.official || pokemon?.images?.sprite || pokemon?.images?.shinyOfficial || pokemon?.images?.shinySprite;
}

export function describeLearnsetEntry(entry) {
  const parts = [];
  const method = LEARN_METHOD_LABELS[entry.learnMethod] || entry.learnMethod;
  if (method) parts.push(method);
  if (entry.level !== undefined) parts.push(`Lv.${entry.level}`);
  if (entry.notes) parts.push(entry.notes);
  return parts.join(" · ");
}

export function resolveMoveGenerationRecord(move, generation) {
  const target = Number(generation || 9);
  const records = [...(move?.generations || [])].sort((a, b) => a.generation - b.generation);
  if (records.length === 0) return undefined;
  const exact = records.find((r) => r.generation === target);
  if (exact) return exact;
  const previous = [...records].reverse().find((r) => r.generation <= target);
  return previous || records[records.length - 1];
}

export function resolvePokemonGenerationRecord(pokemon, generation) {
  const target = Number(generation || 9);
  const records = [...(pokemon?.generationRecords || [])].sort((a, b) => a.generation - b.generation);
  if (records.length === 0) return undefined;
  const exact = records.find((r) => r.generation === target);
  if (exact) return exact;
  const previous = [...records].reverse().find((r) => r.generation <= target);
  return previous || records[records.length - 1];
}

export function getPokemonLearnsetEntries(pokemon, generation) {
  const record = resolvePokemonGenerationRecord(pokemon, generation);
  if (record?.learnset?.length) return record.learnset;
  if (record?.moveIds?.length) return record.moveIds.map((moveId) => ({ moveId }));
  if (pokemon?.moveIds?.length) return pokemon.moveIds.map((moveId) => ({ moveId }));
  return [];
}

export function sortLearnsetEntries(entries) {
  const methodOrder = { "level-up": 1, evolution: 2, tm: 3, hm: 4, tutor: 5, egg: 6, event: 7, other: 8 };
  return [...entries].sort((a, b) => {
    const am = methodOrder[a.learnMethod] || 99;
    const bm = methodOrder[b.learnMethod] || 99;
    if (am !== bm) return am - bm;
    const al = a.level ?? 999;
    const bl = b.level ?? 999;
    if (al !== bl) return al - bl;
    return String(a.moveNameZh || a.moveId || "").localeCompare(String(b.moveNameZh || b.moveId || ""), "zh-Hans-CN");
  });
}

export function buildMoveLookup(allMoves = []) {
  const lookup = new Map();
  for (const move of allMoves) {
    for (const key of [move.id, move.slug, move.nameZh, move.nameEn, move.nameJa].filter(Boolean)) {
      lookup.set(String(key), move);
    }
  }
  return lookup;
}

export function resolveLearnsetMove(entry, moveLookup) {
  return moveLookup.get(String(entry.moveId || "")) ||
    moveLookup.get(String(entry.moveNameZh || "")) ||
    undefined;
}

export function buildEvolutionFamilies(pokemonList) {
  const families = new Map();

  function toEvolutionMember(pokemon) {
    return {
      id: pokemon.id,
      dexNumber: pokemon.dexNumber,
      slug: pokemon.slug,
      nameZh: pokemon.nameZh,
      nameEn: pokemon.nameEn,
      primaryType: pokemon.primaryType,
      secondaryType: pokemon.secondaryType,
      stageLabel: "未进化",
      image: getPokemonPreviewImage(pokemon)
    };
  }

  for (const pokemon of pokemonList) {
    const chain = Array.isArray(pokemon.evolutionChain) && pokemon.evolutionChain.length > 0
      ? pokemon.evolutionChain
      : [toEvolutionMember(pokemon)];
    const key = chain.map((m) => m.id || m.slug || m.nameZh).join("|");

    if (!families.has(key)) {
      families.set(key, { key, chain, matches: [] });
    }
    families.get(key).matches.push(pokemon);
  }

  return [...families.values()].sort((a, b) => {
    const ad = Math.min(...a.chain.map((m) => Number(m.dexNumber || 9999)));
    const bd = Math.min(...b.chain.map((m) => Number(m.dexNumber || 9999)));
    return ad - bd;
  });
}

export function buildPokemonGenerationOptions(detail) {
  const values = new Set();
  for (const g of detail.generations || []) values.add(Number(g));
  for (const g of detail.generationAvailability || []) values.add(Number(g.generation));
  for (const r of detail.generationRecords || []) values.add(Number(r.generation));
  return [...values].filter(Boolean).sort((a, b) => a - b);
}

export function buildPokemonFormOptions(detail) {
  const forms = (detail.forms || []).filter((form) =>
    form?.nameZh &&
    form.nameZh !== detail.nameZh &&
    (form.baseStats || form.images || form.primaryType || form.secondaryType || form.abilityIds?.length || form.isMega)
  );

  return [
    {
      id: "base",
      nameZh: "普通形态",
      images: detail.images,
      baseStats: detail.baseStats,
      primaryType: detail.primaryType,
      secondaryType: detail.secondaryType,
      abilityIds: detail.abilityIds
    },
    ...forms
  ];
}

export function resolvePokemonDisplayVariant(detail, detailGeneration, detailForm, globalGeneration) {
  const genOptions = buildPokemonGenerationOptions(detail);
  let generation;
  if (genOptions.length === 0) {
    generation = undefined;
  } else {
    const requested = Number(detailGeneration || globalGeneration || 0);
    generation = (requested && genOptions.includes(requested)) ? requested : genOptions[genOptions.length - 1];
  }

  const records = [...(detail.generationRecords || [])].sort((a, b) => a.generation - b.generation);
  const generationRecord = generation && records.length > 0
    ? (records.find((r) => r.generation === generation) || [...records].reverse().find((r) => r.generation <= generation) || records[records.length - 1])
    : undefined;

  const formOptions = buildPokemonFormOptions(detail);
  const selectedForm = formOptions.find((f) => f.id === detailForm) || formOptions[0];
  const stats = selectedForm.baseStats || generationRecord?.baseStats || detail.baseStats || {};
  const primaryType = selectedForm.primaryType || generationRecord?.primaryType || detail.primaryType;
  const secondaryType = selectedForm.secondaryType || generationRecord?.secondaryType || detail.secondaryType;
  const abilityText = selectedForm.abilityIds?.length
    ? selectedForm.abilityIds.join(" / ")
    : generationRecord?.abilityIds?.length
      ? generationRecord.abilityIds.join(" / ")
      : (detail.abilities || []).join(" / ");

  return {
    generation,
    generationRecord,
    form: selectedForm,
    formOptions,
    generationOptions: genOptions,
    stats,
    images: selectedForm.images || detail.images,
    primaryType,
    secondaryType,
    abilityText,
    hiddenAbilityText: generationRecord?.hiddenAbilityId || detail.hiddenAbility || "无"
  };
}

export function getLearnableDamageMoves(pokemon, allMoves, generation) {
  const learnsetEntries = getPokemonLearnsetEntries(pokemon, generation);
  if (!pokemon || learnsetEntries.length === 0) {
    return { moves: allMoves, learnsetEntries: [] };
  }

  const moveIds = new Set(
    learnsetEntries.flatMap((entry) => [entry.moveId, entry.moveNameZh]).filter(Boolean)
  );
  const moves = allMoves.filter((move) =>
    moveIds.has(move.id) || moveIds.has(move.slug) || moveIds.has(move.nameZh)
  );
  return { moves, learnsetEntries };
}
