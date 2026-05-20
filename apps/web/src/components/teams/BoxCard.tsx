import PokemonConfigCard from "../PokemonConfigCard";
import type { PokemonConfigDisplay, MenuAction } from "./types";

export type { MenuAction } from "./types";

export interface BoxCardProps {
  config: PokemonConfigDisplay;
  onEdit: (config: PokemonConfigDisplay) => void;
  onDelete: (configId: string) => void;
  onDuplicate: (configId: string) => void;
}

export default function BoxCard({ config, onEdit, onDelete, onDuplicate }: BoxCardProps) {
  const menuActions: MenuAction[] = [
    { label: "编辑", onClick: () => onEdit(config) },
    { label: "复制", onClick: () => onDuplicate(config.configId) },
    { label: "删除", onClick: () => onDelete(config.configId), className: "danger-text" },
  ];

  return <PokemonConfigCard data={config} menuActions={menuActions} />;
}
