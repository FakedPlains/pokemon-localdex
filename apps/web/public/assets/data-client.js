const STATIC_MODE =
  window.location.hostname.endsWith(".github.io") ||
  window.location.protocol === "file:" ||
  window.location.pathname.startsWith("/pokemon-localdex/") ||
  new URLSearchParams(window.location.search).has("static");
const STATIC_TEAM_STORAGE_KEY = "pokemon-localdex-teams";
const staticCache = new Map();
const ALL_TYPE_OPTIONS = [
  "一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面",
  "飞行", "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精"
];
const TYPE_ALIASES = {
  電: "电",
  飛行: "飞行",
  蟲: "虫",
  龍: "龙",
  惡: "恶",
  鋼: "钢",
  格鬥: "格斗",
  幽靈: "幽灵"
};

export async function api(path, options) {
  if (STATIC_MODE) {
    return staticApi(path, options);
  }

  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

function toStaticUrl(path) {
  return new URL(path.replace(/^\/+/, ""), document.baseURI).href;
}

function normalizeStaticAssetUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//.test(url)) return url;
  return toStaticUrl(url);
}

function normalizeStaticAssets(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeStaticAssets);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeStaticAssets(entry)])
  );

  if (typeof value.url === "string") {
    next.url = normalizeStaticAssetUrl(value.url);
  }

  return next;
}

async function loadStaticCollection(name) {
  if (!staticCache.has(name)) {
    const response = await fetch(toStaticUrl(`data/normalized/${name}.json`));
    if (!response.ok) {
      throw new Error(`Static data not found: ${name}`);
    }
    staticCache.set(name, normalizeStaticAssets(await response.json()));
  }
  return staticCache.get(name);
}

function matchesTextQuery(entry, query, extraValues = []) {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) return true;

  return [entry.id, entry.slug, entry.nameZh, entry.nameJa, entry.nameEn, ...extraValues]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function isSearchablePokemonFormName(name) {
  if (!name || /[{}]/.test(name)) {
    return false;
  }

  const text = String(name).trim();
  if (!text || text.length > 24 || /[／/]/.test(text)) {
    return false;
  }

  return !/^(第[一二三四五六七八九]+世代|获得方式|宝可梦|游戏版本|地点|方式|备注|金|银|水晶版|红宝石|蓝宝石|绿宝石|火红|叶绿|钻石|珍珠|白金|心金|魂银|黑|白|黑２|白２|Ｘ|Ｙ|太阳|月亮|究极之日|究极之月|Let's|Go！皮卡丘|Go！伊布|传说|阿尔宙斯|朱|紫|Z-A)$|冒[险險]/.test(text);
}

function searchablePokemonFormNames(entry) {
  return (entry.forms || [])
    .map((form) => form.nameZh)
    .filter(isSearchablePokemonFormName);
}

function normalizeTypeName(type) {
  return TYPE_ALIASES[String(type || "").trim()] || String(type || "").trim();
}

function splitTypeNames(type) {
  const normalized = normalizeTypeName(type);
  if (!normalized) {
    return [];
  }
  if (ALL_TYPE_OPTIONS.includes(normalized)) {
    return [normalized];
  }

  const result = [];
  let remaining = normalized;
  const candidates = [...ALL_TYPE_OPTIONS, ...Object.keys(TYPE_ALIASES)]
    .sort((left, right) => right.length - left.length);

  while (remaining) {
    const matched = candidates.find((candidate) => remaining.startsWith(candidate));
    if (!matched) {
      return [normalized];
    }
    result.push(normalizeTypeName(matched));
    remaining = remaining.slice(matched.length);
  }

  return result;
}

function hasType(typeValue, expectedType) {
  return splitTypeNames(typeValue).includes(expectedType);
}

function searchStaticPokemon(entries, filters) {
  const query = filters.get("q");
  const type = filters.get("type");
  const generation = Number(filters.get("generation") || 0);

  return entries.filter((entry) => {
    const matchesQuery = matchesTextQuery(
      entry,
      query,
      searchablePokemonFormNames(entry)
    );
    const matchesType = !type ||
      hasType(entry.primaryType, type) ||
      hasType(entry.secondaryType, type) ||
      entry.forms?.some((form) => hasType(form.primaryType, type) || hasType(form.secondaryType, type)) ||
      entry.generationRecords?.some((record) => hasType(record.primaryType, type) || hasType(record.secondaryType, type));
    const matchesGeneration = !generation ||
      entry.generations?.includes(generation) ||
      entry.generationAvailability?.some((record) => record.generation === generation) ||
      entry.generationRecords?.some((record) => record.generation === generation) ||
      entry.forms?.some((form) => form.introducedGeneration === generation);

    return matchesQuery && matchesType && matchesGeneration;
  });
}

function searchStaticMoves(entries, filters) {
  const query = filters.get("q");
  const type = filters.get("type");
  const generation = Number(filters.get("generation") || 0);

  return entries.filter((entry) => {
    const matchesType = !type || entry.type === type || entry.generations?.some((record) => record.type === type);
    const matchesGeneration = !generation || entry.generations?.some((record) => record.generation === generation);
    return matchesTextQuery(entry, query) && matchesType && matchesGeneration;
  });
}

function searchStaticAbilities(entries, filters) {
  const query = filters.get("q");
  const generation = Number(filters.get("generation") || 0);

  return entries.filter((entry) => {
    const matchesGeneration = !generation || entry.generations?.some((record) => record.generation === generation);
    return matchesTextQuery(entry, query) && matchesGeneration;
  });
}

async function readStaticTeams() {
  const stored = window.localStorage.getItem(STATIC_TEAM_STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return loadStaticCollection("teams");
}

function saveStaticTeams(teams) {
  window.localStorage.setItem(STATIC_TEAM_STORAGE_KEY, JSON.stringify(teams));
}

function calculateDamage(input) {
  const stab = input.stab ?? 1;
  const typeEffectiveness = input.typeEffectiveness ?? 1;
  const weather = input.weather ?? 1;
  const critical = input.critical ?? 1;
  const other = input.other ?? 1;
  const randomMin = input.randomMin ?? 0.85;
  const randomMax = input.randomMax ?? 1;
  const base =
    Math.floor(
      Math.floor(
        Math.floor((2 * input.level) / 5 + 2) * input.power * input.attack / Math.max(1, input.defense)
      ) / 50
    ) + 2;
  const min = Math.floor(base * stab * typeEffectiveness * weather * critical * other * randomMin);
  const max = Math.floor(base * stab * typeEffectiveness * weather * critical * other * randomMax);

  return {
    min,
    max,
    average: Number(((min + max) / 2).toFixed(2))
  };
}

async function staticApi(path, options = {}) {
  const method = options.method || "GET";
  const url = new URL(path, "https://localdex.local");
  const pathname = url.pathname;

  if (method === "GET" && pathname === "/pokemon") {
    const pokemon = await loadStaticCollection("pokemon");
    return { data: searchStaticPokemon(pokemon, url.searchParams) };
  }

  if (method === "GET" && pathname.startsWith("/pokemon/")) {
    const id = decodeURIComponent(pathname.replace("/pokemon/", ""));
    const pokemon = await loadStaticCollection("pokemon");
    return { data: pokemon.find((item) => item.id === id || item.slug === id) };
  }

  if (method === "GET" && pathname === "/items") {
    return { data: await loadStaticCollection("items") };
  }

  if (method === "GET" && pathname.startsWith("/items/")) {
    const id = decodeURIComponent(pathname.replace("/items/", ""));
    const items = await loadStaticCollection("items");
    return { data: items.find((item) => item.id === id || item.slug === id) };
  }

  if (method === "GET" && pathname === "/moves") {
    const moves = await loadStaticCollection("moves");
    return { data: searchStaticMoves(moves, url.searchParams) };
  }

  if (method === "GET" && pathname.startsWith("/moves/")) {
    const id = decodeURIComponent(pathname.replace("/moves/", ""));
    const moves = await loadStaticCollection("moves");
    return { data: moves.find((item) => item.id === id || item.slug === id) };
  }

  if (method === "GET" && pathname === "/abilities") {
    const abilities = await loadStaticCollection("abilities");
    return { data: searchStaticAbilities(abilities, url.searchParams) };
  }

  if (method === "GET" && pathname.startsWith("/abilities/")) {
    const id = decodeURIComponent(pathname.replace("/abilities/", ""));
    const abilities = await loadStaticCollection("abilities");
    return { data: abilities.find((item) => item.id === id || item.slug === id) };
  }

  if (method === "GET" && pathname === "/teams") {
    return { data: await readStaticTeams() };
  }

  if (method === "POST" && pathname === "/teams") {
    const teams = await readStaticTeams();
    const input = JSON.parse(options.body || "{}");
    const now = new Date().toISOString();
    const team = {
      id: input.id || `team_${Date.now()}`,
      name: input.name || "未命名队伍",
      format: input.format || "singles",
      members: input.members || [],
      createdAt: input.createdAt || now,
      updatedAt: now
    };
    const index = teams.findIndex((item) => item.id === team.id);
    if (index >= 0) {
      teams[index] = { ...teams[index], ...team, updatedAt: now };
    } else {
      teams.push(team);
    }
    saveStaticTeams(teams);
    return { data: team };
  }

  if (method === "POST" && pathname === "/battle/damage") {
    return { data: calculateDamage(JSON.parse(options.body || "{}")) };
  }

  throw new Error(`Unsupported static route: ${method} ${pathname}`);
}
