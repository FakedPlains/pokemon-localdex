import { forwardRef, useCallback } from "react";
import PokemonEditor from "../PokemonEditor";
import PokemonPickerList from "../PokemonPickerList";
import { getPokemonPreviewImage } from "../../utils/helpers";
import type { PokemonConfigEditState } from "./types";
import type { PokemonConfigDraft } from "../../utils/teamStorage";
import type { PokemonSummary } from "@pokemon-localdex/store-types";

export interface PokemonConfigInlineEditorProps {
  className?: string;
  title: string;
  config: PokemonConfigEditState;
  pickerSearch: string;
  onPickerSearchChange: (search: string) => void;
  onChange: (updater: PokemonConfigEditState | ((prev: PokemonConfigEditState) => PokemonConfigEditState)) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
}

const PokemonConfigInlineEditor = forwardRef<HTMLDivElement, PokemonConfigInlineEditorProps>(function PokemonConfigInlineEditor({
  className = "cfg-inline-wrap",
  title,
  config,
  pickerSearch,
  onPickerSearchChange,
  onChange,
  onSave,
  onCancel,
  saveLabel,
}, ref) {
  const handleSelectPokemon = (pokemon: PokemonSummary) => {
    const img = getPokemonPreviewImage(pokemon);
    onChange({
      ...config,
      pokemonId: String(pokemon.id),
      nameZh: pokemon.nameZh || "",
      primaryType: pokemon.primaryType || "",
      secondaryType: pokemon.secondaryType || "",
      imageUrl: img || "",
    });
    onPickerSearchChange("");
  };

  const handleChangePokemon = () => {
    onChange({
      ...config,
      pokemonId: "",
      nameZh: "",
      formKey: "",
      formName: "",
    });
    onPickerSearchChange("");
  };

  /** 适配 PokemonEditor 的 onChange（PokemonConfigDraft）到父级 onChange（PokemonConfigEditState） */
  const handleEditorChange = useCallback((updater: PokemonConfigDraft | ((prev: PokemonConfigDraft) => PokemonConfigDraft)) => {
    if (typeof updater === "function") {
      onChange((prev) => ({ ...prev, ...updater(prev) }));
    } else {
      onChange((prev) => ({ ...prev, ...updater }));
    }
  }, [onChange]);

  return (
    <div className={className} ref={ref}>
      <div className="cfg-toolbar">
        <strong>{title}</strong>
        {!config.pokemonId ? (
          <div className="cfg-toolbar-search">
            <svg className="cfg-toolbar-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" />
            </svg>
            <input
              className="cfg-toolbar-search-input"
              placeholder="搜索宝可梦名称 / 编号…"
              value={pickerSearch}
              onChange={(e) => onPickerSearchChange(e.target.value)}
              autoFocus
            />
            {pickerSearch && (
              <button className="cfg-toolbar-search-clear" onClick={() => onPickerSearchChange("")}>✕</button>
            )}
          </div>
        ) : (
          <div className="cfg-toolbar-pokemon">
            <span className="cfg-toolbar-pokemon-name">{config.nameZh || config.pokemonId}</span>
            <span id="cfg-form-slider-portal"></span>
            <button className="cfg-toolbar-pokemon-change" onClick={handleChangePokemon}>更换</button>
          </div>
        )}
        <input
          className="cfg-toolbar-name"
          value={config.configName || ""}
          onChange={(e) => onChange({ ...config, configName: e.target.value })}
          placeholder="配置名称"
        />
        <button className="cfg-toolbar-cancel" onClick={onCancel}>取消</button>
      </div>

      {!config.pokemonId ? (
        <PokemonPickerList search={pickerSearch} onSelect={handleSelectPokemon} />
      ) : (
        <PokemonEditor
          config={config}
          onChange={handleEditorChange}
          onSave={onSave}
          onCancel={onCancel}
          saveLabel={saveLabel}
        />
      )}
    </div>
  );
});

export default PokemonConfigInlineEditor;
