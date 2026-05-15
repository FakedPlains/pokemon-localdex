import { useCallback, useMemo, useState } from "react";
import { DEFAULT_BOOSTS } from "./damageConstants.js";

type DamageSideValues = {
  curHP: number;
  status: string;
  toxicCounter: number;
  stealthRock: boolean;
  spikes: number;
  steelsurge: boolean;
  reflect: boolean;
  lightScreen: boolean;
  auroraVeil: boolean;
  protect: boolean;
  helpingHand: boolean;
  tailwind: boolean;
  friendGuard: boolean;
  boost: Record<string, number>;
  switchingOut: boolean;
  seeded: boolean;
  saltCured: boolean;
  foresight: boolean;
  flowerGift: boolean;
  powerTrick: boolean;
  steelySpirit: boolean;
  battery: boolean;
  powerSpot: boolean;
  isDynamaxed: boolean;
  alliesFainted: number;
};

export default function useDamageSideState() {
  const [curHP, setCurHP] = useState(0);
  const [status, setStatus] = useState("none");
  const [toxicCounter, setToxicCounter] = useState(0);
  const [stealthRock, setStealthRock] = useState(false);
  const [spikes, setSpikes] = useState(0);
  const [steelsurge, setSteelsurge] = useState(false);
  const [reflect, setReflect] = useState(false);
  const [lightScreen, setLightScreen] = useState(false);
  const [auroraVeil, setAuroraVeil] = useState(false);
  const [protect, setProtect] = useState(false);
  const [helpingHand, setHelpingHand] = useState(false);
  const [tailwind, setTailwind] = useState(false);
  const [friendGuard, setFriendGuard] = useState(false);
  const [boost, setBoost] = useState<Record<string, number>>({ ...DEFAULT_BOOSTS });
  const [switchingOut, setSwitchingOut] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [saltCured, setSaltCured] = useState(false);
  const [foresight, setForesight] = useState(false);
  const [flowerGift, setFlowerGift] = useState(false);
  const [powerTrick, setPowerTrick] = useState(false);
  const [steelySpirit, setSteelySpirit] = useState(false);
  const [battery, setBattery] = useState(false);
  const [powerSpot, setPowerSpot] = useState(false);
  const [isDynamaxed, setIsDynamaxed] = useState(false);
  const [alliesFainted, setAlliesFainted] = useState(0);

  const onBoostChange = useCallback((key: string, val: number) => {
    setBoost((prev) => ({ ...prev, [key]: Math.max(-6, Math.min(6, val)) }));
  }, []);

  const clearBattleSpecials = useCallback(() => {
    setIsDynamaxed(false);
    setAlliesFainted(0);
  }, []);

  const values = useMemo<DamageSideValues>(() => ({
    curHP,
    status,
    toxicCounter,
    stealthRock,
    spikes,
    steelsurge,
    reflect,
    lightScreen,
    auroraVeil,
    protect,
    helpingHand,
    tailwind,
    friendGuard,
    boost,
    switchingOut,
    seeded,
    saltCured,
    foresight,
    flowerGift,
    powerTrick,
    steelySpirit,
    battery,
    powerSpot,
    isDynamaxed,
    alliesFainted,
  }), [
    curHP,
    status,
    toxicCounter,
    stealthRock,
    spikes,
    steelsurge,
    reflect,
    lightScreen,
    auroraVeil,
    protect,
    helpingHand,
    tailwind,
    friendGuard,
    boost,
    switchingOut,
    seeded,
    saltCured,
    foresight,
    flowerGift,
    powerTrick,
    steelySpirit,
    battery,
    powerSpot,
    isDynamaxed,
    alliesFainted,
  ]);

  const panelProps = {
    status, setStatus,
    toxicCounter, setToxicCounter,
    stealthRock, setStealthRock,
    spikes, setSpikes,
    steelsurge, setSteelsurge,
    reflect, setReflect,
    lightScreen, setLightScreen,
    auroraVeil, setAuroraVeil,
    protect, setProtect,
    helpingHand, setHelpingHand,
    tailwind, setTailwind,
    friendGuard, setFriendGuard,
    switchingOut, setSwitchingOut,
    seeded, setSeeded,
    saltCured, setSaltCured,
    foresight, setForesight,
    flowerGift, setFlowerGift,
    powerTrick, setPowerTrick,
    steelySpirit, setSteelySpirit,
    battery, setBattery,
    powerSpot, setPowerSpot,
    isDynamaxed, setIsDynamaxed,
    alliesFainted, setAlliesFainted,
  };

  return {
    values,
    panelProps,
    recalcKey: JSON.stringify(values),
    setCurHP,
    onBoostChange,
    clearBattleSpecials,
  };
}
