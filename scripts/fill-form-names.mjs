/**
 * 批量刷新 pokemon_forms.name_en / form_type / form_category。
 *
 * name_en 的中文形态映射规则来自
 * packages/crawler_py/localdex_crawler/form_name_rules.json，和 Python 爬虫写库阶段共用。
 */

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const calc = require("@fakedplains/smogon-calc");

const DB_PATH = resolve(import.meta.dirname, "../data/sqlite/localdex.sqlite");
const FORM_NAME_RULES_PATH = resolve(
  import.meta.dirname,
  "../packages/crawler_py/localdex_crawler/form_name_rules.json",
);
const FORM_NAME_RULES = JSON.parse(readFileSync(FORM_NAME_RULES_PATH, "utf8"));
const db = new DatabaseSync(DB_PATH, { open: true });

function normalizeIdentifier(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[’‘`]/g, "'")
    .trim()
    .toLowerCase()
    .replace(/[（）()・·･\s　_]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeSmogonName(value) {
  return String(value || "").normalize("NFKC").replace(/[’‘`]/g, "'").toLowerCase();
}

function normalizeFormLabelKey(value) {
  return String(value || "").normalize("NFKC").replace(/[’‘`]/g, "'").trim();
}

const FORM_TYPE_KW = FORM_NAME_RULES.formTypeKeywords;

function inferFormTypeFromLabel(label) {
  if (!label) return undefined;
  const megaRe = new RegExp(FORM_TYPE_KW.megaPatterns.join("|"), "i");
  const gmaxRe = new RegExp(FORM_TYPE_KW.gmaxPatterns.join("|"), "i");
  const hasMega = megaRe.test(label);
  const hasGmax = gmaxRe.test(label);

  for (const rule of FORM_TYPE_KW.postures) {
    if (label.includes(rule.keyword)) {
      return hasMega ? `${rule.value}-mega` : rule.value;
    }
  }
  for (const rule of FORM_TYPE_KW.simple) {
    const matched = rule.keywords.some((kw) => label.includes(kw)) ||
      (rule.exactMatch != null && label === rule.exactMatch);
    if (matched) {
      if (rule.gmaxValue && hasGmax) return rule.gmaxValue;
      if (rule.conditionalKeyword && label.includes(rule.conditionalKeyword)) return rule.conditionalValue;
      if (rule.megaValue && hasMega) return rule.megaValue;
      return rule.value;
    }
  }
  for (const rule of FORM_TYPE_KW.regions) {
    if (label.includes(rule.keyword)) return rule.value;
  }
  if (hasGmax) return "gmax";
  if (hasMega) {
    if (/[xXＸ]$/u.test(label)) return "mega-x";
    if (/[yYＹ]$/u.test(label)) return "mega-y";
    return "mega";
  }
  return undefined;
}

function deriveFormType(speciesNameEn, formNameEn, fallbackLabel, isDefault = false) {
  if (isDefault) return "default";
  const species = String(speciesNameEn || "").normalize("NFKC").trim();
  const formName = String(formNameEn || "").normalize("NFKC").trim();
  const speciesCompare = species.replace(/[''`]/g, "'");
  const formNameCompare = formName.replace(/[''`]/g, "'");
  if (speciesCompare && formNameCompare && formNameCompare !== speciesCompare) {
    const prefix = `${speciesCompare}-`;
    if (formNameCompare.startsWith(prefix)) {
      const suffix = normalizeIdentifier(formNameCompare.slice(prefix.length));
      if (suffix) return suffix;
    }
    const normalized = normalizeIdentifier(formNameCompare);
    if (normalized) return normalized;
  }
  const label = String(fallbackLabel || "").normalize("NFKC").trim();
  const inferred = inferFormTypeFromLabel(label);
  if (inferred) return inferred;
  return normalizeIdentifier(fallbackLabel) || "alternate";
}

function deriveFormCategory(formType, fallbackCategory) {
  const normalized = normalizeIdentifier(formType);
  if (normalized === "default") return "default";
  if (normalized.startsWith("mega") || normalized.endsWith("-mega")) return "mega";
  if (normalized === "gmax" || normalized === "gigantamax" || normalized.endsWith("-gmax")) return "gigantamax";
  for (const region of ["alola", "galar", "hisui", "paldea"]) {
    if (normalized.startsWith(region)) return `regional-${region}`;
  }
  return normalizeIdentifier(fallbackCategory) || "alternate";
}

const REGION_ZH_BY_FORM_TYPE = {
  alola: "阿罗拉",
  galar: "伽勒尔",
  hisui: "洗翠",
  paldea: "帕底亚",
};

function stripWrappingParens(value) {
  const text = String(value || "").trim();
  if (text.length >= 2 && "（(".includes(text[0]) && "）)".includes(text[text.length - 1])) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function canonicalFormNameZh(speciesNameZh, displayNameZh, formType, formCategory, isDefault = false) {
  const species = String(speciesNameZh || "").normalize("NFKC").trim();
  const display = String(displayNameZh || species).normalize("NFKC").trim();
  if (isDefault || !species || !display || display === species) return species || display;
  if (display.startsWith(`${species}(`) && display.endsWith(")")) return display;

  const normalizedType = normalizeIdentifier(formType);
  const normalizedCategory = normalizeIdentifier(formCategory);
  let regionZh = "";
  for (const [prefix, label] of Object.entries(REGION_ZH_BY_FORM_TYPE)) {
    if (normalizedType.startsWith(prefix) || normalizedCategory === `regional-${prefix}`) {
      regionZh = label;
      break;
    }
  }

  if (regionZh) {
    if (display.startsWith(`${regionZh}${species}`)) {
      const rest = stripWrappingParens(display.slice(regionZh.length + species.length)).replace(/^[・·･]/u, "");
      return `${species}(${regionZh}的样子${rest ? `・${rest}` : ""})`;
    }
    if (display.startsWith(`${regionZh}的样子`)) {
      const rest = stripWrappingParens(display.slice(`${regionZh}的样子`.length)).replace(/^[・·･]/u, "");
      return `${species}(${regionZh}的样子${rest ? `・${rest}` : ""})`;
    }
    if (display.startsWith(regionZh)) {
      const rest = stripWrappingParens(display.slice(regionZh.length)).replace(/^[・·･]/u, "");
      return `${species}(${regionZh}的样子${rest ? `・${rest}` : ""})`;
    }
  }

  if (display.startsWith(species)) {
    const rest = stripWrappingParens(display.slice(species.length));
    return rest ? `${species}(${rest})` : species;
  }

  return `${species}(${display})`;
}

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

const allSmogonNames = new Set();
const smogonNamesByNormalized = new Map();
for (let gen = 0; gen <= 9; gen++) {
  const species = calc.SPECIES[gen] || {};
  for (const name of Object.keys(species)) {
    allSmogonNames.add(name);
    smogonNamesByNormalized.set(normalizeSmogonName(name), name);
  }
}
console.log(`@smogon/calc 共有 ${allSmogonNames.size} 个物种名`);

function resolveSmogonName(candidate) {
  if (allSmogonNames.has(candidate)) return candidate;
  return smogonNamesByNormalized.get(normalizeSmogonName(candidate)) || null;
}

function lookupMappedValue(mapping, rawKey) {
  const normalized = normalizeFormLabelKey(rawKey);
  for (const [key, value] of Object.entries(mapping || {})) {
    if (normalizeFormLabelKey(key) === normalized) return value;
  }
  return undefined;
}

function canonicalBaseName(baseEn) {
  return lookupMappedValue(FORM_NAME_RULES.baseNameOverrides, baseEn) ?? normalizeFormLabelKey(baseEn);
}

function resolveDefaultSpeciesName(baseEn) {
  const candidate =
    lookupMappedValue(FORM_NAME_RULES.defaultSpeciesNameOverrides, baseEn) ??
    canonicalBaseName(baseEn);
  return resolveSmogonName(candidate) || candidate;
}

function nameWithSuffix(baseEn, suffix, allowUnverified = false) {
  if (suffix === "") return resolveDefaultSpeciesName(baseEn);
  const candidate = `${canonicalBaseName(baseEn)}-${suffix}`;
  return resolveSmogonName(candidate) || (allowUnverified ? candidate : null);
}

function lookupSpeciesOverride(baseEn, nameZh) {
  const speciesRules = FORM_NAME_RULES.speciesFormSuffixOverrides || {};
  for (const [speciesName, byForm] of Object.entries(speciesRules)) {
    if (normalizeFormLabelKey(speciesName) !== normalizeFormLabelKey(baseEn)) continue;
    const suffix = lookupMappedValue(byForm, nameZh);
    return suffix === undefined ? null : nameWithSuffix(baseEn, suffix, true);
  }
  return null;
}

function lookupManualMapping(keys) {
  for (const key of keys) {
    const normalized = normalizeFormLabelKey(key);
    for (const mapping of FORM_NAME_RULES.manualFormMappings || []) {
      if (normalizeFormLabelKey(mapping.key) === normalized) return mapping;
    }
  }
  return null;
}

const formSuffixRules = (FORM_NAME_RULES.formSuffixRules || []).map((rule) => ({
  pattern: new RegExp(rule.pattern, "u"),
  suffix: rule.suffix,
}));

function resolveFormNameEn(baseEn, nameZh, formType, formCategory, isDefault = false) {
  if (isDefault) return resolveDefaultSpeciesName(baseEn);

  const speciesOverride = lookupSpeciesOverride(baseEn, nameZh);
  if (speciesOverride) return speciesOverride;

  const manual = lookupManualMapping([`${nameZh}${String(baseEn).toLowerCase()}`, nameZh]);
  if (manual) {
    const resolved = nameWithSuffix(manual.base || baseEn, manual.suffix);
    if (resolved) return resolved;
  }

  for (const rule of formSuffixRules) {
    if (!rule.pattern.test(nameZh)) continue;
    const resolved = nameWithSuffix(baseEn, rule.suffix);
    if (resolved) return resolved;
    break;
  }

  if (formType === "gmax" || formCategory === "gigantamax" || /^超极巨化/u.test(nameZh)) {
    return nameWithSuffix(baseEn, "Gmax", true);
  }

  if (nameZh === "雌性的样子") {
    const resolved = nameWithSuffix(baseEn, "F");
    if (resolved) return resolved;
  }

  return resolveDefaultSpeciesName(baseEn);
}

if (!hasColumn("pokemon_forms", "display_name_zh")) {
  db.exec(`
    ALTER TABLE pokemon_forms ADD COLUMN display_name_zh TEXT;
    UPDATE pokemon_forms SET display_name_zh = name_zh WHERE display_name_zh IS NULL;
  `);
}

const forms = db.prepare(`
  SELECT pf.id, pf.pokemon_id, pf.name_zh, pf.display_name_zh, pf.is_default, pf.form_type, pf.form_category,
         p.name_zh AS species_name_zh, p.name_en AS base_name_en
  FROM pokemon_forms pf
  JOIN pokemon p ON pf.pokemon_id = p.id
  ORDER BY pf.pokemon_id, pf.is_default DESC, pf.sort_order, pf.id
`).all();

console.log(`数据库共有 ${forms.length} 个形态记录`);

db.exec(`
  UPDATE pokemon_forms SET name_en = NULL;
  UPDATE pokemon_forms
  SET form_type = '__tmp_' || id,
      form_category = 'alternate'
  WHERE is_default = 0;
`);

const updateStmt = db.prepare(`
  UPDATE pokemon_forms
  SET name_en = ?, form_type = ?, form_category = ?, name_zh = ?, display_name_zh = ?
  WHERE id = ?
`);
const seenTypesByPokemon = new Map();

function uniqueFormType(pokemonId, candidate, formId) {
  if (!seenTypesByPokemon.has(pokemonId)) seenTypesByPokemon.set(pokemonId, new Set());
  const seen = seenTypesByPokemon.get(pokemonId);
  if (!seen.has(candidate)) {
    seen.add(candidate);
    return candidate;
  }
  const withId = `${candidate}-${formId}`;
  seen.add(withId);
  return withId;
}

let matched = 0;
let unmatched = 0;
const unmatchedList = [];

for (const form of forms) {
  const baseEn = form.base_name_en;
  if (!baseEn) continue;

  const nameZh = form.display_name_zh || form.name_zh || "";
  const nameEn = resolveFormNameEn(
    baseEn,
    nameZh,
    form.form_type,
    form.form_category,
    form.is_default === 1,
  );
  const formType = uniqueFormType(
    Number(form.pokemon_id),
    deriveFormType(baseEn, nameEn, nameZh, form.is_default === 1),
    form.id,
  );
  const formCategory = deriveFormCategory(formType, form.form_category || form.form_type);
  const canonicalNameZh = canonicalFormNameZh(
    form.species_name_zh,
    nameZh,
    formType,
    formCategory,
    form.is_default === 1,
  );

  if (nameEn) {
    updateStmt.run(nameEn, formType, formCategory, canonicalNameZh, nameZh, form.id);
    matched++;
  } else {
    unmatched++;
    unmatchedList.push({ id: form.id, nameZh: form.name_zh, formType, baseEn });
  }
}

db.close();

console.log(`\n匹配完成: ${matched} 成功, ${unmatched} 未匹配`);
if (unmatchedList.length > 0) {
  console.log("\n未匹配的形态:");
  for (const item of unmatchedList) {
    console.log(`  [${item.id}] ${item.nameZh} (form_type: ${item.formType}, base: ${item.baseEn})`);
  }
}
