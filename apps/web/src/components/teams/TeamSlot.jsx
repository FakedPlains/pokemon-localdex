import { useMemo } from "react";
import CustomSelect from "../CustomSelect.jsx";
import PokemonConfigCard from "../PokemonConfigCard.jsx";

export default function TeamSlot({ slot, member, boxConfigs, onSelectFromBox, onRemove, onInlineEdit, onEditMember }) {
  const hasMember = member && member.pokemonId;
  const boxOptions = useMemo(
    () => boxConfigs.map((c) => ({ value: c.configId, label: c.configName || c.nameZh || c.pokemonId || "未命名" })),
    [boxConfigs]
  );

  if (!hasMember) {
    return (
      <div className="te-slot te-slot-empty" onClick={() => onInlineEdit(slot)}>
        <div className="te-slot-empty-inner">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
          <span className="te-slot-empty-text">位置 {slot}</span>
          <CustomSelect
            className="te-slot-select"
            value=""
            placeholder="从盒子选择…"
            options={boxOptions}
            onChange={(val) => { if (val) onSelectFromBox(slot, val); }}
          />
        </div>
      </div>
    );
  }

  const menuActions = [
    { label: "编辑", onClick: () => onEditMember(slot, member) },
    { label: "移除", onClick: () => onRemove(slot), className: "danger-text" },
  ];

  return <PokemonConfigCard data={member} menuActions={menuActions} className="te-member-card" />;
}
