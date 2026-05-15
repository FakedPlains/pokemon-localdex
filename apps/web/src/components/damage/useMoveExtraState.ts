import { useCallback, useMemo, useState } from "react";

type MoveExtraValues = {
  critical: boolean;
  moveHits: number;
  timesUsed: number;
  useZ: boolean;
  useMax: boolean;
  isStellarFirstUse: boolean;
  timesUsedWithMetronome: number;
};

export default function useMoveExtraState() {
  const [critical, setCritical] = useState(false);
  const [moveHits, setMoveHits] = useState(0);
  const [timesUsed, setTimesUsed] = useState(0);
  const [useZ, setUseZ] = useState(false);
  const [useMax, setUseMax] = useState(false);
  const [isStellarFirstUse, setIsStellarFirstUse] = useState(false);
  const [timesUsedWithMetronome, setTimesUsedWithMetronome] = useState(0);

  const reset = useCallback(() => {
    setCritical(false);
    setMoveHits(0);
    setTimesUsed(0);
    setUseZ(false);
    setUseMax(false);
    setIsStellarFirstUse(false);
    setTimesUsedWithMetronome(0);
  }, []);

  const values = useMemo<MoveExtraValues>(() => ({
    critical,
    moveHits,
    timesUsed,
    useZ,
    useMax,
    isStellarFirstUse,
    timesUsedWithMetronome,
  }), [
    critical,
    moveHits,
    timesUsed,
    useZ,
    useMax,
    isStellarFirstUse,
    timesUsedWithMetronome,
  ]);

  return {
    values,
    panelProps: {
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
      isStellarFirstUse,
      setIsStellarFirstUse,
      timesUsedWithMetronome,
      setTimesUsedWithMetronome,
    },
    recalcKey: JSON.stringify(values),
    reset,
  };
}
