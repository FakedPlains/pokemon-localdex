import { evToSp, resolveMoveGenerationRecord } from "../../utils/helpers.js";

type AnyRecord = Record<string, any>;

function resolveEvs(member: AnyRecord, isChampions: boolean): Record<string, number> {
  if (!isChampions) return member.evs || {};
  if (member.sps && Object.keys(member.sps).length > 0) return member.sps;
  const evs: Record<string, number> = member.evs || {};
  const converted: Record<string, number> = {};
  for (const key of Object.keys(evs)) converted[key] = evToSp(evs[key]!);
  return converted;
}

function buildSideState(values: AnyRecord, switchingDirection: "in" | "out") {
  return {
    isSR: values.stealthRock,
    spikes: values.spikes,
    steelsurge: values.steelsurge,
    isReflect: values.reflect,
    isLightScreen: values.lightScreen,
    isAuroraVeil: values.auroraVeil,
    isProtected: values.protect,
    isHelpingHand: values.helpingHand,
    isTailwind: values.tailwind,
    isFriendGuard: values.friendGuard,
    isSwitching: values.switchingOut ? switchingDirection : undefined,
    isSeeded: values.seeded,
    isSaltCured: values.saltCured,
    isForesight: values.foresight,
    isFlowerGift: values.flowerGift,
    isPowerTrick: values.powerTrick,
    isSteelySpirit: values.steelySpirit,
    isBattery: values.battery,
    isPowerSpot: values.powerSpot,
  };
}

function buildPokemonPayload({
  member,
  detail,
  level,
  boosts,
  curHP,
  status,
  toxicCounter,
  teraType,
  isDynamaxed,
  alliesFainted,
  isChampions,
}: AnyRecord) {
  return {
    pokemonId: member.pokemonId || "",
    formId: member.formId || "",
    formKey: member.formKey || "",
    name: member.nameZh || detail?.nameZh || "",
    level: Number(level || 50),
    nature: member.nature || "认真",
    abilityId: member.abilityId || "",
    ability: member.abilityName || "",
    itemId: member.itemId || "",
    item: member.itemName || "",
    evs: resolveEvs(member, isChampions),
    ivs: member.ivs || {},
    boosts: Object.values(boosts).some((v) => v !== 0) ? boosts : undefined,
    curHP: curHP > 0 ? curHP : undefined,
    status: status !== "none" ? status : "",
    toxicCounter: status === "tox" ? toxicCounter : undefined,
    teraType: teraType !== "none" ? teraType : undefined,
    isDynamaxed: isDynamaxed || undefined,
    alliesFainted: alliesFainted > 0 ? alliesFainted : undefined,
  };
}

export function buildDamageRequest(state: AnyRecord) {
  const isReverse = state.calcDirection === "def";
  const realAttacker = isReverse ? state.defender : state.attacker;
  const realDefender = isReverse ? state.attacker : state.defender;
  const realAtkDetail = isReverse ? state.defenderDetail : state.attackerDetail;
  const realDefDetail = isReverse ? state.attackerDetail : state.defenderDetail;
  const realAtkSideValues = isReverse ? state.defSide : state.atkSide;
  const realDefSideValues = isReverse ? state.atkSide : state.defSide;
  const realCritical = isReverse ? state.defCritical : state.critical;
  const realMoveHits = isReverse ? state.defMoveHits : state.moveHits;
  const realUseZ = isReverse ? state.defUseZ : state.useZ;
  const realUseMax = isReverse ? state.defUseMax : state.useMax;
  const realTimesUsed = isReverse ? state.defTimesUsed : state.timesUsed;
  const realTimesUsedWithMetronome = isReverse ? state.defTimesUsedWithMetronome : state.timesUsedWithMetronome;
  const realIsStellarFirstUse = isReverse ? state.defIsStellarFirstUse : state.isStellarFirstUse;
  const realAtkTeraType = isReverse ? state.defTeraType : state.atkTeraType;
  const realDefTeraType = isReverse ? state.atkTeraType : state.defTeraType;

  return {
    payload: {
      generation: Number(state.generation),
      attacker: buildPokemonPayload({
        member: realAttacker,
        detail: realAtkDetail,
        level: state.level,
        boosts: realAtkSideValues.boost,
        curHP: realAtkSideValues.curHP,
        status: realAtkSideValues.status,
        toxicCounter: realAtkSideValues.toxicCounter,
        teraType: realAtkTeraType,
        isDynamaxed: realAtkSideValues.isDynamaxed,
        alliesFainted: realAtkSideValues.alliesFainted,
        isChampions: state.isChampions,
      }),
      defender: buildPokemonPayload({
        member: realDefender,
        detail: realDefDetail,
        level: state.level,
        boosts: realDefSideValues.boost,
        curHP: realDefSideValues.curHP,
        status: realDefSideValues.status,
        toxicCounter: realDefSideValues.toxicCounter,
        teraType: realDefTeraType,
        isDynamaxed: realDefSideValues.isDynamaxed,
        alliesFainted: realDefSideValues.alliesFainted,
        isChampions: state.isChampions,
      }),
      move: {
        id: state.selectedMove.id || "",
        name: state.selectedMove.nameZh || state.selectedMove.slug || "",
        isCrit: realCritical,
        hits: realMoveHits > 0 ? realMoveHits : undefined,
        useZ: realUseZ || undefined,
        useMax: realUseMax || undefined,
        timesUsed: realTimesUsed > 0 ? realTimesUsed : undefined,
        timesUsedWithMetronome: realTimesUsedWithMetronome > 0 ? realTimesUsedWithMetronome : undefined,
        isStellarFirstUse: realIsStellarFirstUse || undefined,
      },
      field: {
        gameType: state.battleMode,
        weather: state.weather,
        terrain: state.terrain,
        isGravity: state.gravity,
        isMagicRoom: state.magicRoom,
        isWonderRoom: state.wonderRoom,
        isBeadsOfRuin: state.beadsOfRuin,
        isTabletsOfRuin: state.tabletsOfRuin,
        isSwordOfRuin: state.swordOfRuin,
        isVesselOfRuin: state.vesselOfRuin,
        attackerSide: buildSideState(realAtkSideValues, "out"),
        defenderSide: buildSideState(realDefSideValues, "in"),
      },
    },
    meta: {
      selectedMove: state.selectedMove,
      generation: state.generation,
      calcDirection: state.calcDirection,
      isReverse,
      realAttacker,
      realDefender,
    },
  };
}

export function buildDamageResult(data: AnyRecord, meta: AnyRecord) {
  const record = resolveMoveGenerationRecord(meta.selectedMove, meta.generation);
  const moveType = record?.type || meta.selectedMove.type || "";
  const category = record?.category || meta.selectedMove.category || "physical";

  return {
    min: data.min,
    max: data.max,
    average: data.average,
    description: data.description || "",
    damageRolls: data.damageRolls || [],
    moveName: meta.selectedMove.nameZh || meta.selectedMove.slug || "",
    moveType,
    category,
    attackerName: meta.realAttacker.nameZh || (meta.isReverse ? "防守方" : "攻击方"),
    defenderName: meta.realDefender.nameZh || (meta.isReverse ? "攻击方" : "防守方"),
    defHp: data.defenderHp || 0,
    minPercent: data.minPercent || 0,
    maxPercent: data.maxPercent || 0,
    direction: meta.calcDirection,
  };
}
