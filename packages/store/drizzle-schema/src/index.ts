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
  slug: text("slug").notNull().unique(),
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
  formKey: text("form_key").notNull(),
  nameZh: text("name_zh").notNull(),
  formType: text("form_type").notNull().default("default"),
  isDefault: integer("is_default").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  requiredItemId: integer("required_item_id").references(() => items.id, { onDelete: "set null" }),
  nameEn: text("name_en"),
}, (table) => [
  uniqueIndex("uq_forms_pokemon_key").on(table.pokemonId, table.formKey),
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
  fromFormKey: text("from_form_key"),
  toFormKey: text("to_form_key"),
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
]);

// ══════════════════════════════════════════════════════════════════════════════
// 宝可梦世代可用性
// ══════════════════════════════════════════════════════════════════════════════

export const pokemonGenerationRegions = sqliteTable("pokemon_generation_regions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pokemonId: integer("pokemon_id").notNull().references(() => pokemon.id, { onDelete: "cascade" }),
  generation: integer("generation").notNull(),
  region: text("region"),
  regionalDexNumber: text("regional_dex_number"),
}, (table) => [
  uniqueIndex("uq_gen_regions").on(table.pokemonId, table.generation, table.region),
  index("idx_regions_pokemon").on(table.pokemonId),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 招式学习
// ══════════════════════════════════════════════════════════════════════════════

export const pokemonLearnsets = sqliteTable("pokemon_learnsets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pokemonId: integer("pokemon_id").notNull().references(() => pokemon.id, { onDelete: "cascade" }),
  formKey: text("form_key").notNull().default("default"),
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
  uniqueIndex("uq_learnsets").on(
    table.pokemonId, table.formKey, table.moveNameZh,
    table.generation, table.gameVersionCode, table.learnMethod, table.level,
  ),
  index("idx_learnsets_pokemon").on(table.pokemonId, table.formKey),
  index("idx_learnsets_pokemon_gen").on(table.pokemonId, table.generation),
  index("idx_learnsets_lookup").on(
    table.pokemonId,
    table.generation,
    table.formKey,
    table.gameVersionCode,
    table.learnMethod,
    table.sortOrder,
  ),
  index("idx_learnsets_move").on(table.moveId),
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
  slug: text("slug").notNull().unique(),
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
  formKey: text("form_key"),
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
