import { ALL_TYPE_OPTIONS, TYPE_ALIASES, NATURE_EFFECTS, STAT_KEYS, LEARN_METHOD_LABELS } from "./constants.js";

/**
 * 从 hash 路由的 query string 中解析 expand 参数
 * 用于 #/moves?expand=123、#/abilities?expand=456 等场景
 * @returns {string|null}
 */
export function parseExpandParam() {
  const hash = window.location.hash || "";
  const qIdx = hash.indexOf("?");
  if (qIdx < 0) return null;
  const params = new URLSearchParams(hash.slice(qIdx));
  return params.get("expand") || null;
}

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

/**
 * 经典 EV → Champions SP 转换
 * Lv.50 时 EV 的实际能力值增量 = ceil(floor(EV/4) / 2)
 * Champions 的 SP 直接就是能力值加成，所以 SP = 该增量
 */
export function evToSp(ev) {
  if (ev <= 0) return 0;
  const evEffect = Math.floor(ev / 4);
  return Math.min(Math.max(Math.ceil(evEffect / 2), 0), 32);
}

export function calculateFinalStat(member, detail, statKey) {
  const base = detail?.baseStats?.[statKey];
  if (base === undefined) return undefined;

  // Champions 模式：SP 直接加算公式
  if (member.statMode === "champions") {
    const sp = Number(member.sps?.[statKey] ?? 0);
    const nature = member.champNature || member.nature || "认真";
    if (statKey === "hp") {
      return base + sp + 75;
    }
    return Math.floor((base + sp + 20) * getNatureMultiplier(nature, statKey));
  }

  // 经典模式：IV + EV 公式
  const level = Number(member.level || 50);
  const iv = Number(member.ivs?.[statKey] ?? 31);
  const ev = Number(member.evs?.[statKey] ?? 0);

  if (statKey === "hp") {
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }

  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(raw * getNatureMultiplier(member.nature || "认真", statKey));
}

export function calculateClassicStatValue(base, statKey, {
  iv = 31,
  ev = 0,
  level = 50,
  nature = "认真",
} = {}) {
  if (base === undefined || base === null) return undefined;
  if (statKey === "hp") {
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }

  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(raw * getNatureMultiplier(nature, statKey));
}

export function calculateSpeedLine(baseSpe, level = 50) {
  return {
    noInvestment: calculateClassicStatValue(baseSpe, "spe", { iv: 31, ev: 0, level, nature: "认真" }),
    full: calculateClassicStatValue(baseSpe, "spe", { iv: 31, ev: 252, level, nature: "认真" }),
    max: calculateClassicStatValue(baseSpe, "spe", { iv: 31, ev: 252, level, nature: "爽朗" }),
  };
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
    pokemonId: pokemon?.id ? String(pokemon.id) : "",
    nameZh: pokemon?.nameZh || "",
    configName: "",
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
  // Legacy: generationRecords no longer exist in form-centric API.
  // Return undefined — callers should use forms[] instead.
  return undefined;
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
  return [...values].filter(Boolean).sort((a, b) => a - b);
}

/**
 * 根据世代从 variants 数组中选择匹配的变体。
 * variants 中每个元素有 generationStart/generationEnd 字段。
 * 返回匹配的变体，如果没有匹配则返回 undefined。
 */
function _resolveVariantForGeneration(variants, gen) {
  if (!variants || variants.length === 0) return undefined;
  if (!gen) return variants.find((v) => !v.generationEnd) || variants[variants.length - 1];
  const matched = variants.find((v) => {
    const gs = v.generationStart;
    const ge = v.generationEnd;
    if (gs && ge) return gen >= gs && gen <= ge;
    if (gs) return gen >= gs;
    if (ge) return gen <= ge;
    return true;
  });
  return matched || variants.find((v) => !v.generationEnd) || variants[variants.length - 1];
}

export function buildPokemonFormOptions(detail, generation) {
  const forms = detail.forms || [];
  if (forms.length === 0) {
    // Fallback: synthesize a single "default" form from top-level fields
    return [{
      id: "default",
      formKey: "default",
      nameZh: detail.nameZh || "普通形态",
      formType: "default",
      isDefault: true,
      primaryType: detail.primaryType,
      secondaryType: detail.secondaryType,
      abilities: (detail.abilities || []).map((a) => ({ nameZh: a, isHidden: false })),
      baseStats: detail.baseStats,
      images: detail.images ? { official: detail.image } : undefined
    }];
  }

  const gen = Number(generation || 0);

  // 每个形态只有一条记录，直接映射
  return forms.map((form) => {
    const resolved = { ...form, id: form.formKey || form.nameZh };

    // 如果有世代种族值变体，根据当前世代选择
    if (form.statVariants && form.statVariants.length > 0) {
      const sv = _resolveVariantForGeneration(form.statVariants, gen);
      if (sv) resolved.baseStats = sv.baseStats;
    }

    // 如果有世代属性变体，根据当前世代选择
    if (form.typeVariants && form.typeVariants.length > 0) {
      const tv = _resolveVariantForGeneration(form.typeVariants, gen);
      if (tv) {
        resolved.primaryType = tv.primaryType;
        resolved.secondaryType = tv.secondaryType;
      }
    }

    // 如果有世代特性变体，根据当前世代选择
    if (form.abilityVariants && form.abilityVariants.length > 0) {
      const av = _resolveVariantForGeneration(form.abilityVariants, gen);
      if (av) resolved.abilities = av.abilities;
    }

    return resolved;
  });
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

  const formOptions = buildPokemonFormOptions(detail, generation);
  const selectedForm = formOptions.find((f) => f.id === detailForm) || formOptions[0];

  const stats = selectedForm.baseStats || detail.baseStats || {};
  const primaryType = selectedForm.primaryType || detail.primaryType;
  const secondaryType = selectedForm.secondaryType || detail.secondaryType;

  // Build ability info from form's abilities array [{nameZh, isHidden, abilityId?, description?}]
  const formAbilities = selectedForm.abilities || [];
  const hasOwnAbilities = formAbilities.length > 0;
  const normalAbilities = formAbilities.filter((a) => !a.isHidden);
  const hiddenAbilitiesList = formAbilities.filter((a) => a.isHidden);
  const abilityText = normalAbilities.length > 0
    ? normalAbilities.map((a) => a.nameZh).join(" / ")
    : (detail.abilities || []).join(" / ");
  // Only fallback to top-level hiddenAbility when the form has no own abilities data.
  // Mega / Gmax forms define their own abilities array; if it contains no hidden entry
  // that means the form genuinely has no hidden ability — don't inherit the base form's.
  const hiddenAbilityText = hasOwnAbilities
    ? (hiddenAbilitiesList.length > 0 ? hiddenAbilitiesList.map((a) => a.nameZh).join(" / ") : "无")
    : (detail.hiddenAbility || "无");
  // Full abilities array with id & description for tooltip / linking
  const abilitiesDetailed = hasOwnAbilities
    ? formAbilities
    : (detail.abilities || []).map((name) => ({ nameZh: name, isHidden: false }));

  // Resolve images: form images → top-level image fallback
  const images = selectedForm.images || (detail.image ? { official: detail.image } : undefined);

  return {
    generation,
    form: selectedForm,
    formOptions,
    generationOptions: genOptions,
    stats,
    images,
    primaryType,
    secondaryType,
    abilityText,
    hiddenAbilityText,
    abilitiesDetailed
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
