import { useState } from "react";
import "./CustomToggleSwitch.css";

interface CustomToggleSwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

export function CustomToggleSwitch({ checked = false, onChange }: CustomToggleSwitchProps) {
  const [isChecked, setIsChecked] = useState(checked);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setIsChecked(newValue);
    onChange?.(newValue);
  };

  return (
    <label className="switch">
      <input 
        type="checkbox" 
        checked={isChecked}
        onChange={handleChange}
      />
      <span className="slider">
        <div className="slider-btn">
          <div className="light"></div>
        </div>
      </span>
    </label>
  );
}
