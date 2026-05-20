import { useReducer, useCallback } from "react";

export type FieldKey =
  | "weather"
  | "terrain"
  | "gravity"
  | "magicRoom"
  | "wonderRoom"
  | "beadsOfRuin"
  | "tabletsOfRuin"
  | "swordOfRuin"
  | "vesselOfRuin";

export type FieldState = {
  weather: string;
  terrain: string;
  gravity: boolean;
  magicRoom: boolean;
  wonderRoom: boolean;
  beadsOfRuin: boolean;
  tabletsOfRuin: boolean;
  swordOfRuin: boolean;
  vesselOfRuin: boolean;
};

type FieldAction =
  | { type: "set"; key: FieldKey; value: FieldState[FieldKey] }
  | { type: "toggle"; key: FieldKey }
  | { type: "reset" };

const initialFieldState: FieldState = {
  weather: "none",
  terrain: "none",
  gravity: false,
  magicRoom: false,
  wonderRoom: false,
  beadsOfRuin: false,
  tabletsOfRuin: false,
  swordOfRuin: false,
  vesselOfRuin: false,
};

function fieldReducer(state: FieldState, action: FieldAction): FieldState {
  switch (action.type) {
    case "set":
      return { ...state, [action.key]: action.value };
    case "toggle":
      return { ...state, [action.key]: !state[action.key] };
    case "reset":
      return { ...initialFieldState };
  }
}

export default function useFieldState() {
  const [field, dispatch] = useReducer(fieldReducer, initialFieldState);

  const setField = useCallback(
    (key: FieldKey, value: FieldState[FieldKey]) => dispatch({ type: "set", key, value }),
    [],
  );
  const toggleField = useCallback(
    (key: FieldKey) => dispatch({ type: "toggle", key }),
    [],
  );
  const resetField = useCallback(() => dispatch({ type: "reset" }), []);

  return { field, setField, toggleField, resetField };
}
