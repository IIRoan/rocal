import * as React from "react";
interface ColorPickerProps {
    value: string;
    onChange: (color: string) => void;
    presetColors?: string[];
    className?: string;
}
export declare function ColorPicker({ value, onChange, presetColors, className, }: ColorPickerProps): React.JSX.Element;
export {};
//# sourceMappingURL=color-picker.d.ts.map