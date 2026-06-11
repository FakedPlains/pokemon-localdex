/**
 * @pokemon-localdex/drizzle-schema
 *
 * 所有数据库表的 Drizzle ORM schema 定义。
 * sqlite-store 和 d1-store 共享同一份 schema，
 * 只需在初始化时传入不同的 driver 即可。
 */

import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ══════════════════════════════════════════════════════════════════════════════
// 宝可梦主表
// ══════════════════════════════════════════════════════════════════════════════

export const pokemon = sqliteTable("pokemon", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dexNumber: integer("dex_number").notNull(),
  nameZh: text("name_zh").notNull(),
  nameJa: text("name_ja"),
  nameEn: text("name_en"),
  category: text("category"),
  heightM: real("height_m"),
  weightKg: real("weight_kg"),
  introducedGeneration: integer("introduced_generation"),
  sourceUrl: text("source_url"),
  sourceTitle: text("source_title"),
  sourceFetchedAt: text("source_fetched_at"),
}, (table) => [
  index("idx_pokemon_dex").on(table.dexNumber),
  index("idx_pokemon_name").on(table.nameZh),
  index("idx_pokemon_introduced_generation").on(table.introducedGeneration),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 宝可梦形态
// ══════════════════════════════════════════════════════════════════════════════

export const pokemonForms = sqliteTable("pokemon_forms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pokemonId: integer("pokemon_id").notNull().references(() => pokemon.id, { onDelete: "cascade" }),
  formType: text("form_type").notNull(),
  formCategory: text("form_category").notNull().default("default"),
  nameZh: text("name_zh").notNull(),
  displayNameZh: text("display_name_zh"),
  nameEn: text("name_en"),
  isDefault: integer("is_default").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  requiredItemId: integer("required_item_id").references(() => items.id, { onDelete: "set null" }),
}, (table) => [
  uniqueIndex("uq_forms_pokemon_type").on(table.pokemonId, table.formType),
  index("idx_forms_pokemon").on(table.pokemonId),
  index("idx_forms_default").on(table.pokemonId, table.isDefault),
]);

export const pokemonFormStats = sqliteTable("pokemon_form_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  formId: integer("form_id").notNull().references(() => pokemonForms.id, { onDelete: "cascade" }),
  generationStart: integer("generation_start"),
  generationEnd: integer("generation_end"),
  hp: integer("hp").notNull(),
  atk: integer("atk").notNull(),
  def: integer("def").notNull(),
  spa: integer("spa").notNull(),
  spd: integer("spd").notNull(),
  spe: integer("spe").notNull(),
}, (table) => [
  uniqueIndex("uq_form_stats").on(table.formId, table.generationStart),
  index("idx_form_stats_form").on(table.formId),
]);

export const pokemonFormTypes = sqliteTable("pokemon_form_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  formId: integer("form_id").notNull().references(() => pokemonForms.id, { onDelete: "cascade" }),
  typeName: text("type_name").notNull(),
  slot: integer("slot").notNull(),
  generationStart: integer("generation_start"),
  generationEnd: integer("generation_end"),
}, (table) => [
  uniqueIndex("uq_form_types").on(table.formId, table.slot, table.generationStart),
  index("idx_form_types_form").on(table.formId),
  index("idx_form_types_current").on(table.formId, table.generationEnd, table.slot),
]);

export const pokemonFormAbilities = sqliteTable("pokemon_form_abilities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  formId: integer("form_id").notNull().references(() => pokemonForms.id, { onDelete: "cascade" }),
  abilityId: integer("ability_id").references(() => abilities.id),
  abilityNameZh: text("ability_name_zh").notNull(),
  slot: integer("slot").notNull(),
  isHidden: integer("is_hidden").notNull().default(0),
  generationStart: integer("generation_start"),
  generationEnd: integer("generation_end"),
}, (table) => [
  uniqueIndex("uq_form_abilities").on(table.formId, table.slot, table.generationStart),
  index("idx_form_abilities_form").on(table.formId),
  index("idx_form_abilities_ability").on(table.abilityId, table.formId),
]);

export const pokemonFormImages = sqliteTable("pokemon_form_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  formId: integer("form_id").notNull().references(() => pokemonForms.id, { onDelete: "cascade" }),
  imageKind: text("image_kind").notNull(),
  url: text("url").notNull(),
  alt: text("alt"),
}, (table) => [
  uniqueIndex("uq_form_images").on(table.formId, table.imageKind),
  index("idx_form_images_form").on(table.formId),
  index("idx_form_images_kind").on(table.formId, table.imageKind),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 进化链
// ══════════════════════════════════════════════════════════════════════════════

export const evolutionChains = sqliteTable("evolution_chains", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chainId: integer("chain_id").notNull(),
  fromPokemonId: integer("from_pokemon_id").references(() => pokemon.id, { onDelete: "cascade" }),
  toPokemonId: integer("to_pokemon_id").notNull().references(() => pokemon.id, { onDelete: "cascade" }),
  fromFormId: integer("from_form_id").references(() => pokemonForms.id, { onDelete: "set null" }),
  toFormId: integer("to_form_id").references(() => pokemonForms.id, { onDelete: "set null" }),
  stage: integer("stage").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  evolutionMethod: text("evolution_method"),
  evolutionCondition: text("evolution_condition"),
  evolutionItem: text("evolution_item"),
  evolutionLevel: integer("evolution_level"),
  notes: text("notes"),
}, (table) => [
  index("idx_evo_chain").on(table.chainId),
  index("idx_evo_to").on(table.toPokemonId),
  index("idx_evo_from").on(table.fromPokemonId),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 宝可梦可学招式
// ══════════════════════════════════════════════════════════════════════════════

export const pokemonMoves = sqliteTable("pokemon_moves", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pokemonId: integer("pokemon_id").notNull().references(() => pokemon.id, { onDelete: "cascade" }),
  formId: integer("form_id").notNull().references(() => pokemonForms.id, { onDelete: "cascade" }),
  moveId: integer("move_id").references(() => moves.id),
  moveNameZh: text("move_name_zh").notNull(),
  generation: integer("generation").notNull(),
  gameVersionCode: text("game_version_code"),
  learnMethod: text("learn_method").notNull(),
  level: integer("level"),
  tmNumber: text("tm_number"),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
}, (table) => [
  uniqueIndex("uq_pokemon_moves").on(
    table.formId,
    table.moveNameZh,
    table.generation,
    sql`COALESCE(${table.gameVersionCode}, '')`,
    table.learnMethod,
    sql`COALESCE(${table.level}, -1)`,
    sql`COALESCE(${table.tmNumber}, '')`,
  ),
  index("idx_pokemon_moves_lookup").on(
    table.pokemonId,
    table.generation,
    table.formId,
    table.gameVersionCode,
    table.learnMethod,
    table.sortOrder,
  ),
  index("idx_pokemon_moves_form_gen").on(table.formId, table.generation),
  index("idx_pokemon_moves_move").on(table.moveId),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 招式表
// ══════════════════════════════════════════════════════════════════════════════

export const moves = sqliteTable("moves", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: integer("number"),
  nameZh: text("name_zh").notNull(),
  nameJa: text("name_ja"),
  nameEn: text("name_en"),
  typeName: text("type_name"),
  category: text("category"),
  power: integer("power"),
  accuracy: integer("accuracy"),
  pp: integer("pp"),
  description: text("description"),
  effectDetail: text("effect_detail"),
  introducedGeneration: integer("introduced_generation"),
  sourceUrl: text("source_url"),
  sourceTitle: text("source_title"),
  sourceFetchedAt: text("source_fetched_at"),
}, (table) => [
  uniqueIndex("uq_moves").on(table.number, table.nameZh),
  index("idx_moves_name_zh").on(table.nameZh),
  index("idx_moves_type").on(table.typeName),
  index("idx_moves_number").on(table.number),
  index("idx_moves_sort").on(sql`CASE WHEN ${table.number} IS NULL OR ${table.number} = 0 THEN 1 ELSE 0 END`, table.number),
]);

export const moveGenerationRecords = sqliteTable("move_generation_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  moveId: integer("move_id").notNull().references(() => moves.id, { onDelete: "cascade" }),
  generation: integer("generation").notNull(),
  gameVersionCode: text("game_version_code").notNull().default(""),
  description: text("description"),
  notes: text("notes"),
  versionExclusive: integer("version_exclusive").notNull().default(0),
}, (table) => [
  uniqueIndex("uq_move_gen").on(table.moveId, table.generation, table.gameVersionCode),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 特性表
// ══════════════════════════════════════════════════════════════════════════════

export const abilities = sqliteTable("abilities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: integer("number"),
  nameZh: text("name_zh").notNull(),
  nameJa: text("name_ja"),
  nameEn: text("name_en"),
  description: text("description"),
  effectDetail: text("effect_detail"),
  introducedGeneration: integer("introduced_generation"),
  sourceUrl: text("source_url"),
  sourceTitle: text("source_title"),
  sourceFetchedAt: text("source_fetched_at"),
}, (table) => [
  uniqueIndex("uq_abilities").on(table.number, table.nameZh),
  index("idx_abilities_name").on(table.nameZh),
  index("idx_abilities_number").on(table.number),
]);

export const abilityGenerationRecords = sqliteTable("ability_generation_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  abilityId: integer("ability_id").notNull().references(() => abilities.id, { onDelete: "cascade" }),
  generation: integer("generation").notNull(),
  gameVersionCode: text("game_version_code"),
  description: text("description"),
  notes: text("notes"),
  versionExclusive: integer("version_exclusive").notNull().default(0),
}, (table) => [
  uniqueIndex("uq_ability_gen").on(table.abilityId, table.generation),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 道具表
// ══════════════════════════════════════════════════════════════════════════════

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nameZh: text("name_zh").notNull(),
  nameJa: text("name_ja"),
  nameEn: text("name_en"),
  category: text("category"),
  effectSummary: text("effect_summary"),
  effectDetail: text("effect_detail"),
  introducedGeneration: integer("introduced_generation"),
  imageUrl: text("image_url"),
  sourceUrl: text("source_url"),
  sourceTitle: text("source_title"),
  sourceFetchedAt: text("source_fetched_at"),
}, (table) => [
  index("idx_items_name_zh").on(table.nameZh),
  index("idx_items_category").on(table.category),
]);

export const itemGenerationRecords = sqliteTable("item_generation_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  generation: integer("generation").notNull(),
  gameVersionCode: text("game_version_code"),
  description: text("description"),
  notes: text("notes"),
  versionExclusive: integer("version_exclusive").notNull().default(0),
}, (table) => [
  uniqueIndex("uq_item_gen").on(table.itemId, table.generation),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 战斗效果结构化数据
// ══════════════════════════════════════════════════════════════════════════════

export const moveFlags = sqliteTable("move_flags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  moveId: integer("move_id").notNull().references(() => moves.id, { onDelete: "cascade" }),
  flag: integer("flag").notNull(),
}, (table) => [
  uniqueIndex("uq_move_flags").on(table.moveId, table.flag),
  index("idx_move_flags_move").on(table.moveId),
  index("idx_move_flags_flag").on(table.flag),
]);

export const abilityBattleEffects = sqliteTable("ability_battle_effects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  abilityId: integer("ability_id").notNull().references(() => abilities.id, { onDelete: "cascade" }),
  effectType: integer("effect_type").notNull(),
  trigger: integer("trigger").notNull().default(1),
  target: integer("target").notNull().default(1),
  modifierType: integer("modifier_type").notNull(),
  modifierValue: real("modifier_value"),
  affectedStat: integer("affected_stat"),
  affectedType: integer("affected_type"),
  affectedMoveFlag: integer("affected_move_flag"),
  affectedMoveCategory: integer("affected_move_category"),
  params: text("params"),
  generationStart: integer("generation_start").notNull().default(1),
  generationEnd: integer("generation_end"),
  priority: integer("priority").notNull().default(0),
  note: text("note"),
}, (table) => [
  index("idx_abe_ability").on(table.abilityId),
  index("idx_abe_effect_type").on(table.effectType),
  index("idx_abe_trigger").on(table.trigger),
]);

export const itemBattleEffects = sqliteTable("item_battle_effects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  effectType: integer("effect_type").notNull(),
  trigger: integer("trigger").notNull().default(1),
  target: integer("target").notNull().default(1),
  modifierType: integer("modifier_type").notNull(),
  modifierValue: real("modifier_value"),
  affectedStat: integer("affected_stat"),
  affectedType: integer("affected_type"),
  affectedMoveFlag: integer("affected_move_flag"),
  affectedMoveCategory: integer("affected_move_category"),
  params: text("params"),
  consumable: integer("consumable").notNull().default(0),
  speciesRestriction: text("species_restriction"),
  generationStart: integer("generation_start").notNull().default(1),
  generationEnd: integer("generation_end"),
  priority: integer("priority").notNull().default(0),
  note: text("note"),
}, (table) => [
  index("idx_ibe_item").on(table.itemId),
  index("idx_ibe_effect_type").on(table.effectType),
]);

export const moveBattleEffects = sqliteTable("move_battle_effects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  moveId: integer("move_id").notNull().references(() => moves.id, { onDelete: "cascade" }),
  effectType: integer("effect_type").notNull(),
  trigger: integer("trigger").notNull().default(7),
  target: integer("target").notNull().default(2),
  modifierType: integer("modifier_type").notNull(),
  modifierValue: real("modifier_value"),
  affectedStat: integer("affected_stat"),
  affectedType: integer("affected_type"),
  affectedMoveFlag: integer("affected_move_flag"),
  affectedMoveCategory: integer("affected_move_category"),
  params: text("params"),
  generationStart: integer("generation_start").notNull().default(1),
  generationEnd: integer("generation_end"),
  priority: integer("priority").notNull().default(0),
  note: text("note"),
}, (table) => [
  index("idx_mbe_move").on(table.moveId),
  index("idx_mbe_effect_type").on(table.effectType),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 场地效果（天气、场地、异常状态等）
// ══════════════════════════════════════════════════════════════════════════════

export const fieldEffects = sqliteTable("field_effects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: integer("kind").notNull(),
  key: text("key").notNull(),
  nameZh: text("name_zh").notNull(),
  nameEn: text("name_en"),
  nameJa: text("name_ja"),
  description: text("description"),
  introducedGeneration: integer("introduced_generation"),
  maxTurns: integer("max_turns"),
  maxLayers: integer("max_layers"),
  sourceUrl: text("source_url"),
  sourceTitle: text("source_title"),
  sourceFetchedAt: text("source_fetched_at"),
}, (table) => [
  uniqueIndex("uq_field_effects_kind_key").on(table.kind, table.key),
  index("idx_fe_kind").on(table.kind),
  index("idx_fe_key").on(table.key),
  index("idx_fe_name_zh").on(table.nameZh),
]);

export const fieldEffectModifiers = sqliteTable("field_effect_modifiers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fieldEffectId: integer("field_effect_id").notNull().references(() => fieldEffects.id, { onDelete: "cascade" }),
  effectType: integer("effect_type").notNull(),
  trigger: integer("trigger").notNull().default(1),
  target: integer("target").notNull().default(7),
  modifierType: integer("modifier_type").notNull(),
  modifierValue: real("modifier_value"),
  affectedStat: integer("affected_stat"),
  affectedType: integer("affected_type"),
  affectedMoveFlag: integer("affected_move_flag"),
  affectedMoveCategory: integer("affected_move_category"),
  conditionKey: text("condition_key"),
  params: text("params"),
  generationStart: integer("generation_start").notNull().default(1),
  generationEnd: integer("generation_end"),
  priority: integer("priority").notNull().default(0),
  note: text("note"),
}, (table) => [
  index("idx_fem_field_effect").on(table.fieldEffectId),
  index("idx_fem_effect_type").on(table.effectType),
]);

export const fieldEffectGenerationRecords = sqliteTable("field_effect_generation_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fieldEffectId: integer("field_effect_id").notNull().references(() => fieldEffects.id, { onDelete: "cascade" }),
  generation: integer("generation").notNull(),
  gameVersionCode: text("game_version_code"),
  description: text("description"),
  notes: text("notes"),
  versionExclusive: integer("version_exclusive").notNull().default(0),
}, (table) => [
  uniqueIndex("uq_field_effect_gen").on(table.fieldEffectId, table.generation, sql`COALESCE(${table.gameVersionCode}, '')`),
  index("idx_fegr_field_effect").on(table.fieldEffectId),
]);

export const fieldEffectSources = sqliteTable("field_effect_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fieldEffectId: integer("field_effect_id").notNull().references(() => fieldEffects.id, { onDelete: "cascade" }),
  sourceType: integer("source_type").notNull(),
  sourceId: integer("source_id").notNull(),
  triggerMethod: integer("trigger_method").notNull().default(2),
  layers: integer("layers"),
  turnsOverride: integer("turns_override"),
  conditionKey: text("condition_key"),
  probability: real("probability"),
  generationStart: integer("generation_start").notNull().default(1),
  generationEnd: integer("generation_end"),
  note: text("note"),
}, (table) => [
  uniqueIndex("uq_field_effect_sources").on(
    table.fieldEffectId, table.sourceType, table.sourceId, table.triggerMethod,
    sql`COALESCE(${table.conditionKey}, '')`,
  ),
  index("idx_fes_field_effect").on(table.fieldEffectId),
  index("idx_fes_source").on(table.sourceType, table.sourceId),
  index("idx_fes_source_type").on(table.sourceType),
]);

// ══════════════════════════════════════════════════════════════════════════════
// Pokémon Champions 赛季 / 赛制 / 可用池
// ══════════════════════════════════════════════════════════════════════════════

export const championsRegulations = sqliteTable("champions_regulations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  regulationCode: text("regulation_code").notNull().unique(),
  name: text("name").notNull(),
  startAt: text("start_at"),
  endAt: text("end_at"),
  periodText: text("period_text"),
  specialFeature: text("special_feature"),
  heldItemRule: text("held_item_rule"),
  battleTime: text("battle_time"),
  sourceUrl: text("source_url"),
  sourceTitle: text("source_title"),
  sourceFetchedAt: text("source_fetched_at"),
});

export const championsSeasons = sqliteTable("champions_seasons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonCode: text("season_code").notNull().unique(),
  regulationId: integer("regulation_id").references(() => championsRegulations.id, { onDelete: "set null" }),
  regulationCode: text("regulation_code").notNull(),
  startAt: text("start_at"),
  endAt: text("end_at"),
  periodText: text("period_text"),
  sourceUrl: text("source_url"),
  sourceTitle: text("source_title"),
  sourceFetchedAt: text("source_fetched_at"),
}, (table) => [
  index("idx_champions_seasons_regulation").on(table.regulationId),
]);

export const championsRegulationPokemon = sqliteTable("champions_regulation_pokemon", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  regulationId: integer("regulation_id").notNull().references(() => championsRegulations.id, { onDelete: "cascade" }),
  pokemonId: integer("pokemon_id").references(() => pokemon.id, { onDelete: "set null" }),
  formId: integer("form_id").references(() => pokemonForms.id, { onDelete: "set null" }),
  dexNumber: integer("dex_number"),
  mspCode: text("msp_code").notNull(),
  formCode: text("form_code"),
  nameZh: text("name_zh").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  uniqueIndex("uq_champions_regulation_pokemon").on(table.regulationId, table.mspCode, table.nameZh),
  index("idx_champions_regulation_pokemon_regulation").on(table.regulationId),
  index("idx_champions_regulation_pokemon_pokemon").on(table.pokemonId),
]);

export const championsRegulationItems = sqliteTable("champions_regulation_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  regulationId: integer("regulation_id").notNull().references(() => championsRegulations.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  uniqueIndex("uq_champions_regulation_items").on(table.regulationId, table.itemId),
  index("idx_champions_regulation_items_regulation").on(table.regulationId),
]);

// ══════════════════════════════════════════════════════════════════════════════
// Champions 使用率统计（数据源: pokechamdb.com）
// ══════════════════════════════════════════════════════════════════════════════

export const championsUsagePokemon = sqliteTable("champions_usage_pokemon", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonId: integer("season_id").notNull().references(() => championsSeasons.id, { onDelete: "cascade" }),
  format: text("format").notNull(),
  eventId: text("event_id").notNull().default(""),
  pokemonId: integer("pokemon_id").references(() => pokemon.id, { onDelete: "set null" }),
  formId: integer("form_id").references(() => pokemonForms.id, { onDelete: "set null" }),
  pokemonSlug: text("pokemon_slug").notNull(),
  rank: integer("rank").notNull(),
  fetchedAt: text("fetched_at").notNull(),
}, (table) => [
  uniqueIndex("uq_usage_pokemon").on(table.seasonId, table.format, table.eventId, table.pokemonSlug),
  index("idx_usage_pokemon_season").on(table.seasonId, table.format),
  index("idx_usage_pokemon_pid").on(table.pokemonId),
]);

export const championsUsageMoves = sqliteTable("champions_usage_moves", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  usagePokemonId: integer("usage_pokemon_id").notNull().references(() => championsUsagePokemon.id, { onDelete: "cascade" }),
  moveId: integer("move_id").references(() => moves.id, { onDelete: "set null" }),
  moveNameZh: text("move_name_zh").notNull(),
  rank: integer("rank").notNull(),
  percentage: real("percentage").notNull(),
}, (table) => [
  uniqueIndex("uq_usage_moves").on(table.usagePokemonId, table.moveNameZh),
  index("idx_usage_moves_parent").on(table.usagePokemonId),
  index("idx_usage_moves_mid").on(table.moveId),
]);

export const championsUsageItems = sqliteTable("champions_usage_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  usagePokemonId: integer("usage_pokemon_id").notNull().references(() => championsUsagePokemon.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => items.id, { onDelete: "set null" }),
  itemNameZh: text("item_name_zh").notNull(),
  rank: integer("rank").notNull(),
  percentage: real("percentage").notNull(),
}, (table) => [
  uniqueIndex("uq_usage_items").on(table.usagePokemonId, table.itemNameZh),
  index("idx_usage_items_parent").on(table.usagePokemonId),
  index("idx_usage_items_iid").on(table.itemId),
]);

export const championsUsageAbilities = sqliteTable("champions_usage_abilities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  usagePokemonId: integer("usage_pokemon_id").notNull().references(() => championsUsagePokemon.id, { onDelete: "cascade" }),
  abilityId: integer("ability_id").references(() => abilities.id, { onDelete: "set null" }),
  abilityNameZh: text("ability_name_zh").notNull(),
  rank: integer("rank").notNull(),
  percentage: real("percentage").notNull(),
}, (table) => [
  uniqueIndex("uq_usage_abilities").on(table.usagePokemonId, table.abilityNameZh),
  index("idx_usage_abilities_parent").on(table.usagePokemonId),
  index("idx_usage_abilities_aid").on(table.abilityId),
]);

export const championsUsageNatures = sqliteTable("champions_usage_natures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  usagePokemonId: integer("usage_pokemon_id").notNull().references(() => championsUsagePokemon.id, { onDelete: "cascade" }),
  natureId: integer("nature_id").notNull(),
  rank: integer("rank").notNull(),
  percentage: real("percentage").notNull(),
}, (table) => [
  uniqueIndex("uq_usage_natures").on(table.usagePokemonId, table.natureId),
  index("idx_usage_natures_parent").on(table.usagePokemonId),
]);

export const championsUsagePartners = sqliteTable("champions_usage_partners", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  usagePokemonId: integer("usage_pokemon_id").notNull().references(() => championsUsagePokemon.id, { onDelete: "cascade" }),
  partnerPokemonId: integer("partner_pokemon_id").references(() => pokemon.id, { onDelete: "set null" }),
  partnerFormId: integer("partner_form_id").references(() => pokemonForms.id, { onDelete: "set null" }),
  partnerSlug: text("partner_slug").notNull(),
  rank: integer("rank").notNull(),
}, (table) => [
  uniqueIndex("uq_usage_partners").on(table.usagePokemonId, table.partnerSlug),
  index("idx_usage_partners_parent").on(table.usagePokemonId),
]);

export const championsUsageEvSpreads = sqliteTable("champions_usage_ev_spreads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  usagePokemonId: integer("usage_pokemon_id").notNull().references(() => championsUsagePokemon.id, { onDelete: "cascade" }),
  rank: integer("rank").notNull(),
  percentage: real("percentage").notNull(),
  hp: integer("hp").notNull().default(0),
  atk: integer("atk").notNull().default(0),
  def: integer("def").notNull().default(0),
  spAtk: integer("sp_atk").notNull().default(0),
  spDef: integer("sp_def").notNull().default(0),
  speed: integer("speed").notNull().default(0),
}, (table) => [
  uniqueIndex("uq_usage_ev_spreads").on(table.usagePokemonId, table.hp, table.atk, table.def, table.spAtk, table.spDef, table.speed),
  index("idx_usage_ev_spreads_parent").on(table.usagePokemonId),
]);
