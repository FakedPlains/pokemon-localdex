/**
 * localStorage 数据迁移工具
 *
 * 将旧格式数据（pokemonId/itemId 存储中文名称）迁移为新格式（存储数据库数字 ID）。
 *
 * 迁移策略：
 * 1. 检查 localStorage 中是否存在旧格式数据（pokemonId 为非纯数字字符串）
 * 2. 通过 API 搜索将中文名称解析为数字 ID
 * 3. 迁移成功后就地更新 localStorage 数据并标记已迁移
 * 4. 标记保留在 localStorage 中，防止重复执行（一次性操作）
 *
 * 迁移标记：localdex_migration_v2（存在则表示已迁移，无需再次执行）
 */

import { unifiedApi } from "./api.js";

const BOX_KEY = "localdex_box";
const TEAMS_KEY = "localdex_teams";
const MIGRATION_FLAG = "localdex_migration_v2";

/**
 * 判断一个 ID 值是否为旧格式（非纯数字，即中文名称）
 */
function isLegacyId(value) {
  if (!value || typeof value !== "string") return false;
  // 纯数字或空字符串视为新格式
  return !/^\d+$/.test(value.trim());
}

/**
 * 检查是否需要迁移
 */
function needsMigration() {
  // 已迁移过则跳过
  if (localStorage.getItem(MIGRATION_FLAG)) return false;

  const box = readJSON(BOX_KEY);
  const teams = readJSON(TEAMS_KEY);

  // 如果没有任何数据，标记为已迁移并跳过
  if (box.length === 0 && teams.length === 0) {
    localStorage.setItem(MIGRATION_FLAG, "done");
    return false;
  }

  // 检查 box 中是否有旧格式 ID
  for (const config of box) {
    if (isLegacyId(config.pokemonId) || isLegacyId(config.itemId)) {
      return true;
    }
  }

  // 检查 teams 中内联成员是否有旧格式 ID
  for (const team of teams) {
    for (const member of team.members || []) {
      if (member.configId) continue; // 引用 box 的成员不需要单独检查
      if (isLegacyId(member.pokemonId) || isLegacyId(member.itemId)) {
        return true;
      }
    }
  }

  // 数据都是新格式，标记并跳过
  localStorage.setItem(MIGRATION_FLAG, "done");
  return false;
}

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

/**
 * 通过名称查询宝可梦的数字 ID
 * @returns {{ id: string, nameZh: string } | null}
 */
async function resolvePokemonId(nameZh) {
  if (!nameZh) return null;
  try {
    const result = await unifiedApi(`/pokemon?q=${encodeURIComponent(nameZh)}&limit=5`);
    const list = result.data || [];
    // 精确匹配名称
    const exact = list.find((p) => p.nameZh === nameZh || p.slug === nameZh);
    if (exact) return { id: String(exact.id), nameZh: exact.nameZh };
    // 模糊匹配第一个结果
    if (list.length > 0) return { id: String(list[0].id), nameZh: list[0].nameZh };
    return null;
  } catch {
    return null;
  }
}

/**
 * 通过名称查询道具的数字 ID
 * @returns {{ id: string, nameZh: string } | null}
 */
async function resolveItemId(nameZh) {
  if (!nameZh) return null;
  try {
    const result = await unifiedApi(`/items?q=${encodeURIComponent(nameZh)}&limit=5`);
    const list = result.data || [];
    const exact = list.find((item) => item.nameZh === nameZh || item.slug === nameZh);
    if (exact) return { id: String(exact.id), nameZh: exact.nameZh };
    if (list.length > 0) return { id: String(list[0].id), nameZh: list[0].nameZh };
    return null;
  } catch {
    return null;
  }
}

/**
 * 迁移单个配置对象（就地修改）
 * @returns {boolean} 是否有变更
 */
async function migrateConfig(config) {
  let changed = false;

  // 迁移 pokemonId
  if (isLegacyId(config.pokemonId)) {
    const resolved = await resolvePokemonId(config.pokemonId);
    if (resolved) {
      // 保留原始名称到 nameZh（如果还没有的话）
      if (!config.nameZh) config.nameZh = config.pokemonId;
      config.pokemonId = resolved.id;
      changed = true;
    }
    // 如果解析失败，保持原样（不丢失数据）
  }

  // 迁移 itemId
  if (isLegacyId(config.itemId)) {
    const resolved = await resolveItemId(config.itemId);
    if (resolved) {
      // 保存道具显示名
      config.itemName = config.itemId;
      config.itemId = resolved.id;
      changed = true;
    }
  }

  return changed;
}

/**
 * 执行完整迁移流程
 */
async function performMigration() {
  console.log("[LocalDex Migration] 开始迁移旧格式数据...");

  const box = readJSON(BOX_KEY);
  const teams = readJSON(TEAMS_KEY);
  let totalMigrated = 0;

  // 迁移 box 中的配置
  for (const config of box) {
    const changed = await migrateConfig(config);
    if (changed) totalMigrated++;
  }

  // 迁移 teams 中的内联成员
  for (const team of teams) {
    for (const member of team.members || []) {
      if (member.configId) continue; // 引用型成员跳过
      const changed = await migrateConfig(member);
      if (changed) totalMigrated++;
    }
  }

  // 写回 localStorage
  if (totalMigrated > 0) {
    localStorage.setItem(BOX_KEY, JSON.stringify(box));
    localStorage.setItem(TEAMS_KEY, JSON.stringify(teams));
    console.log(`[LocalDex Migration] 迁移完成，共更新 ${totalMigrated} 条配置。`);
  } else {
    console.log("[LocalDex Migration] 未发现需要迁移的数据。");
  }

  // 标记迁移完成
  localStorage.setItem(MIGRATION_FLAG, "done");
}

/**
 * 应用启动时调用的迁移入口
 * - 检查是否需要迁移
 * - 执行迁移（异步，不阻塞渲染）
 * - 迁移完成后删除迁移标记文件（标记保留在 localStorage 中防止重复执行）
 *
 * @returns {Promise<void>}
 */
export async function runMigrationIfNeeded() {
  if (!needsMigration()) return;

  try {
    await performMigration();
  } catch (err) {
    console.error("[LocalDex Migration] 迁移过程中出错:", err);
    // 不标记为完成，下次启动时重试
    localStorage.removeItem(MIGRATION_FLAG);
  }
}
