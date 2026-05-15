import PokemonConfigCard from "../PokemonConfigCard.jsx";

export default function BoxCard({ config, onEdit, onDelete, onDuplicate }) {
  const menuActions = [
    { label: "编辑", onClick: () => onEdit(config) },
    { label: "复制", onClick: () => onDuplicate(config.configId) },
    { label: "删除", onClick: () => onDelete(config.configId), className: "danger-text" },
  ];

  return <PokemonConfigCard data={config} menuActions={menuActions} />;
}
