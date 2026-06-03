interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  id?: string;
  value: string;
  options: CustomSelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

declare function CustomSelect(props: CustomSelectProps): React.JSX.Element;
export default CustomSelect;
