"use client";

import { useId } from "react";

import { PaletteField } from "./palette-ui";
import { PALETTE_INPUT_CLASS } from "./palette-styles";

export function FieldInput({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <PaletteField label={label} htmlFor={id}>
      <input
        id={id}
        aria-label={label}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={disabled}
        className={PALETTE_INPUT_CLASS}
      />
    </PaletteField>
  );
}
