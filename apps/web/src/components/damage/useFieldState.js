import { useReducer, useCallback } from "react";

const initialFieldState = {
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

function fieldReducer(state, action) {
  switch (action.type) {
    case "set":
      return { ...state, [action.key]: action.value };
    case "toggle":
      return { ...state, [action.key]: !state[action.key] };
    case "reset":
      return { ...initialFieldState };
    default:
      return state;
  }
}

export default function useFieldState() {
  const [field, dispatch] = useReducer(fieldReducer, initialFieldState);

  const setField = useCallback(
    (key, value) => dispatch({ type: "set", key, value }),
    [],
  );
  const toggleField = useCallback(
    (key) => dispatch({ type: "toggle", key }),
    [],
  );
  const resetField = useCallback(() => dispatch({ type: "reset" }), []);

  return { field, setField, toggleField, resetField };
}
