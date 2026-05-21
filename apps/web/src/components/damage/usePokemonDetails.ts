import { useEffect, useState } from "react";
import type { PokemonEntry } from "@pokemon-localdex/store-types";
import { api } from "../../utils/api";
import type { DataResponse } from "../../utils/apiTypes";

function usePokemonDetail(pokemonId: number | null) {
  const [detail, setDetail] = useState<PokemonEntry | null>(null);

  useEffect(() => {
    if (!pokemonId) { setDetail(null); return; }
    let cancelled = false;
    api<DataResponse<PokemonEntry>>(`/pokemon/${pokemonId}`).then((r) => {
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
