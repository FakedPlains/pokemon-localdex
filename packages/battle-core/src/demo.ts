import { calculateDamage } from "./index.ts";

const result = calculateDamage({
  level: 50,
  power: 90,
  attack: 182,
  defense: 120,
  stab: 1.5,
  typeEffectiveness: 2,
  weather: 1,
  critical: 1,
  other: 1
});

console.log("Damage demo:", result);
