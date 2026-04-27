const app = document.querySelector("#app");
const navLinks = [...document.querySelectorAll("[data-nav]")];
const STATIC_MODE =
  window.location.hostname.endsWith(".github.io") ||
  window.location.protocol === "file:" ||
  window.location.pathname.startsWith("/pokemon-localdex/") ||
  new URLSearchParams(window.location.search).has("static");
const STATIC_TEAM_STORAGE_KEY = "pokemon-localdex-teams";
const staticCache = new Map();

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const NATURE_OPTIONS = [
  "勤奋", "怕寂寞", "固执", "顽皮", "勇敢",
  "大胆", "坦率", "淘气", "乐天", "悠闲",
  "胆小", "急躁", "认真", "爽朗", "天真",
  "内敛", "慢吞吞", "害羞", "马虎", "冷静",
  "温和", "温顺", "慎重", "浮躁", "自大"
];
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
const LEARN_METHOD_LABELS = {
  "level-up": "升级",
  tm: "招式学习器",
  hm: "秘传学习器",
  egg: "蛋招式",
  tutor: "教学",
  event: "活动",
  evolution: "进化",
  other: "其他"
};
const NATURE_EFFECTS = {
  怕寂寞: { up: "atk", down: "def" },
  固执: { up: "atk", down: "spa" },
  顽皮: { up: "atk", down: "spd" },
  勇敢: { up: "atk", down: "spe" },
  大胆: { up: "def", down: "atk" },
  淘气: { up: "def", down: "spa" },
  乐天: { up: "def", down: "spd" },
  悠闲: { up: "def", down: "spe" },
  胆小: { up: "spe", down: "atk" },
  急躁: { up: "spe", down: "def" },
  爽朗: { up: "spe", down: "spa" },
  天真: { up: "spe", down: "spd" },
  内敛: { up: "spa", down: "atk" },
  马虎: { up: "spa", down: "def" },
  冷静: { up: "spa", down: "spe" },
  温和: { up: "spd", down: "atk" },
  温顺: { up: "spd", down: "def" },
  慎重: { up: "spd", down: "spa" },
  自大: { up: "spd", down: "spe" }
};

const state = {
  pokedex: { query: "", type: "", generation: "", selected: null, imageMode: "official", detailGeneration: "", detailForm: "base" },
  items: { selected: null, query: "", category: "", visibleLimit: 120 },
  moves: { query: "", type: "", generation: "", selected: null },
  abilities: { query: "", generation: "", selected: null },
  teams: { id: "", name: "", format: "singles", members: [], saved: [] },
  damage: {
    attacker: createDraftMember(),
    defender: createDraftMember(),
    moveId: "",
    moveGeneration: "9",
    moveName: "",
    moveType: "电",
    power: 90,
    category: "special",
    accuracy: "100%",
    moveEffectSummary: "",
    typeEffectiveness: 1,
    weather: 1,
    critical: false,
    other: 1,
    result: null
  }
};

const typeOptions = ALL_TYPE_OPTIONS;
const generationOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function setLoading() {
  app.innerHTML = document.querySelector("#loading-template").innerHTML;
}

async function api(path, options) {
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

function normalizeStaticAssetUrl(url, sourceUrl) {
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
    next.url = normalizeStaticAssetUrl(value.url, value.sourceUrl);
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

async function renderAndRestoreInput(renderView, input) {
  const snapshot = {
    id: input.id,
    start: input.selectionStart,
    end: input.selectionEnd
  };

  await renderView();

  const nextInput = document.getElementById(snapshot.id);
  if (!nextInput) {
    return;
  }

  nextInput.focus();
  if (typeof nextInput.setSelectionRange === "function") {
    const start = Math.min(snapshot.start ?? nextInput.value.length, nextInput.value.length);
    const end = Math.min(snapshot.end ?? start, nextInput.value.length);
    nextInput.setSelectionRange(start, end);
  }
}

function bindSearchInput(selector, setValue, renderView) {
  const input = document.querySelector(selector);
  input?.addEventListener("input", async (event) => {
    if (event.isComposing) {
      return;
    }
    setValue(event.target.value);
    await renderAndRestoreInput(renderView, event.target);
  });
  input?.addEventListener("compositionend", async (event) => {
    setValue(event.target.value);
    await renderAndRestoreInput(renderView, event.target);
  });
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
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

function typeChip(type) {
  if (!type) return "";
  return [...new Set(splitTypeNames(type))]
    .map((name) => `<span class="type-chip type-${name}">${escapeHtml(name)}</span>`)
    .join("");
}

function activateNav(route) {
  navLinks.forEach((link) => {
    const target = link.getAttribute("href").replace("#", "");
    link.classList.toggle("active", route.startsWith(target));
  });
}

function createDefaultStats(kind) {
  return Object.fromEntries(
    STAT_KEYS.map((key) => [key, kind === "iv" ? 31 : 0])
  );
}

function createDraftMember(pokemon) {
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

function getDraftSlots() {
  const slots = Array.from({ length: 6 }, (_, index) => state.teams.members[index] || createDraftMember());
  return slots;
}

function setDraftMemberAt(index, member) {
  const slots = getDraftSlots();
  slots[index] = member;
  while (slots.length > 0 && !slots[slots.length - 1].pokemonId) {
    slots.pop();
  }
  state.teams.members = slots;
}

function addPokemonToTeam(detail) {
  const slots = getDraftSlots();
  const nextIndex = slots.findIndex((member) => !member.pokemonId);
  const index = nextIndex >= 0 ? nextIndex : 5;
  slots[index] = {
    ...createDraftMember(detail),
    abilityId: detail?.abilities?.[0] || ""
  };
  state.teams.members = slots.filter((member, slotIndex) => member.pokemonId || slotIndex < index + 1);
}

function loadSavedTeam(team) {
  state.teams.id = team.id || "";
  state.teams.name = team.name || "";
  state.teams.format = team.format || "singles";
  state.teams.members = (team.members || []).map((member) => ({
    pokemonId: member.pokemonId || "",
    nameZh: member.nameZh || member.pokemonId || "",
    level: member.level || 50,
    itemId: member.itemId || "",
    abilityId: member.abilityId || "",
    nature: member.nature || "认真",
    moves: [...(member.moves || []), "", "", "", ""].slice(0, 4),
    ivs: { ...createDefaultStats("iv"), ...(member.ivs || {}) },
    evs: { ...createDefaultStats("ev"), ...(member.evs || {}) }
  }));
}

function clearDraft() {
  state.teams.id = "";
  state.teams.name = "";
  state.teams.format = "singles";
  state.teams.members = [];
}

function setDamageMemberField(sideKey, field, value) {
  state.damage[sideKey] = {
    ...state.damage[sideKey],
    [field]: value
  };
}

function setDamageMemberStat(sideKey, kind, statKey, value) {
  state.damage[sideKey] = {
    ...state.damage[sideKey],
    [kind]: {
      ...state.damage[sideKey][kind],
      [statKey]: value
    }
  };
}

function loadTeamMemberToDamage(sideKey, slotIndex) {
  const teamMember = getDraftSlots()[slotIndex];
  if (!teamMember?.pokemonId) {
    return;
  }

  state.damage[sideKey] = {
    ...createDraftMember(),
    ...teamMember,
    moves: [...(teamMember.moves || []), "", "", "", ""].slice(0, 4),
    ivs: { ...createDefaultStats("iv"), ...(teamMember.ivs || {}) },
    evs: { ...createDefaultStats("ev"), ...(teamMember.evs || {}) }
  };
}

async function render() {
  const route = (window.location.hash || "#/pokedex").replace("#", "");
  activateNav(route);
  setLoading();

  if (route.startsWith("/items")) {
    await renderItems();
    return;
  }

  if (route.startsWith("/moves")) {
    await renderMoves();
    return;
  }

  if (route.startsWith("/abilities")) {
    await renderAbilities();
    return;
  }

  if (route.startsWith("/teams")) {
    await renderTeams();
    return;
  }

  if (route.startsWith("/damage")) {
    await renderDamage();
    return;
  }

  await renderPokedex();
}

function getNatureMultiplier(nature, statKey) {
  const effect = NATURE_EFFECTS[nature];
  if (!effect) return 1;
  if (effect.up === statKey) return 1.1;
  if (effect.down === statKey) return 0.9;
  return 1;
}

function calculateFinalStat(member, detail, statKey) {
  const base = detail?.baseStats?.[statKey];
  if (base === undefined) {
    return undefined;
  }

  const level = Number(member.level || 50);
  const iv = Number(member.ivs?.[statKey] ?? 31);
  const ev = Number(member.evs?.[statKey] ?? 0);

  if (statKey === "hp") {
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }

  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(raw * getNatureMultiplier(member.nature || "认真", statKey));
}

function buildDerivedStats(member, detail) {
  if (!detail?.baseStats) {
    return undefined;
  }

  return {
    hp: calculateFinalStat(member, detail, "hp"),
    atk: calculateFinalStat(member, detail, "atk"),
    def: calculateFinalStat(member, detail, "def"),
    spa: calculateFinalStat(member, detail, "spa"),
    spd: calculateFinalStat(member, detail, "spd"),
    spe: calculateFinalStat(member, detail, "spe")
  };
}

async function hydrateDamageSide(member) {
  if (!member?.pokemonId) {
    return {
      member,
      detail: null,
      derivedStats: undefined
    };
  }

  try {
    const detail = (await api(`/pokemon/${encodeURIComponent(member.pokemonId)}`)).data;
    return {
      member,
      detail,
      derivedStats: buildDerivedStats(member, detail)
    };
  } catch {
    return {
      member,
      detail: null,
      derivedStats: undefined
    };
  }
}

function renderImageViewer(images, imageMode) {
  const selected = imageMode === "shiny"
    ? images?.shinyOfficial || images?.shinySprite || images?.official || images?.sprite
    : images?.official || images?.sprite || images?.shinyOfficial || images?.shinySprite;

  if (!selected?.url) {
    return `<div class="media-placeholder">暂无图片</div>`;
  }

  return `
    <div class="media-viewer">
      <img src="${escapeHtml(selected.url)}" alt="${escapeHtml(selected.alt || "图片")}" class="entity-image" />
      <div class="toolbar-row" style="margin-top: 12px;">
        <button class="${imageMode === "official" ? "" : "secondary"} compact-button" data-image-mode="official">普通</button>
        <button class="${imageMode === "shiny" ? "" : "secondary"} compact-button" data-image-mode="shiny">闪光</button>
      </div>
    </div>
  `;
}

function getPokemonPreviewImage(pokemon) {
  return pokemon?.image || pokemon?.images?.official || pokemon?.images?.sprite || pokemon?.images?.shinyOfficial || pokemon?.images?.shinySprite;
}

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

function buildEvolutionFamilies(pokemonList) {
  const families = new Map();

  for (const pokemon of pokemonList) {
    const chain = Array.isArray(pokemon.evolutionChain) && pokemon.evolutionChain.length > 0
      ? pokemon.evolutionChain
      : [toEvolutionMember(pokemon)];
    const key = chain.map((member) => member.id || member.slug || member.nameZh).join("|");

    if (!families.has(key)) {
      families.set(key, {
        key,
        chain,
        matches: []
      });
    }

    families.get(key).matches.push(pokemon);
  }

  return [...families.values()].sort((left, right) => {
    const leftDex = Math.min(...left.chain.map((member) => Number(member.dexNumber || 9999)));
    const rightDex = Math.min(...right.chain.map((member) => Number(member.dexNumber || 9999)));
    return leftDex - rightDex;
  });
}

function renderEvolutionFamilyCard(family, selectedId) {
  const matchedIds = new Set(family.matches.map((pokemon) => pokemon.id));
  const selectedInFamily = family.chain.some((member) => member.id === selectedId || member.slug === selectedId);
  const first = family.chain[0];
  const last = family.chain[family.chain.length - 1];
  const dexRange = first?.dexNumber === last?.dexNumber
    ? `#${String(first?.dexNumber || "?").padStart(4, "0")}`
    : `#${String(first?.dexNumber || "?").padStart(4, "0")} - #${String(last?.dexNumber || "?").padStart(4, "0")}`;

  return `
    <div class="list-card evolution-family-card ${selectedInFamily ? "active-card" : ""}">
      <div class="card-topline">
        <span class="dex-badge">${dexRange}</span>
        <span class="chip">${family.chain.length > 1 ? `${family.chain.length} 段进化链` : "不进化"}</span>
      </div>
      <div class="evolution-chain-row">
        ${family.chain.map((member, index) => {
          const image = getPokemonPreviewImage(member);
          const isMatched = matchedIds.has(member.id);
          const isSelected = member.id === selectedId || member.slug === selectedId;
          return `
            <button class="evolution-member ${isMatched ? "matched" : ""} ${isSelected ? "selected" : ""}" data-pokemon="${escapeHtml(member.slug || member.id)}" title="查看 ${escapeHtml(member.nameZh)}">
              <span class="evolution-stage">${escapeHtml(member.stageLabel || (index === 0 ? "基础" : `${index}阶`))}</span>
              ${image?.url ? `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || member.nameZh)}" class="chain-image" />` : `<span class="chain-image placeholder">?</span>`}
              <strong>${escapeHtml(member.nameZh)}</strong>
              <span class="muted">#${String(member.dexNumber || "?").padStart(4, "0")}</span>
              <span class="types">${typeChip(member.primaryType)}${typeChip(member.secondaryType)}</span>
            </button>
          `;
        }).join("")}
      </div>
      <div class="muted">${escapeHtml(family.matches.length === family.chain.length ? "完整命中当前筛选" : `当前筛选命中：${family.matches.map((pokemon) => pokemon.nameZh).join(" / ")}`)}</div>
    </div>
  `;
}

function renderPokemonGenerationCards(detail) {
  const records = detail.generationRecords || [];
  if (records.length === 0) {
    return `<span class="pill">暂无按世代记录</span>`;
  }

  return records.map((record) => `
    <div class="meta-card generation-card">
      <strong>第 ${record.generation} 世代 ${record.label ? `· ${escapeHtml(record.label)}` : ""}</strong>
      <div class="info-stack">
        <div>属性：${escapeHtml([record.primaryType, record.secondaryType].filter(Boolean).join(" / ") || "未记录")}</div>
        <div>特性：${escapeHtml((record.abilityIds || []).join(" / ") || "未记录")}</div>
        <div>隐藏特性：${escapeHtml(record.hiddenAbilityId || "无")}</div>
        <div>招式：${escapeHtml((record.moveIds || []).join(" / ") || "未记录")}</div>
        <div>可学招式表：${record.learnset?.length
          ? record.learnset.map((entry) => {
              const name = entry.moveNameZh || entry.moveId;
              const detailText = describeLearnsetEntry(entry);
              return escapeHtml(detailText ? `${name}（${detailText}）` : name);
            }).join(" / ")
          : "未记录"}</div>
        <div>种族值：${record.baseStats ? escapeHtml(`HP ${record.baseStats.hp} / ATK ${record.baseStats.atk} / DEF ${record.baseStats.def} / SPA ${record.baseStats.spa} / SPD ${record.baseStats.spd} / SPE ${record.baseStats.spe}`) : "未记录"}</div>
        ${record.notes ? `<div class="muted">${escapeHtml(record.notes)}</div>` : ""}
      </div>
    </div>
  `).join("");
}

function renderMoveGenerationCards(move) {
  return (move.generations || []).map((record) => `
    <div class="meta-card generation-card">
      <strong>第 ${record.generation} 世代</strong>
      <div class="info-stack">
        <div>属性：${escapeHtml(record.type || move.type || "未记录")}</div>
        <div>分类：${escapeHtml(record.category || move.category || "未记录")}</div>
        <div>威力：${escapeHtml(record.power ?? move.power ?? "-")}</div>
        <div>命中：${escapeHtml(record.accuracy || move.accuracy || "-")}</div>
        <div>PP：${escapeHtml(record.pp ?? move.pp ?? "-")}</div>
        <div>${escapeHtml(record.effectSummary)}</div>
        ${record.notes ? `<div class="muted">${escapeHtml(record.notes)}</div>` : ""}
      </div>
    </div>
  `).join("");
}

function renderAbilityGenerationCards(ability) {
  return (ability.generations || []).map((record) => `
    <div class="meta-card generation-card">
      <strong>第 ${record.generation} 世代</strong>
      <div class="info-stack">
        <div>${escapeHtml(record.effectSummary)}</div>
        ${record.notes ? `<div class="muted">${escapeHtml(record.notes)}</div>` : ""}
      </div>
    </div>
  `).join("");
}

function describeLearnsetEntry(entry) {
  const parts = [];
  const method = LEARN_METHOD_LABELS[entry.learnMethod] || entry.learnMethod;
  if (method) {
    parts.push(method);
  }
  if (entry.level !== undefined) {
    parts.push(`Lv.${entry.level}`);
  }
  if (entry.notes) {
    parts.push(entry.notes);
  }
  return parts.join(" · ");
}

function resolvePokemonGenerationRecord(pokemon, generation) {
  const targetGeneration = Number(generation || 9);
  const records = [...(pokemon?.generationRecords || [])].sort((left, right) => left.generation - right.generation);
  if (records.length === 0) {
    return undefined;
  }

  const exact = records.find((record) => record.generation === targetGeneration);
  if (exact) {
    return exact;
  }

  const previous = [...records].reverse().find((record) => record.generation <= targetGeneration);
  return previous || records[records.length - 1];
}

function getPokemonLearnsetEntries(pokemon, generation) {
  const record = resolvePokemonGenerationRecord(pokemon, generation);
  if (record?.learnset?.length) {
    return record.learnset;
  }

  if (record?.moveIds?.length) {
    return record.moveIds.map((moveId) => ({ moveId }));
  }

  if (pokemon?.moveIds?.length) {
    return pokemon.moveIds.map((moveId) => ({ moveId }));
  }

  return [];
}

function getLearnableDamageMoves(pokemon, allMoves, generation) {
  const learnsetEntries = getPokemonLearnsetEntries(pokemon, generation);
  if (!pokemon || learnsetEntries.length === 0) {
    return {
      moves: allMoves,
      learnsetEntries: []
    };
  }

  const moveIds = new Set(
    learnsetEntries.flatMap((entry) => [entry.moveId, entry.moveNameZh]).filter(Boolean)
  );
  const moves = allMoves.filter((move) =>
    moveIds.has(move.id) ||
    moveIds.has(move.slug) ||
    moveIds.has(move.nameZh)
  );
  return {
    moves,
    learnsetEntries
  };
}

function resolveMoveGenerationRecord(move, generation) {
  const targetGeneration = Number(generation || 9);
  const records = [...(move?.generations || [])].sort((left, right) => left.generation - right.generation);
  if (records.length === 0) {
    return undefined;
  }

  const exact = records.find((record) => record.generation === targetGeneration);
  if (exact) {
    return exact;
  }

  const previous = [...records].reverse().find((record) => record.generation <= targetGeneration);
  return previous || records[records.length - 1];
}

function applyMoveToDamage(move, generation) {
  const record = resolveMoveGenerationRecord(move, generation);
  state.damage.moveId = move?.slug || move?.id || "";
  state.damage.moveName = move?.nameZh || "";
  state.damage.moveType = record?.type || move?.type || "";
  state.damage.category = record?.category || move?.category || "special";
  state.damage.power = record?.power ?? move?.power ?? 0;
  state.damage.accuracy = record?.accuracy || move?.accuracy || "—";
  state.damage.moveEffectSummary = record?.effectSummary || move?.effectSummary || "";
}

function buildPokemonGenerationOptions(detail) {
  const values = new Set();
  for (const generation of detail.generations || []) values.add(Number(generation));
  for (const generation of detail.generationAvailability || []) values.add(Number(generation.generation));
  for (const record of detail.generationRecords || []) values.add(Number(record.generation));
  return [...values].filter(Boolean).sort((left, right) => left - right);
}

function resolvePokemonDetailGeneration(detail) {
  const options = buildPokemonGenerationOptions(detail);
  if (options.length === 0) {
    return undefined;
  }

  const requested = Number(state.pokedex.detailGeneration || state.pokedex.generation || 0);
  if (requested && options.includes(requested)) {
    return requested;
  }

  return options[options.length - 1];
}

function getPokemonGenerationRecordForDetail(detail, generation) {
  const records = [...(detail.generationRecords || [])].sort((left, right) => left.generation - right.generation);
  if (!generation || records.length === 0) {
    return undefined;
  }

  return records.find((record) => record.generation === generation) ||
    [...records].reverse().find((record) => record.generation <= generation) ||
    records[records.length - 1];
}

function buildPokemonFormOptions(detail) {
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

function resolvePokemonDisplayVariant(detail) {
  const generation = resolvePokemonDetailGeneration(detail);
  const generationRecord = getPokemonGenerationRecordForDetail(detail, generation);
  const formOptions = buildPokemonFormOptions(detail);
  const selectedForm = formOptions.find((form) => form.id === state.pokedex.detailForm) || formOptions[0];
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
    generationOptions: buildPokemonGenerationOptions(detail),
    stats,
    images: selectedForm.images || detail.images,
    primaryType,
    secondaryType,
    abilityText,
    hiddenAbilityText: generationRecord?.hiddenAbilityId || detail.hiddenAbility || "无"
  };
}

function renderPokemonDetail(detail) {
  const display = resolvePokemonDisplayVariant(detail);
  const stats = display.stats || {};
  const generations = detail.generationAvailability || [];

  return `
    <div class="detail-title-row">
      <div>
        <div class="muted">#${String(detail.dexNumber).padStart(4, "0")}</div>
        <h2>${escapeHtml(detail.nameZh)}</h2>
        <div class="muted">${escapeHtml(detail.nameEn || "")}</div>
      </div>
      <button data-add-team>加入队伍</button>
    </div>
    <div class="variant-toolbar">
      <label>
        <span>世代资料</span>
        <select id="pokemon-detail-generation">
          ${display.generationOptions.map((generation) => `<option value="${generation}" ${String(display.generation) === String(generation) ? "selected" : ""}>第 ${generation} 世代</option>`).join("") || `<option value="">暂无世代记录</option>`}
        </select>
      </label>
      <label>
        <span>形态</span>
        <select id="pokemon-detail-form">
          ${display.formOptions.map((form) => `<option value="${escapeHtml(form.id)}" ${display.form.id === form.id ? "selected" : ""}>${escapeHtml(form.nameZh)}${form.isMega ? " · 超级进化" : ""}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="media-layout">
      ${renderImageViewer(display.images, state.pokedex.imageMode)}
      <div class="subpanel">
        <strong>${escapeHtml(display.form.nameZh)}${display.generation ? ` · 第 ${display.generation} 世代` : ""}</strong>
        <div class="panel-subtitle">切换世代会影响有世代差异的属性、特性与种族值；切换形态会展示超级进化、超极巨化等形态的图片和种族值。</div>
        <div class="forms-grid" style="margin-top: 14px;">
          ${display.formOptions.map((form) => `<span class="pill ${display.form.id === form.id ? "active-pill" : ""}">${escapeHtml(form.nameZh)}${form.isMega ? " · 超级进化" : ""}</span>`).join("")}
        </div>
      </div>
    </div>
    <div class="types" style="margin-top: 16px;">
      ${typeChip(display.primaryType)}
      ${typeChip(display.secondaryType)}
    </div>
    <div class="meta-grid">
      <div class="meta-card"><strong>分类</strong><div>${escapeHtml(detail.category || "未解析")}</div></div>
      <div class="meta-card"><strong>特性</strong><div>${escapeHtml(display.abilityText || "未解析")}</div></div>
      <div class="meta-card"><strong>隐藏特性</strong><div>${escapeHtml(display.hiddenAbilityText)}</div></div>
      <div class="meta-card"><strong>捕获率</strong><div>${escapeHtml(detail.catchRate || "未解析")}</div></div>
      <div class="meta-card"><strong>身高 / 体重</strong><div>${escapeHtml(detail.heightM || "?")} m / ${escapeHtml(detail.weightKg || "?")} kg</div></div>
      <div class="meta-card"><strong>图鉴颜色</strong><div>${escapeHtml(detail.color || "未解析")}</div></div>
    </div>
    <div class="subpanel" style="margin-top: 16px;">
      <strong>种族值${display.form.id !== "base" ? ` · ${escapeHtml(display.form.nameZh)}` : ""}${display.generation ? ` · 第 ${display.generation} 世代` : ""}</strong>
      <div class="stat-grid">
        ${STAT_KEYS.map((key) => `
          <div class="stat-row">
            <span>${key.toUpperCase()}</span>
            <div class="stat-bar"><div class="stat-fill" style="width:${Math.min(((stats[key] || 0) / 180) * 100, 100)}%"></div></div>
            <strong>${stats[key] || "-"}</strong>
          </div>
        `).join("")}
      </div>
    </div>
    <div class="subpanel" style="margin-top: 16px;">
      <strong>形态资料</strong>
      <div class="forms-grid">
        ${display.formOptions.map((form) => `
          <div class="form-card">
            ${form.images?.official?.url ? `<img src="${escapeHtml(form.images.official.url)}" alt="${escapeHtml(form.images.official.alt || form.nameZh)}" class="mini-image" />` : ""}
            <div><strong>${escapeHtml(form.nameZh)}</strong></div>
            <div class="muted">${escapeHtml([form.primaryType, form.secondaryType].filter(Boolean).join(" / ") || "类型未记录")}</div>
            <div class="muted">${escapeHtml((form.abilityIds || []).join(" / ") || "特性未记录")}</div>
            ${form.baseStats ? `<div class="muted">种族值：HP ${form.baseStats.hp} / ATK ${form.baseStats.atk} / DEF ${form.baseStats.def} / SPA ${form.baseStats.spa} / SPD ${form.baseStats.spd} / SPE ${form.baseStats.spe}</div>` : ""}
          </div>
        `).join("")}
      </div>
    </div>
    <div class="subpanel" style="margin-top: 16px;">
      <strong>世代与地区图鉴</strong>
      <div class="generation-grid">
        ${generations.map((generation) => `
          <span class="pill">第 ${generation.generation} 世代 · ${escapeHtml((generation.regions || []).map((region) => `${region.region}${region.dexNumber ? ` #${region.dexNumber}` : ""}`).join(" / ") || "可用")}</span>
        `).join("") || `<span class="pill">暂无世代记录</span>`}
      </div>
    </div>
    <div class="subpanel" style="margin-top: 16px;">
      <strong>按世代记录</strong>
      <div class="generation-card-grid">
        ${renderPokemonGenerationCards(detail)}
      </div>
    </div>
  `;
}

async function renderPokedex() {
  const params = new URLSearchParams();
  if (state.pokedex.query) params.set("q", state.pokedex.query);
  if (state.pokedex.type) params.set("type", state.pokedex.type);
  if (state.pokedex.generation) params.set("generation", state.pokedex.generation);

  const list = (await api(`/pokemon?${params.toString()}`)).data;
  const families = buildEvolutionFamilies(list);
  const selectedIsVisible = list.some((pokemon) =>
    pokemon.id === state.pokedex.selected || pokemon.slug === state.pokedex.selected
  );
  if ((!state.pokedex.selected || !selectedIsVisible) && list[0]) {
    state.pokedex.selected = list[0].slug || list[0].id;
    state.pokedex.detailForm = "base";
    state.pokedex.detailGeneration = "";
  } else if (!list[0]) {
    state.pokedex.selected = null;
  }

  const selectedId = state.pokedex.selected;
  const detail = selectedId ? (await api(`/pokemon/${encodeURIComponent(selectedId)}`)).data : null;

  app.innerHTML = `
    <section class="view-grid pokedex-layout">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">全国图鉴</h2>
            <p class="panel-subtitle">按关键字、属性和世代过滤本地资料；同一进化链会合并到同一张卡片展示。</p>
          </div>
          <span class="chip">${families.length} 条进化链 / ${list.length} 只宝可梦</span>
        </div>
        <div class="toolbar">
          <div class="toolbar-row">
            <input id="pokemon-query" placeholder="搜索中文 / 英文 / 日文名" value="${escapeHtml(state.pokedex.query)}" />
          </div>
          <div class="toolbar-row">
            <select id="pokemon-type">
              <option value="">全部属性</option>
              ${typeOptions.map((type) => `<option value="${type}" ${state.pokedex.type === type ? "selected" : ""}>${type}</option>`).join("")}
            </select>
            <select id="pokemon-generation">
              <option value="">全部世代</option>
              ${generationOptions.map((generation) => `<option value="${generation}" ${String(state.pokedex.generation) === String(generation) ? "selected" : ""}>第 ${generation} 世代</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="pokemon-list">
          ${families.map((family) => renderEvolutionFamilyCard(family, selectedId)).join("") || `<div class="muted">没有命中结果。</div>`}
        </div>
      </div>
      <div class="panel detail-panel">
        ${detail ? renderPokemonDetail(detail) : `<div class="detail-empty">请选择一只宝可梦查看详情。</div>`}
      </div>
    </section>
  `;

  bindSearchInput("#pokemon-query", (value) => {
    state.pokedex.query = value;
  }, renderPokedex);
  document.querySelector("#pokemon-type")?.addEventListener("change", async (event) => {
    state.pokedex.type = event.target.value;
    await renderPokedex();
  });
  document.querySelector("#pokemon-generation")?.addEventListener("change", async (event) => {
    state.pokedex.generation = event.target.value;
    await renderPokedex();
  });
  document.querySelectorAll("[data-pokemon]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.pokedex.selected = button.getAttribute("data-pokemon");
      state.pokedex.detailForm = "base";
      state.pokedex.detailGeneration = "";
      await renderPokedex();
    });
  });
  document.querySelector("#pokemon-detail-generation")?.addEventListener("change", async (event) => {
    state.pokedex.detailGeneration = event.target.value;
    await renderPokedex();
  });
  document.querySelector("#pokemon-detail-form")?.addEventListener("change", async (event) => {
    state.pokedex.detailForm = event.target.value;
    await renderPokedex();
  });
  document.querySelector("[data-add-team]")?.addEventListener("click", () => {
    if (!detail) return;
    addPokemonToTeam(detail);
    window.location.hash = "#/teams";
  });
  document.querySelectorAll("[data-image-mode]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.pokedex.imageMode = button.dataset.imageMode;
      await renderPokedex();
    });
  });
}

async function renderItems() {
  const items = (await api("/items")).data;
  const itemCategories = [...new Set(items.map((item) => item.category).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
  const query = state.items.query.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    const matchesQuery = !query ||
      [item.id, item.slug, item.nameZh, item.nameJa, item.nameEn, item.effectSummary]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    const matchesCategory = !state.items.category || item.category === state.items.category;
    return matchesQuery && matchesCategory;
  });
  const visibleItems = filteredItems.slice(0, state.items.visibleLimit);

  const selectedIsVisible = filteredItems.some((item) =>
    item.id === state.items.selected || item.slug === state.items.selected
  );
  if ((!state.items.selected || !selectedIsVisible) && filteredItems[0]) {
    state.items.selected = filteredItems[0].slug || filteredItems[0].id;
  } else if (!filteredItems[0]) {
    state.items.selected = null;
  }
  const detail = state.items.selected ? (await api(`/items/${encodeURIComponent(state.items.selected)}`)).data : null;

  app.innerHTML = `
    <section class="view-grid items-layout">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">道具资料</h2>
            <p class="panel-subtitle">当前展示本地已导入的真实道具详情，支持按名称、说明和分类筛选。</p>
          </div>
          <span class="chip">${filteredItems.length} / ${items.length} 个道具</span>
        </div>
        <div class="toolbar">
          <div class="toolbar-row">
            <input id="item-query" placeholder="搜索道具中文 / 日文 / 英文名或效果" value="${escapeHtml(state.items.query)}" />
          </div>
          <div class="toolbar-row">
            <select id="item-category">
              <option value="">全部分类</option>
              ${itemCategories.map((category) => `<option value="${escapeHtml(category)}" ${state.items.category === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="item-list">
          ${visibleItems.map((item) => `
            <button class="list-card secondary" data-item="${escapeHtml(item.slug || item.id)}">
              <div class="card-topline">
                <strong>${escapeHtml(item.nameZh)}</strong>
                <span class="chip">${escapeHtml(item.category || "未分类")}</span>
              </div>
              <div class="muted">${escapeHtml(item.nameEn || "")}</div>
              <div>${escapeHtml(item.effectSummary || "暂无说明")}</div>
            </button>
          `).join("") || `<div class="muted" style="padding: 0 24px 24px;">没有命中道具。</div>`}
        </div>
        ${visibleItems.length < filteredItems.length ? `
          <div class="toolbar-row" style="padding: 0 24px 24px;">
            <button id="load-more-items" class="secondary">再显示 ${Math.min(120, filteredItems.length - visibleItems.length)} 个道具</button>
          </div>
        ` : ""}
      </div>
      <div class="panel detail-panel">
        ${detail ? `
          <div class="detail-title-row">
            <div>
              <div class="muted">${escapeHtml(detail.category || "未分类")}</div>
              <h2>${escapeHtml(detail.nameZh)}</h2>
              <div class="muted">${escapeHtml(detail.nameEn || "")}</div>
            </div>
          </div>
          <div class="media-layout">
            ${detail.image?.url ? `<div class="media-viewer"><img src="${escapeHtml(detail.image.url)}" alt="${escapeHtml(detail.image.alt || detail.nameZh)}" class="entity-image item-image" /></div>` : `<div class="media-placeholder">暂无图片</div>`}
            <div class="subpanel">
              <strong>道具图片</strong>
              <p class="panel-subtitle">当前先展示导入数据中的主图，后续可补充不同世代外观或图标资源。</p>
            </div>
          </div>
          <div class="meta-grid">
            <div class="meta-card"><strong>日文名</strong><div>${escapeHtml(detail.nameJa || "未记录")}</div></div>
            <div class="meta-card"><strong>来源</strong><div>${escapeHtml(detail.source?.title || "本地标准化")}</div></div>
          </div>
          <div class="subpanel" style="margin-top: 16px;">
            <strong>效果说明</strong>
            <p class="panel-subtitle">${escapeHtml(detail.effectSummary || "暂无说明")}</p>
          </div>
        ` : `<div class="detail-empty">请选择一个道具查看详情。</div>`}
      </div>
    </section>
  `;

  bindSearchInput("#item-query", (value) => {
    state.items.query = value;
    state.items.visibleLimit = 120;
  }, renderItems);
  document.querySelector("#item-category")?.addEventListener("change", async (event) => {
    state.items.category = event.target.value;
    state.items.visibleLimit = 120;
    state.items.selected = null;
    await renderItems();
  });
  document.querySelector("#load-more-items")?.addEventListener("click", async () => {
    state.items.visibleLimit += 120;
    await renderItems();
  });
  document.querySelectorAll("[data-item]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.items.selected = button.getAttribute("data-item");
      await renderItems();
    });
  });
}

async function renderMoves() {
  const params = new URLSearchParams();
  if (state.moves.query) params.set("q", state.moves.query);
  if (state.moves.type) params.set("type", state.moves.type);
  if (state.moves.generation) params.set("generation", state.moves.generation);

  const moves = (await api(`/moves?${params.toString()}`)).data;
  const selectedIsVisible = moves.some((move) =>
    move.id === state.moves.selected || move.slug === state.moves.selected
  );
  if ((!state.moves.selected || !selectedIsVisible) && moves[0]) {
    state.moves.selected = moves[0].slug || moves[0].id;
  } else if (!moves[0]) {
    state.moves.selected = null;
  }
  const detail = state.moves.selected ? (await api(`/moves/${encodeURIComponent(state.moves.selected)}`)).data : null;

  app.innerHTML = `
    <section class="view-grid items-layout">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">招式资料</h2>
            <p class="panel-subtitle">支持按关键字、属性和世代检索，并查看不同世代的威力、PP 和效果差异。</p>
          </div>
          <span class="chip">${moves.length} 个招式</span>
        </div>
        <div class="toolbar">
          <div class="toolbar-row">
            <input id="move-query" placeholder="搜索招式名" value="${escapeHtml(state.moves.query)}" />
          </div>
          <div class="toolbar-row">
            <select id="move-type">
              <option value="">全部属性</option>
              ${ALL_TYPE_OPTIONS.map((type) => `<option value="${type}" ${state.moves.type === type ? "selected" : ""}>${type}</option>`).join("")}
            </select>
            <select id="move-generation">
              <option value="">全部世代</option>
              ${generationOptions.map((generation) => `<option value="${generation}" ${String(state.moves.generation) === String(generation) ? "selected" : ""}>第 ${generation} 世代</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="item-list">
          ${moves.map((move) => `
            <button class="list-card secondary" data-move="${escapeHtml(move.slug || move.id)}">
              <div class="card-topline">
                <strong>${escapeHtml(move.nameZh)}</strong>
                <span class="chip">${escapeHtml(move.type || "未知")} · ${escapeHtml(move.category || "未分类")}</span>
              </div>
              <div class="muted">${escapeHtml(move.nameEn || "")}</div>
              <div>${escapeHtml(move.effectSummary || "暂无说明")}</div>
            </button>
          `).join("")}
        </div>
      </div>
      <div class="panel detail-panel">
        ${detail ? `
          <div class="detail-title-row">
            <div>
              <div class="muted">${escapeHtml(detail.type || "未知")} · ${escapeHtml(detail.category || "未分类")}</div>
              <h2>${escapeHtml(detail.nameZh)}</h2>
              <div class="muted">${escapeHtml(detail.nameEn || "")}</div>
            </div>
          </div>
          <div class="media-layout">
            ${detail.image?.url ? `<div class="media-viewer"><img src="${escapeHtml(detail.image.url)}" alt="${escapeHtml(detail.image.alt || detail.nameZh)}" class="entity-image item-image" /></div>` : `<div class="media-placeholder">暂无图片</div>`}
            <div class="subpanel">
              <strong>当前世代前台摘要</strong>
              <div class="info-stack">
                <div>威力：${escapeHtml(detail.power ?? "-")}</div>
                <div>命中：${escapeHtml(detail.accuracy || "-")}</div>
                <div>PP：${escapeHtml(detail.pp ?? "-")}</div>
                <div>${escapeHtml(detail.effectSummary || "暂无说明")}</div>
              </div>
            </div>
          </div>
          <div class="subpanel" style="margin-top: 16px;">
            <strong>按世代效果</strong>
            <div class="generation-card-grid">
              ${renderMoveGenerationCards(detail)}
            </div>
          </div>
        ` : `<div class="detail-empty">请选择一个招式查看详情。</div>`}
      </div>
    </section>
  `;

  bindSearchInput("#move-query", (value) => {
    state.moves.query = value;
  }, renderMoves);
  document.querySelector("#move-type")?.addEventListener("change", async (event) => {
    state.moves.type = event.target.value;
    await renderMoves();
  });
  document.querySelector("#move-generation")?.addEventListener("change", async (event) => {
    state.moves.generation = event.target.value;
    await renderMoves();
  });
  document.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.moves.selected = button.getAttribute("data-move");
      await renderMoves();
    });
  });
}

async function renderAbilities() {
  const params = new URLSearchParams();
  if (state.abilities.query) params.set("q", state.abilities.query);
  if (state.abilities.generation) params.set("generation", state.abilities.generation);

  const abilities = (await api(`/abilities?${params.toString()}`)).data;
  const selectedIsVisible = abilities.some((ability) =>
    ability.id === state.abilities.selected || ability.slug === state.abilities.selected
  );
  if ((!state.abilities.selected || !selectedIsVisible) && abilities[0]) {
    state.abilities.selected = abilities[0].slug || abilities[0].id;
  } else if (!abilities[0]) {
    state.abilities.selected = null;
  }
  const detail = state.abilities.selected ? (await api(`/abilities/${encodeURIComponent(state.abilities.selected)}`)).data : null;

  app.innerHTML = `
    <section class="view-grid items-layout">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">特性资料</h2>
            <p class="panel-subtitle">支持按关键字和世代检索，并查看不同世代的效果说明差异。</p>
          </div>
          <span class="chip">${abilities.length} 个特性</span>
        </div>
        <div class="toolbar">
          <div class="toolbar-row">
            <input id="ability-query" placeholder="搜索特性名" value="${escapeHtml(state.abilities.query)}" />
          </div>
          <div class="toolbar-row">
            <select id="ability-generation">
              <option value="">全部世代</option>
              ${generationOptions.map((generation) => `<option value="${generation}" ${String(state.abilities.generation) === String(generation) ? "selected" : ""}>第 ${generation} 世代</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="item-list">
          ${abilities.map((ability) => `
            <button class="list-card secondary" data-ability="${escapeHtml(ability.slug || ability.id)}">
              <div class="card-topline">
                <strong>${escapeHtml(ability.nameZh)}</strong>
                <span class="chip">${escapeHtml(ability.nameEn || "")}</span>
              </div>
              <div>${escapeHtml(ability.effectSummary || "暂无说明")}</div>
            </button>
          `).join("")}
        </div>
      </div>
      <div class="panel detail-panel">
        ${detail ? `
          <div class="detail-title-row">
            <div>
              <div class="muted">${escapeHtml(detail.nameJa || "")}</div>
              <h2>${escapeHtml(detail.nameZh)}</h2>
              <div class="muted">${escapeHtml(detail.nameEn || "")}</div>
            </div>
          </div>
          <div class="media-layout">
            ${detail.image?.url ? `<div class="media-viewer"><img src="${escapeHtml(detail.image.url)}" alt="${escapeHtml(detail.image.alt || detail.nameZh)}" class="entity-image item-image" /></div>` : `<div class="media-placeholder">暂无图片</div>`}
            <div class="subpanel">
              <strong>当前摘要</strong>
              <div class="info-stack">
                <div>${escapeHtml(detail.effectSummary || "暂无说明")}</div>
              </div>
            </div>
          </div>
          <div class="subpanel" style="margin-top: 16px;">
            <strong>按世代效果</strong>
            <div class="generation-card-grid">
              ${renderAbilityGenerationCards(detail)}
            </div>
          </div>
        ` : `<div class="detail-empty">请选择一个特性查看详情。</div>`}
      </div>
    </section>
  `;

  bindSearchInput("#ability-query", (value) => {
    state.abilities.query = value;
  }, renderAbilities);
  document.querySelector("#ability-generation")?.addEventListener("change", async (event) => {
    state.abilities.generation = event.target.value;
    await renderAbilities();
  });
  document.querySelectorAll("[data-ability]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.abilities.selected = button.getAttribute("data-ability");
      await renderAbilities();
    });
  });
}

function renderStatInputs(kind, slotIndex, stats) {
  return `
    <div class="stat-input-grid">
      ${STAT_KEYS.map((key) => `
        <label class="mini-field">
          <span>${key.toUpperCase()}</span>
          <input
            type="number"
            min="0"
            max="${kind === "ivs" ? 31 : 252}"
            data-stat-kind="${kind}"
            data-stat-key="${key}"
            data-slot="${slotIndex}"
            value="${escapeHtml(stats?.[key] ?? (kind === "ivs" ? 31 : 0))}"
          />
        </label>
      `).join("")}
    </div>
  `;
}

async function renderTeams() {
  const [teams, pokemonList, items] = await Promise.all([
    api("/teams").then((result) => result.data),
    api("/pokemon").then((result) => result.data),
    api("/items").then((result) => result.data)
  ]);
  state.teams.saved = teams;

  const slots = getDraftSlots();

  app.innerHTML = `
    <section class="view-grid teams-layout">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">我的队伍</h2>
            <p class="panel-subtitle">现在已经支持 6 个位置的宝可梦编辑、性格、招式、个体值和努力值输入。</p>
          </div>
          ${state.teams.id ? `<span class="chip">编辑中：${escapeHtml(state.teams.name || state.teams.id)}</span>` : `<span class="chip">新建队伍</span>`}
        </div>
        <div class="team-builder">
          <div class="team-header-grid">
            <input id="team-name" placeholder="队伍名称" value="${escapeHtml(state.teams.name)}" />
            <select id="team-format">
              <option value="singles" ${state.teams.format === "singles" ? "selected" : ""}>单打</option>
              <option value="doubles" ${state.teams.format === "doubles" ? "selected" : ""}>双打</option>
            </select>
          </div>

          <datalist id="pokemon-options">
            ${pokemonList.map((pokemon) => `<option value="${escapeHtml(pokemon.slug || pokemon.id)}">${escapeHtml(pokemon.nameZh)} / ${escapeHtml(pokemon.nameEn || "")}</option>`).join("")}
          </datalist>
          <datalist id="item-options">
            ${items.map((item) => `<option value="${escapeHtml(item.slug || item.id)}">${escapeHtml(item.nameZh)}</option>`).join("")}
          </datalist>

          <div class="team-slot-grid">
            ${slots.map((member, index) => `
              <section class="team-member-editor" data-member-slot="${index}">
                <div class="member-topline">
                  <strong>位置 ${index + 1}</strong>
                  <button class="secondary compact-button" data-clear-slot="${index}">清空该位</button>
                </div>
                <div class="member-grid">
                  <label>
                    <span>宝可梦</span>
                    <input list="pokemon-options" data-member-field="pokemonId" data-slot="${index}" value="${escapeHtml(member.pokemonId || "")}" placeholder="如：皮卡丘" />
                  </label>
                  <label>
                    <span>显示名</span>
                    <input data-member-field="nameZh" data-slot="${index}" value="${escapeHtml(member.nameZh || "")}" placeholder="队伍里显示的名字" />
                  </label>
                  <label>
                    <span>等级</span>
                    <input type="number" min="1" max="100" data-member-field="level" data-slot="${index}" value="${escapeHtml(member.level || 50)}" />
                  </label>
                  <label>
                    <span>性格</span>
                    <select data-member-field="nature" data-slot="${index}">
                      ${NATURE_OPTIONS.map((nature) => `<option value="${nature}" ${member.nature === nature ? "selected" : ""}>${nature}</option>`).join("")}
                    </select>
                  </label>
                  <label>
                    <span>道具</span>
                    <input list="item-options" data-member-field="itemId" data-slot="${index}" value="${escapeHtml(member.itemId || "")}" placeholder="如：气势披带" />
                  </label>
                  <label>
                    <span>特性</span>
                    <input data-member-field="abilityId" data-slot="${index}" value="${escapeHtml(member.abilityId || "")}" placeholder="如：静电" />
                  </label>
                </div>
                <div class="move-grid">
                  ${[0, 1, 2, 3].map((moveIndex) => `
                    <label>
                      <span>招式 ${moveIndex + 1}</span>
                      <input data-move-index="${moveIndex}" data-slot="${index}" value="${escapeHtml(member.moves?.[moveIndex] || "")}" placeholder="输入招式名" />
                    </label>
                  `).join("")}
                </div>
                <details class="stats-details">
                  <summary>个体值 / 努力值</summary>
                  <div class="stats-editor">
                    <div>
                      <strong class="section-label">个体值 IV</strong>
                      ${renderStatInputs("ivs", index, member.ivs)}
                    </div>
                    <div>
                      <strong class="section-label">努力值 EV</strong>
                      ${renderStatInputs("evs", index, member.evs)}
                    </div>
                  </div>
                </details>
              </section>
            `).join("")}
          </div>

          <div class="toolbar-row">
            <button id="save-team">保存队伍</button>
            <button id="new-team" class="secondary">新建草稿</button>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">已保存队伍</h2>
            <p class="panel-subtitle">点击“载入编辑”可以继续修改并覆盖保存。</p>
          </div>
          <span class="chip">${teams.length} 支队伍</span>
        </div>
        <div class="team-list">
          ${teams.map((team) => `
            <div class="list-card">
              <div class="card-topline">
                <strong>${escapeHtml(team.name)}</strong>
                <span class="chip">${escapeHtml(team.format)}</span>
              </div>
              <div class="muted">${(team.members || []).length} / 6 成员</div>
              <div class="forms-grid">
                ${(team.members || []).map((member) => `<span class="pill">${escapeHtml(member.pokemonId)}</span>`).join("") || `<span class="muted">暂无成员</span>`}
              </div>
              <div class="toolbar-row">
                <button class="secondary compact-button" data-load-team="${escapeHtml(team.id)}">载入编辑</button>
              </div>
            </div>
          `).join("") || `<div class="muted" style="padding: 0 24px 24px;">还没有保存的队伍。</div>`}
        </div>
      </div>
    </section>
  `;

  document.querySelector("#team-name")?.addEventListener("input", (event) => {
    state.teams.name = event.target.value;
  });

  document.querySelector("#team-format")?.addEventListener("change", (event) => {
    state.teams.format = event.target.value;
  });

  document.querySelector("#new-team")?.addEventListener("click", async () => {
    clearDraft();
    await renderTeams();
  });

  document.querySelectorAll("[data-member-field]").forEach((element) => {
    element.addEventListener("input", (event) => {
      const slot = Number(event.target.dataset.slot);
      const field = event.target.dataset.memberField;
      const draft = { ...getDraftSlots()[slot] };
      draft[field] = field === "level" ? Number(event.target.value || 50) : event.target.value;
      if (field === "pokemonId" && !draft.nameZh) {
        draft.nameZh = event.target.value;
      }
      setDraftMemberAt(slot, draft);
    });
  });

  document.querySelectorAll("[data-move-index]").forEach((element) => {
    element.addEventListener("input", (event) => {
      const slot = Number(event.target.dataset.slot);
      const moveIndex = Number(event.target.dataset.moveIndex);
      const draft = { ...getDraftSlots()[slot], moves: [...getDraftSlots()[slot].moves] };
      draft.moves[moveIndex] = event.target.value;
      setDraftMemberAt(slot, draft);
    });
  });

  document.querySelectorAll("[data-stat-kind]").forEach((element) => {
    element.addEventListener("input", (event) => {
      const slot = Number(event.target.dataset.slot);
      const kind = event.target.dataset.statKind;
      const key = event.target.dataset.statKey;
      const draft = { ...getDraftSlots()[slot] };
      draft[kind] = { ...draft[kind], [key]: Number(event.target.value || 0) };
      setDraftMemberAt(slot, draft);
    });
  });

  document.querySelectorAll("[data-clear-slot]").forEach((button) => {
    button.addEventListener("click", async () => {
      setDraftMemberAt(Number(button.dataset.clearSlot), createDraftMember());
      await renderTeams();
    });
  });

  document.querySelectorAll("[data-load-team]").forEach((button) => {
    button.addEventListener("click", async () => {
      const team = state.teams.saved.find((item) => item.id === button.dataset.loadTeam);
      if (!team) return;
      loadSavedTeam(team);
      await renderTeams();
    });
  });

  document.querySelector("#save-team")?.addEventListener("click", async () => {
    const members = getDraftSlots()
      .filter((member) => member.pokemonId)
      .map((member, index) => ({
        slot: index + 1,
        pokemonId: member.pokemonId,
        nameZh: member.nameZh,
        level: Number(member.level || 50),
        itemId: member.itemId || undefined,
        abilityId: member.abilityId || undefined,
        nature: member.nature || undefined,
        moves: (member.moves || []).filter(Boolean),
        ivs: { ...createDefaultStats("iv"), ...(member.ivs || {}) },
        evs: { ...createDefaultStats("ev"), ...(member.evs || {}) }
      }));

    if (members.length === 0) {
      window.alert("请先至少填写一只宝可梦。");
      return;
    }

    const saved = await api("/teams", {
      method: "POST",
      body: JSON.stringify({
        id: state.teams.id || undefined,
        name: state.teams.name || "新队伍",
        format: state.teams.format,
        members
      })
    });

    state.teams.id = saved.data.id;
    state.teams.name = saved.data.name;
    await renderTeams();
  });
}

function renderDerivedStatSummary(title, battleMember, category) {
  if (!battleMember?.detail || !battleMember?.derivedStats) {
    return `<div class="subpanel"><strong>${title}</strong><p class="panel-subtitle">缺少宝可梦详细数据，暂时无法计算最终能力值。</p></div>`;
  }

  const offensiveKey = category === "physical" ? "atk" : "spa";
  const defensiveKey = category === "physical" ? "def" : "spd";

  return `
    <div class="subpanel">
      <strong>${title}</strong>
      <div class="panel-subtitle">${escapeHtml(battleMember.member.nameZh || battleMember.detail.nameZh)} · Lv.${escapeHtml(battleMember.member.level || 50)}</div>
      <div class="forms-grid" style="margin-top: 12px;">
        ${typeChip(battleMember.detail.primaryType)}
        ${typeChip(battleMember.detail.secondaryType)}
      </div>
      <div class="stat-grid">
        ${STAT_KEYS.map((key) => `
          <div class="stat-row">
            <span>${key.toUpperCase()}</span>
            <div class="stat-bar"><div class="stat-fill" style="width:${Math.min(((battleMember.derivedStats[key] || 0) / 220) * 100, 100)}%"></div></div>
            <strong>${battleMember.derivedStats[key] || "-"}</strong>
          </div>
        `).join("")}
      </div>
      <div class="result-note">
        ${title === "攻击方"
          ? `当前用于计算的攻击数值：<strong>${battleMember.derivedStats[offensiveKey] || "-"}</strong>`
          : `当前用于计算的防御数值：<strong>${battleMember.derivedStats[defensiveKey] || "-"}</strong>`}
      </div>
    </div>
  `;
}

function renderDamageMemberEditor(title, sideKey, side, detail, teamMembers, pokemonOptionsHtml) {
  const importButtons = teamMembers.length > 0
    ? `
      <div class="import-strip">
        ${teamMembers.map((entry) => `
          <button class="secondary compact-button" data-import-side="${sideKey}" data-import-slot="${entry.slot}">
            从队伍位置 ${entry.slot + 1} 导入 ${escapeHtml(entry.member.nameZh || entry.member.pokemonId)}
          </button>
        `).join("")}
      </div>
    `
    : `<p class="panel-subtitle">当前没有队伍草稿，直接手动选择宝可梦即可。</p>`;

  return `
    <section class="team-member-editor">
      <div class="member-topline">
        <strong>${title}</strong>
        <span class="chip">${detail?.nameZh ? `已选择 ${escapeHtml(detail.nameZh)}` : "手动配置中"}</span>
      </div>
      ${importButtons}
      <label>
        <span>宝可梦</span>
        <input list="damage-pokemon-options" data-damage-field="pokemonId" data-side="${sideKey}" value="${escapeHtml(side.pokemonId || "")}" placeholder="如：皮卡丘" />
      </label>
      <div class="member-grid" style="margin-top: 12px;">
        <label>
          <span>显示名</span>
          <input data-damage-field="nameZh" data-side="${sideKey}" value="${escapeHtml(side.nameZh || "")}" placeholder="显示名称" />
        </label>
        <label>
          <span>等级</span>
          <input type="number" min="1" max="100" data-damage-field="level" data-side="${sideKey}" value="${escapeHtml(side.level || 50)}" />
        </label>
        <label>
          <span>性格</span>
          <select data-damage-field="nature" data-side="${sideKey}">
            ${NATURE_OPTIONS.map((nature) => `<option value="${nature}" ${side.nature === nature ? "selected" : ""}>${nature}</option>`).join("")}
          </select>
        </label>
      </div>
      <details class="stats-details" open>
        <summary>个体值 / 努力值</summary>
        <div class="stats-editor">
          <div>
            <strong class="section-label">个体值 IV</strong>
            ${renderStatInputs("ivs", sideKey, side.ivs)}
          </div>
          <div>
            <strong class="section-label">努力值 EV</strong>
            ${renderStatInputs("evs", sideKey, side.evs)}
          </div>
        </div>
      </details>
    </section>
  `;
}

async function runDamageCalculation(attacker, defender) {
  if (!attacker?.derivedStats || !defender?.derivedStats) {
    window.alert("当前选中的宝可梦缺少可用种族值，暂时无法计算。");
    return;
  }

  const category = state.damage.category;
  const attackStat = category === "physical" ? attacker.derivedStats.atk : attacker.derivedStats.spa;
  const defenseStat = category === "physical" ? defender.derivedStats.def : defender.derivedStats.spd;
  const attackerTypes = [attacker.detail.primaryType, attacker.detail.secondaryType].filter(Boolean);
  const stab = attackerTypes.includes(state.damage.moveType) ? 1.5 : 1;

  const result = await api("/battle/damage", {
    method: "POST",
    body: JSON.stringify({
      level: Number(attacker.member.level || 50),
      power: Number(state.damage.power || 0),
      attack: Number(attackStat || 1),
      defense: Number(defenseStat || 1),
      stab,
      typeEffectiveness: Number(state.damage.typeEffectiveness || 1),
      weather: Number(state.damage.weather || 1),
      critical: state.damage.critical ? 1.5 : 1,
      other: Number(state.damage.other || 1)
    })
  });

  state.damage.result = {
    ...result.data,
    stab,
    attackStat,
    defenseStat,
    attackerName: attacker.member.nameZh || attacker.detail.nameZh,
    defenderName: defender.member.nameZh || defender.detail.nameZh
  };
}

async function renderDamage() {
  const [pokemonList, allMoves, attacker, defender] = await Promise.all([
    api("/pokemon").then((result) => result.data),
    api("/moves").then((result) => result.data),
    hydrateDamageSide(state.damage.attacker),
    hydrateDamageSide(state.damage.defender)
  ]);
  const teamMembers = getDraftSlots()
    .map((member, slot) => ({ member, slot }))
    .filter((entry) => entry.member.pokemonId);
  const pokemonOptionsHtml = pokemonList
    .map((pokemon) => `<option value="${escapeHtml(pokemon.slug || pokemon.id)}">${escapeHtml(pokemon.nameZh)} / ${escapeHtml(pokemon.nameEn || "")}</option>`)
    .join("");
  const learnableMoveState = getLearnableDamageMoves(attacker.detail, allMoves, state.damage.moveGeneration);
  const damageMoveOptions = learnableMoveState.moves;
  const attackerLearnsetEntries = learnableMoveState.learnsetEntries;
  const selectedMove = allMoves.find((move) => move.id === state.damage.moveId || move.slug === state.damage.moveId || move.nameZh === state.damage.moveName);
  const selectedMoveRecord = selectedMove ? resolveMoveGenerationRecord(selectedMove, state.damage.moveGeneration) : null;
  const selectedMoveIsLearnable = !selectedMove
    ? true
    : !attacker.detail || attackerLearnsetEntries.length === 0
      ? true
      : damageMoveOptions.some((move) => move.id === selectedMove.id);
  const attackerMoveButtons = (state.damage.attacker.moves || []).filter(Boolean);

  app.innerHTML = `
    <section class="view-grid damage-layout">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">伤害计算器</h2>
            <p class="panel-subtitle">现在可以独立配置攻击方和防守方，不需要先完成队伍构筑；如果你已经有队伍草稿，也可以一键导入。</p>
          </div>
          <span class="chip">${teamMembers.length > 0 ? `${teamMembers.length} 个队伍快捷导入` : "独立模式"}</span>
        </div>
        <div class="team-builder">
          <datalist id="damage-pokemon-options">
            ${pokemonOptionsHtml}
          </datalist>
          <div class="damage-side-grid">
            ${renderDamageMemberEditor("攻击方", "attacker", state.damage.attacker, attacker.detail, teamMembers, pokemonOptionsHtml)}
            ${renderDamageMemberEditor("防守方", "defender", state.damage.defender, defender.detail, teamMembers, pokemonOptionsHtml)}
          </div>
          <datalist id="damage-move-options">
            ${damageMoveOptions.map((move) => {
              const learnsetEntry = attackerLearnsetEntries.find((entry) => entry.moveId === move.id || entry.moveId === move.slug || entry.moveNameZh === move.nameZh);
              const learnsetDetail = learnsetEntry ? describeLearnsetEntry(learnsetEntry) : "";
              return `<option value="${escapeHtml(move.slug || move.id)}">${escapeHtml(move.nameZh)} / ${escapeHtml(learnsetDetail || move.type || "未知")} / ${escapeHtml(move.category || "未分类")}</option>`;
            }).join("")}
          </datalist>
          ${attacker.detail ? `
            <div class="subpanel damage-hint-panel">
              <strong>攻击方可学招式</strong>
              <div class="panel-subtitle">
                ${attackerLearnsetEntries.length > 0
                  ? `当前已按 ${escapeHtml(attacker.detail.nameZh)} 在第 ${escapeHtml(state.damage.moveGeneration)} 世代的可学招式表过滤，共 ${damageMoveOptions.length} 个候选招式。`
                  : `${escapeHtml(attacker.detail.nameZh)} 暂无第 ${escapeHtml(state.damage.moveGeneration)} 世代学招式记录，当前回退为显示全部招式。`}
              </div>
              ${attackerLearnsetEntries.length > 0 ? `
                <div class="import-strip learnset-strip">
                  ${attackerLearnsetEntries.map((entry) => `
                    <button class="secondary compact-button" data-learnset-move="${escapeHtml(entry.moveId)}">
                      ${escapeHtml(entry.moveNameZh || entry.moveId)}
                      ${describeLearnsetEntry(entry) ? ` · ${escapeHtml(describeLearnsetEntry(entry))}` : ""}
                    </button>
                  `).join("")}
                </div>
              ` : ""}
            </div>
          ` : `
            <p class="panel-subtitle">选择攻击方后，招式候选会自动收窄到该宝可梦在当前世代真正可学的招式。</p>
          `}
          ${attackerMoveButtons.length > 0 ? `
            <div class="import-strip">
              ${attackerMoveButtons.map((moveName) => `<button class="secondary compact-button" data-import-move="${escapeHtml(moveName)}">${escapeHtml(moveName)}</button>`).join("")}
            </div>
          ` : ""}
          <div class="damage-grid">
            <label>
              <span>招式名</span>
              <input id="damage-move-name" list="damage-move-options" value="${escapeHtml(state.damage.moveId || state.damage.moveName)}" placeholder="如：十万伏特" />
            </label>
            <label>
              <span>招式世代</span>
              <select id="damage-move-generation">
                ${generationOptions.map((generation) => `<option value="${generation}" ${String(state.damage.moveGeneration) === String(generation) ? "selected" : ""}>第 ${generation} 世代</option>`).join("")}
              </select>
            </label>
            <label>
              <span>招式属性</span>
              <select id="damage-move-type">
                ${ALL_TYPE_OPTIONS.map((type) => `<option value="${type}" ${state.damage.moveType === type ? "selected" : ""}>${type}</option>`).join("")}
              </select>
            </label>
            <label>
              <span>招式威力</span>
              <input id="damage-power" type="number" min="1" value="${escapeHtml(state.damage.power)}" />
            </label>
            <label>
              <span>分类</span>
              <select id="damage-category">
                <option value="physical" ${state.damage.category === "physical" ? "selected" : ""}>物理</option>
                <option value="special" ${state.damage.category === "special" ? "selected" : ""}>特殊</option>
              </select>
            </label>
            <label>
              <span>克制倍率</span>
              <select id="damage-effectiveness">
                ${[0, 0.25, 0.5, 1, 2, 4].map((value) => `<option value="${value}" ${Number(state.damage.typeEffectiveness) === value ? "selected" : ""}>${value}x</option>`).join("")}
              </select>
            </label>
            <label>
              <span>天气倍率</span>
              <select id="damage-weather">
                ${[0.5, 1, 1.5].map((value) => `<option value="${value}" ${Number(state.damage.weather) === value ? "selected" : ""}>${value}x</option>`).join("")}
              </select>
            </label>
            <label>
              <span>其他修正</span>
              <input id="damage-other" type="number" min="0" step="0.1" value="${escapeHtml(state.damage.other)}" />
            </label>
            <label class="checkbox-row">
              <input id="damage-critical" type="checkbox" ${state.damage.critical ? "checked" : ""} />
              <span>暴击</span>
            </label>
          </div>
          <div class="toolbar-row">
            <button id="run-damage">计算伤害</button>
            <button id="damage-reset" class="secondary">重置攻守双方</button>
          </div>
        </div>
      </div>

      <div class="panel detail-panel">
        ${renderDerivedStatSummary("攻击方", attacker, state.damage.category)}
        <div style="height: 12px;"></div>
        ${renderDerivedStatSummary("防守方", defender, state.damage.category)}
        <div style="height: 12px;"></div>
        <div class="subpanel">
          <strong>招式摘要</strong>
          ${selectedMove ? `
            <div class="media-layout compact-media">
              ${selectedMove.image?.url ? `<div class="media-viewer"><img src="${escapeHtml(selectedMove.image.url)}" alt="${escapeHtml(selectedMove.image.alt || selectedMove.nameZh)}" class="entity-image item-image" /></div>` : `<div class="media-placeholder">暂无图片</div>`}
              <div class="info-stack">
                <div><strong>${escapeHtml(selectedMove.nameZh)}</strong> · ${escapeHtml(selectedMove.nameEn || "")}</div>
                <div>当前世代：第 ${escapeHtml(state.damage.moveGeneration)} 世代</div>
                <div>属性：${escapeHtml(selectedMoveRecord?.type || selectedMove.type || state.damage.moveType || "未记录")}</div>
                <div>分类：${escapeHtml(selectedMoveRecord?.category || selectedMove.category || state.damage.category || "未记录")}</div>
                <div>威力：${escapeHtml(selectedMoveRecord?.power ?? selectedMove.power ?? state.damage.power ?? "-")}</div>
                <div>命中：${escapeHtml(selectedMoveRecord?.accuracy || selectedMove.accuracy || state.damage.accuracy || "-")}</div>
                <div>${escapeHtml(selectedMoveRecord?.effectSummary || selectedMove.effectSummary || state.damage.moveEffectSummary || "暂无说明")}</div>
                ${selectedMoveIsLearnable ? "" : `<div class="warning-note">当前攻击方在第 ${escapeHtml(state.damage.moveGeneration)} 世代的可学招式表中未找到这招。</div>`}
              </div>
            </div>
          ` : `<p class="panel-subtitle">选择一个招式后，这里会自动显示当前世代下的属性、分类、威力、命中和效果摘要。</p>`}
        </div>
        <div style="height: 12px;"></div>
        <div class="subpanel">
          <strong>试算结果</strong>
          ${state.damage.result ? `
            <div class="result-card">
              <div class="result-badge">${escapeHtml(state.damage.result.attackerName)} → ${escapeHtml(state.damage.result.defenderName)}</div>
              <h3>${escapeHtml(state.damage.moveName || "未命名招式")}</h3>
              <div class="result-grid">
                <div class="meta-card"><strong>最小伤害</strong><div>${escapeHtml(state.damage.result.min)}</div></div>
                <div class="meta-card"><strong>最大伤害</strong><div>${escapeHtml(state.damage.result.max)}</div></div>
                <div class="meta-card"><strong>平均伤害</strong><div>${escapeHtml(state.damage.result.average)}</div></div>
                <div class="meta-card"><strong>STAB</strong><div>${escapeHtml(state.damage.result.stab)}x</div></div>
              </div>
              <p class="panel-subtitle">
                当前计算使用攻击值 ${escapeHtml(state.damage.result.attackStat)}、防御值 ${escapeHtml(state.damage.result.defenseStat)}，
                并叠加克制倍率 ${escapeHtml(state.damage.typeEffectiveness)}x、天气倍率 ${escapeHtml(state.damage.weather)}x、其他修正 ${escapeHtml(state.damage.other)}x。
              </p>
            </div>
          ` : `<p class="panel-subtitle">填写参数后点击“计算伤害”，这里会显示最小值、最大值和平均值。</p>`}
        </div>
      </div>
    </section>
  `;

  const bindField = (selector, key, transform = (value) => value, rerender = false) => {
    document.querySelector(selector)?.addEventListener("input", (event) => {
      state.damage[key] = transform(event.target.type === "checkbox" ? event.target.checked : event.target.value);
      if (rerender) {
        renderDamage();
      }
    });
    document.querySelector(selector)?.addEventListener("change", (event) => {
      state.damage[key] = transform(event.target.type === "checkbox" ? event.target.checked : event.target.value);
      if (rerender) {
        renderDamage();
      }
    });
  };

  bindField("#damage-move-name", "moveName", String);
  bindField("#damage-move-type", "moveType", String);
  bindField("#damage-power", "power", Number);
  bindField("#damage-category", "category", String, true);
  bindField("#damage-effectiveness", "typeEffectiveness", Number);
  bindField("#damage-weather", "weather", Number);
  bindField("#damage-other", "other", Number);
  bindField("#damage-critical", "critical", Boolean);

  document.querySelector("#damage-move-name")?.addEventListener("change", async (event) => {
    const move = allMoves.find((item) =>
      item.id === event.target.value ||
      item.slug === event.target.value ||
      item.nameZh === event.target.value
    );
    if (move) {
      applyMoveToDamage(move, state.damage.moveGeneration);
      state.damage.result = null;
      await renderDamage();
    } else {
      state.damage.moveId = "";
    }
  });

  document.querySelector("#damage-move-generation")?.addEventListener("change", async (event) => {
    state.damage.moveGeneration = event.target.value;
    if (selectedMove) {
      applyMoveToDamage(selectedMove, event.target.value);
    }
    state.damage.result = null;
    await renderDamage();
  });

  document.querySelectorAll("[data-import-move]").forEach((button) => {
    button.addEventListener("click", async () => {
      const move = allMoves.find((item) => item.nameZh === button.dataset.importMove || item.slug === button.dataset.importMove);
      if (!move) return;
      applyMoveToDamage(move, state.damage.moveGeneration);
      state.damage.result = null;
      await renderDamage();
    });
  });

  document.querySelectorAll("[data-learnset-move]").forEach((button) => {
    button.addEventListener("click", async () => {
      const move = allMoves.find((item) => item.id === button.dataset.learnsetMove || item.slug === button.dataset.learnsetMove);
      if (!move) return;
      applyMoveToDamage(move, state.damage.moveGeneration);
      state.damage.result = null;
      await renderDamage();
    });
  });

  document.querySelectorAll("[data-damage-field]").forEach((element) => {
    const rerenderFields = new Set(["pokemonId", "level", "nature"]);
    const handler = async (event) => {
      const side = event.target.dataset.side;
      const field = event.target.dataset.damageField;
      const value = field === "level" ? Number(event.target.value || 50) : event.target.value;
      setDamageMemberField(side, field, value);
      if (field === "pokemonId" && !state.damage[side].nameZh) {
        setDamageMemberField(side, "nameZh", event.target.value);
      }
      if (rerenderFields.has(field) && event.type === "change") {
        state.damage.result = null;
        await renderDamage();
      }
    };

    element.addEventListener("input", handler);
    element.addEventListener("change", handler);
  });

  document.querySelectorAll("[data-stat-kind]").forEach((element) => {
    const handler = async (event) => {
      const side = event.target.dataset.slot;
      const kind = event.target.dataset.statKind;
      const key = event.target.dataset.statKey;
      setDamageMemberStat(side, kind, key, Number(event.target.value || 0));
      if (event.type === "change") {
        state.damage.result = null;
        await renderDamage();
      }
    };

    element.addEventListener("input", handler);
    element.addEventListener("change", handler);
  });

  document.querySelectorAll("[data-import-side]").forEach((button) => {
    button.addEventListener("click", async () => {
      loadTeamMemberToDamage(button.dataset.importSide, Number(button.dataset.importSlot));
      state.damage.result = null;
      await renderDamage();
    });
  });

  document.querySelector("#damage-reset")?.addEventListener("click", async () => {
    state.damage.attacker = createDraftMember();
    state.damage.defender = createDraftMember();
    state.damage.result = null;
    await renderDamage();
  });

  document.querySelector("#run-damage")?.addEventListener("click", async () => {
    state.damage.result = null;
    const currentAttacker = await hydrateDamageSide(state.damage.attacker);
    const currentDefender = await hydrateDamageSide(state.damage.defender);
    await runDamageCalculation(currentAttacker, currentDefender);
    await renderDamage();
  });
}

window.addEventListener("hashchange", render);
render();
