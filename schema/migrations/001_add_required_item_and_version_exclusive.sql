-- ============================================================
-- Migration 001: 添加 required_item_id 和 version_exclusive 字段
-- 使 Supabase 表结构与 SQLite 保持一致
-- ============================================================

-- 1. pokemon_forms 添加 required_item_id（形态绑定道具）
ALTER TABLE pokemon_forms
  ADD COLUMN IF NOT EXISTS required_item_id INTEGER REFERENCES items(id) ON DELETE SET NULL;

-- 2. move_generation_records 添加 version_exclusive
ALTER TABLE move_generation_records
  ADD COLUMN IF NOT EXISTS version_exclusive INTEGER NOT NULL DEFAULT 0;

-- 3. ability_generation_records 添加 version_exclusive
ALTER TABLE ability_generation_records
  ADD COLUMN IF NOT EXISTS version_exclusive INTEGER NOT NULL DEFAULT 0;

-- 4. item_generation_records 添加 version_exclusive
ALTER TABLE item_generation_records
  ADD COLUMN IF NOT EXISTS version_exclusive INTEGER NOT NULL DEFAULT 0;
