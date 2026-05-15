import { useEffect, useState } from "react";
import { unifiedApi } from "../../utils/api.js";

function usePokemonDetail(pokemonId) {
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!pokemonId) { setDetail(null); return; }
    let cancelled = false;
    unifiedApi(`/pokemon/${pokemonId}`).then((r) => {
      if (!cancelled) setDetail(r.data);
    }).catch(() => { if (!cancelled) setDetail(null); });
    return () => { cancelled = true; };
  }, [pokemonId]);

  return detail;
}

export default function usePokemonDetails(attackerPokemonId, defenderPokemonId) {
  return {
    attackerDetail: usePokemonDetail(attackerPokemonId),
    defenderDetail: usePokemonDetail(defenderPokemonId),
  };
}
