import { useEffect, useState } from "react";
import type { PokemonEntry } from "@pokemon-localdex/store-types";
import { unifiedApi } from "../../utils/api.js";

function usePokemonDetail(pokemonId: number | null) {
  const [detail, setDetail] = useState<PokemonEntry | null>(null);

  useEffect(() => {
    if (!pokemonId) { setDetail(null); return; }
    let cancelled = false;
    unifiedApi<PokemonEntry>(`/pokemon/${pokemonId}`).then((r) => {
      if (!cancelled) setDetail(r.data);
    }).catch(() => { if (!cancelled) setDetail(null); });
    return () => { cancelled = true; };
  }, [pokemonId]);

  return detail;
}

export default function usePokemonDetails(
  attackerPokemonId: number | null,
  defenderPokemonId: number | null,
) {
  return {
    attackerDetail: usePokemonDetail(attackerPokemonId),
    defenderDetail: usePokemonDetail(defenderPokemonId),
  };
}
