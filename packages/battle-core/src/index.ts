export type AttackCategory = "physical" | "special";

export type DamageInput = {
  level: number;
  power: number;
  attack: number;
  defense: number;
  stab?: number;
  typeEffectiveness?: number;
  weather?: number;
  critical?: number;
  randomMin?: number;
  randomMax?: number;
  other?: number;
};

export type DamageRange = {
  min: number;
  max: number;
  average: number;
};

export function calculateDamage(input: DamageInput): DamageRange {
  const stab = input.stab ?? 1;
  const typeEffectiveness = input.typeEffectiveness ?? 1;
  const weather = input.weather ?? 1;
  const critical = input.critical ?? 1;
  const other = input.other ?? 1;
  const randomMin = input.randomMin ?? 0.85;
  const randomMax = input.randomMax ?? 1;

  const base =
    Math.floor(
      Math.floor(
        Math.floor((2 * input.level) / 5 + 2) * input.power * input.attack / Math.max(1, input.defense)
      ) / 50
    ) + 2;

  const min = Math.floor(base * stab * typeEffectiveness * weather * critical * other * randomMin);
  const max = Math.floor(base * stab * typeEffectiveness * weather * critical * other * randomMax);

  return {
    min,
    max,
    average: Number(((min + max) / 2).toFixed(2))
  };
}
