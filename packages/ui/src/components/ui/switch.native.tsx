import * as React from "react";
import { Pressable, View } from "react-native";

import { cn } from "@workspace/ui/lib/utils";

interface SwitchProps extends React.ComponentProps<typeof Pressable> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

function Switch({
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  onPress,
  ...props
}: SwitchProps) {
  const [uncontrolledChecked, setUncontrolledChecked] = React.useState(
    defaultChecked ?? false,
  );

  const isChecked = checked ?? uncontrolledChecked;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: isChecked, disabled: Boolean(disabled) }}
      className={cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent shadow-xs transition-colors duration-200 ease-out outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        isChecked ? "bg-primary" : "bg-input dark:bg-input/80",
        "min-h-11 min-w-11",
        className,
      )}
      disabled={disabled}
      hitSlop={4}
      {...props}
      onPress={(event) => {
        const nextChecked = !isChecked;
        setUncontrolledChecked(nextChecked);
        onCheckedChange?.(nextChecked);
        onPress?.(event);
      }}
    >
      <View
        className={cn(
          "bg-white dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
          isChecked
            ? "translate-x-4 dark:bg-primary-foreground"
            : "translate-x-0 dark:bg-foreground",
        )}
      />
    </Pressable>
  );
}

export { Switch };
