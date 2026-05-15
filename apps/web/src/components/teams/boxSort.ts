export const BOX_SORT_OPTIONS = [
  { value: "current", label: "当前顺序" },
  { value: "number", label: "按编号" },
];

type BoxConfigForSort = {
  configName?: unknown;
  nameZh?: unknown;
  formName?: unknown;
  formKey?: unknown;
  pokemonId?: unknown;
  formId?: unknown;
};

function normalizeBoxSearch(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function boxSearchText(config: BoxConfigForSort): string {
  return [
    config.configName,
    config.nameZh,
    config.formName,
    config.pokemonId,
  ].map(normalizeBoxSearch).join(" ");
}

function pokemonNumber(config: BoxConfigForSort): number {
  const number = Number(config.pokemonId);
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
}

function isDefaultForm(config: BoxConfigForSort): boolean {
  const formKey = normalizeBoxSearch(config.formKey);
  const formName = normalizeBoxSearch(config.formName);
  const nameZh = normalizeBoxSearch(config.nameZh);
  return !formKey || formKey === "default" || !formName || formName === nameZh;
}

function pokemonFormNumber(config: BoxConfigForSort): number {
  const number = Number(config.formId);
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
}

function pokemonFormLabel(config: BoxConfigForSort): string {
  return normalizeBoxSearch(config.formKey || config.formName || "");
}

function comparePokemonForm(a: BoxConfigForSort, b: BoxConfigForSort): number {
  const byDefault = Number(isDefaultForm(a)) - Number(isDefaultForm(b));
  if (byDefault !== 0) return -byDefault;

  const formIdA = pokemonFormNumber(a);
  const formIdB = pokemonFormNumber(b);
  if (formIdA !== formIdB) return formIdA - formIdB;

  return pokemonFormLabel(a).localeCompare(pokemonFormLabel(b), "zh-Hans", { numeric: true });
}

export function getDisplayedBoxConfigs<T extends BoxConfigForSort>(
  boxConfigs: T[],
  boxSearch: string,
  boxSortMode: string
): T[] {
  const query = normalizeBoxSearch(boxSearch);
  const indexed = boxConfigs.map((config, index) => ({ config, index }));
  const filtered = query
    ? indexed.filter(({ config }) => boxSearchText(config).includes(query))
    : indexed;

  if (boxSortMode === "number") {
    return [...filtered]
      .sort((a, b) => {
        const byNumber = pokemonNumber(a.config) - pokemonNumber(b.config);
        return byNumber || comparePokemonForm(a.config, b.config) || a.index - b.index;
      })
      .map(({ config }) => config);
  }

  return filtered.map(({ config }) => config);
}
