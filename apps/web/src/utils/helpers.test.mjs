import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPokemonFormOptions,
  resolvePokemonDisplayVariant,
  normalizeTypeName,
  splitTypeNames,
} from "./helpers.ts";
import { evToSp, getNatureMultiplier } from "./statCalcModel.ts";

test("normalizes Pokemon type names to the canonical Chinese name", () => {
  // 中文名原样返回
  assert.equal(normalizeTypeName("火"), "火");
  // 英文名归一化到中文
  assert.equal(normalizeTypeName("Fire"), "火");
  // 内部 key 归一化到中文
  assert.equal(normalizeTypeName("flying"), "飞行");
  // 数字 ID（字符串）归一化到中文
  assert.equal(normalizeTypeName("2"), "火");
  // 未知名按原值 trim 返回
  assert.equal(normalizeTypeName("  未知属性  "), "未知属性");
  // 空值返回空串
  assert.equal(normalizeTypeName(null), "");
  assert.equal(normalizeTypeName(undefined), "");
});

test("splits concatenated Chinese type names into individual types", () => {
  // 单个属性原样返回
  assert.deepEqual(splitTypeNames("火"), ["火"]);
  // 拼接的双属性按最长匹配优先拆分，避免「飞」误吞「飞行」
  assert.deepEqual(splitTypeNames("火飞行"), ["火", "飞行"]);
  assert.deepEqual(splitTypeNames("飞行火"), ["飞行", "火"]);
  // 空值返回空数组
  assert.deepEqual(splitTypeNames(""), []);
  assert.deepEqual(splitTypeNames(null), []);
});

test("calculates nature modifiers from shared constants", () => {
  assert.equal(getNatureMultiplier("爽朗", "spe"), 1.1);
  assert.equal(getNatureMultiplier("爽朗", "spa"), 0.9);
  assert.equal(getNatureMultiplier("认真", "atk"), 1);
});

test("converts classic EV investment to Champions SP", () => {
  assert.equal(evToSp(0), 0);
  assert.equal(evToSp(4), 1);
  assert.equal(evToSp(252), 32);
});

test("resolves generation-specific form data for display", () => {
  const detail = {
    nameZh: "测试兽",
    abilities: ["普通特性"],
    hiddenAbility: "隐藏特性",
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    forms: [
      {
        id: 10,
        formKey: "default",
        nameZh: "普通形态",
        isDefault: true,
        primaryType: "一般",
        secondaryType: "",
        abilities: [{ nameZh: "早期特性", isHidden: false }],
        baseStats: { hp: 10, atk: 20, def: 30, spa: 40, spd: 50, spe: 60 },
        images: { official: { url: "/normal.png" } },
        statVariants: [
          { generationStart: 1, generationEnd: 1, baseStats: { hp: 11, atk: 21, def: 31, spa: 41, spd: 51, spe: 61 } },
          { generationStart: 2, baseStats: { hp: 12, atk: 22, def: 32, spa: 42, spd: 52, spe: 62 } },
        ],
        typeVariants: [
          { generationStart: 1, generationEnd: 1, primaryType: "一般" },
          { generationStart: 2, primaryType: "火", secondaryType: "飞行" },
        ],
        abilityVariants: [
          { generationStart: 2, abilities: [{ nameZh: "新特性", isHidden: false, abilityId: 99 }] },
        ],
      },
    ],
  };

  const formOptions = buildPokemonFormOptions(detail, 2);
  assert.equal(formOptions[0].primaryType, "火");
  assert.equal(formOptions[0].baseStats.spe, 62);

  const display = resolvePokemonDisplayVariant(detail, 2, 10, 1);
  assert.equal(display.generation, 2);
  assert.equal(display.primaryType, "火");
  assert.equal(display.secondaryType, "飞行");
  assert.equal(display.abilityText, "新特性");
  assert.equal(display.abilitiesDetailed[0].abilityId, 99);
});
