interface ViewToggleProps {
  mode: "card" | "list";
  onChange: (mode: "card" | "list") => void;
}

declare function ViewToggle(props: ViewToggleProps): React.JSX.Element;
export default ViewToggle;
