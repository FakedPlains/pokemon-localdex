import test from "node:test";
import assert from "node:assert/strict";

import { padMoves4, completePokemonConfig, isPokemonConfig, isTeam } from "./teamStorage";

// ══════════════════════════════════════════════
//  padMoves4
// ══════════════════════════════════════════════

test("padMoves4: empty array → four empty strings", () => {
  assert.deepEqual(padMoves4([]), ["", "", "", ""]);
});

test("padMoves4: non-array input → four empty strings", () => {
  assert.deepEqual(padMoves4(undefined), ["", "", "", ""]);
  assert.deepEqual(padMoves4(null), ["", "", "", ""]);
  assert.deepEqual(padMoves4("not-an-array"), ["", "", "", ""]);
});

test("padMoves4: fewer than 4 entries → pads with empty strings", () => {
  assert.deepEqual(padMoves4(["地震", "冲浪"]), ["地震", "冲浪", "", ""]);
  assert.deepEqual(padMoves4(["十万伏特", "冲浪", "冰冻光束"]), ["十万伏特", "冲浪", "冰冻光束", ""]);
});

test("padMoves4: exactly 4 entries → unchanged", () => {
  assert.deepEqual(padMoves4(["a", "b", "c", "d"]), ["a", "b", "c", "d"]);
});

test("padMoves4: more than 4 entries → truncates to first 4", () => {
  assert.deepEqual(padMoves4(["a", "b", "c", "d", "e"]), ["a", "b", "c", "d"]);
});

test("padMoves4: non-string elements → replaced with empty string", () => {
  assert.deepEqual(padMoves4([123, null, undefined, "ok"]), ["", "", "", "ok"]);
});

// ══════════════════════════════════════════════
//  completePokemonConfig
// ══════════════════════════════════════════════

test("completePokemonConfig: minimal draft → fills all defaults", () => {
  const result = completePokemonConfig({
    pokemonId: "25",
    nameZh: "皮卡丘",
  });
  assert.equal(result.pokemonId, "25");
  assert.equal(result.nameZh, "皮卡丘");
  assert.equal(result.level, 50);
  assert.equal(result.nature, "认真");
  assert.deepEqual(result.moves, ["", "", "", ""]);
  assert.deepEqual(result.ivs, { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 });
  assert.deepEqual(result.evs, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  assert.equal(typeof result.createdAt, "number");
  assert.equal(typeof result.updatedAt, "number");
});

test("completePokemonConfig: draft moves go through padMoves4", () => {
  const result = completePokemonConfig({
    pokemonId: "6",
    nameZh: "喷火龙",
    moves: ["喷射火焰", "龙之怒"],
  });
  assert.deepEqual(result.moves, ["喷射火焰", "龙之怒", "", ""]);
});

test("completePokemonConfig: overrides take priority", () => {
  const result = completePokemonConfig(
    { pokemonId: "1", nameZh: "妙蛙种子" },
    { configId: "custom-id", createdAt: 1000, updatedAt: 2000 },
  );
  assert.equal(result.configId, "custom-id");
  assert.equal(result.createdAt, 1000);
  assert.equal(result.updatedAt, 2000);
});

test("completePokemonConfig: preserves draft fields when provided", () => {
  const result = completePokemonConfig({
    pokemonId: "150",
    nameZh: "超梦",
    level: 100,
    nature: "胆小",
    abilityName: "紧张感",
    itemName: "生命宝珠",
  });
  assert.equal(result.level, 100);
  assert.equal(result.nature, "胆小");
  assert.equal(result.abilityName, "紧张感");
  assert.equal(result.itemName, "生命宝珠");
});

// ══════════════════════════════════════════════
//  isPokemonConfig
// ══════════════════════════════════════════════

test("isPokemonConfig: valid config → true", () => {
  const config = {
    configId: "abc123",
    pokemonId: "25",
    nameZh: "皮卡丘",
    level: 50,
    moves: ["十万伏特", "", "", ""],
    createdAt: Date.now(),
  };
  assert.equal(isPokemonConfig(config), true);
});

test("isPokemonConfig: null/undefined → false", () => {
  assert.equal(isPokemonConfig(null), false);
  assert.equal(isPokemonConfig(undefined), false);
});

test("isPokemonConfig: missing configId → false", () => {
  assert.equal(isPokemonConfig({
    pokemonId: "25", nameZh: "皮卡丘", level: 50, moves: [], createdAt: 1,
  }), false);
});

test("isPokemonConfig: empty configId → false", () => {
  assert.equal(isPokemonConfig({
    configId: "", pokemonId: "25", nameZh: "皮卡丘", level: 50, moves: [], createdAt: 1,
  }), false);
});

test("isPokemonConfig: empty pokemonId → false", () => {
  assert.equal(isPokemonConfig({
    configId: "x", pokemonId: "", nameZh: "皮卡丘", level: 50, moves: [], createdAt: 1,
  }), false);
});

test("isPokemonConfig: numeric id (not string) → false", () => {
  assert.equal(isPokemonConfig({
    configId: "x", pokemonId: 25, nameZh: "皮卡丘", level: 50, moves: [], createdAt: 1,
  }), false);
});

test("isPokemonConfig: level not number → false", () => {
  assert.equal(isPokemonConfig({
    configId: "x", pokemonId: "25", nameZh: "皮卡丘", level: "50", moves: [], createdAt: 1,
  }), false);
});

test("isPokemonConfig: moves not array → false", () => {
  assert.equal(isPokemonConfig({
    configId: "x", pokemonId: "25", nameZh: "皮卡丘", level: 50, moves: "十万伏特", createdAt: 1,
  }), false);
});

// ══════════════════════════════════════════════
//  isTeam
// ══════════════════════════════════════════════

test("isTeam: valid team → true", () => {
  const team = {
    teamId: "team-1",
    name: "我的队伍",
    members: [],
    createdAt: Date.now(),
  };
  assert.equal(isTeam(team), true);
});

test("isTeam: null/undefined → false", () => {
  assert.equal(isTeam(null), false);
  assert.equal(isTeam(undefined), false);
});

test("isTeam: missing teamId → false", () => {
  assert.equal(isTeam({ name: "队伍", members: [], createdAt: 1 }), false);
});

test("isTeam: empty teamId → false", () => {
  assert.equal(isTeam({ teamId: "", name: "队伍", members: [], createdAt: 1 }), false);
});

test("isTeam: members not array → false", () => {
  assert.equal(isTeam({ teamId: "t1", name: "队伍", members: "invalid", createdAt: 1 }), false);
});

test("isTeam: missing createdAt → false", () => {
  assert.equal(isTeam({ teamId: "t1", name: "队伍", members: [] }), false);
});
