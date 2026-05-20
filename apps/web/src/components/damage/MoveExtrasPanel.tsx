import type { Dispatch, SetStateAction } from "react";

export interface MoveExtrasPanelProps {
  generation: string | number;
  critical: boolean;
  setCritical: Dispatch<SetStateAction<boolean>>;
  moveHits: number;
  setMoveHits: Dispatch<SetStateAction<number>>;
  timesUsed: number;
  setTimesUsed: Dispatch<SetStateAction<number>>;
  useZ: boolean;
  setUseZ: Dispatch<SetStateAction<boolean>>;
  useMax: boolean;
  setUseMax: Dispatch<SetStateAction<boolean>>;
  teraType: string;
  isStellarFirstUse: boolean;
  setIsStellarFirstUse: Dispatch<SetStateAction<boolean>>;
  itemName: string;
  itemId: string;
  timesUsedWithMetronome: number;
  setTimesUsedWithMetronome: Dispatch<SetStateAction<number>>;
}

function clampMoveCount(value: string | number): number {
  return Math.max(0, Math.min(10, Number(value) || 0));
}

export default function MoveExtrasPanel({
  generation,
  critical,
  setCritical,
  moveHits,
  setMoveHits,
  timesUsed,
  setTimesUsed,
  useZ,
  setUseZ,
  useMax,
  setUseMax,
  teraType,
  isStellarFirstUse,
  setIsStellarFirstUse,
  itemName,
  itemId,
  timesUsedWithMetronome,
  setTimesUsedWithMetronome,
}: MoveExtrasPanelProps) {
  const gen = Number(generation);
  const hasMetronome = itemName === "节拍器" || itemId === "item-节拍器";

  return (
    <>
      <div className="dc-move-extras">
        <button className={"dc-chip" + (critical ? " dc-chip-on" : "")} onClick={() => setCritical(!critical)}>暴击</button>
        <span className="dc-move-extras-sep">|</span>
        <span className="dc-move-extras-label">连击</span>
        <input type="number" className="dc-hits-input" min={0} max={10} value={moveHits} onChange={(e) => setMoveHits(clampMoveCount(e.target.value))} />
        <span className="dc-hits-hint">{moveHits === 0 ? "默认" : `${moveHits}次`}</span>
        <span className="dc-move-extras-sep">|</span>
        <span className="dc-move-extras-label">已用</span>
        <input type="number" className="dc-hits-input" min={0} max={10} value={timesUsed} onChange={(e) => setTimesUsed(clampMoveCount(e.target.value))} />
      </div>
      <div className="dc-move-extras">
        {gen === 7 && (
          <button className={"dc-chip" + (useZ ? " dc-chip-on" : "")} onClick={() => setUseZ(!useZ)}>Z招式</button>
        )}
        {gen === 8 && (
          <button className={"dc-chip" + (useMax ? " dc-chip-on" : "")} onClick={() => setUseMax(!useMax)}>极巨招式</button>
        )}
        {teraType === "星晶" && (
          <button className={"dc-chip" + (isStellarFirstUse ? " dc-chip-on" : "")} onClick={() => setIsStellarFirstUse(!isStellarFirstUse)}>星晶首次</button>
        )}
        {hasMetronome && (
          <>
            <span className="dc-move-extras-sep">|</span>
            <span className="dc-move-extras-label">节拍器</span>
            <input type="number" className="dc-hits-input" min={0} max={10} value={timesUsedWithMetronome} onChange={(e) => setTimesUsedWithMetronome(clampMoveCount(e.target.value))} />
          </>
        )}
      </div>
    </>
  );
}
