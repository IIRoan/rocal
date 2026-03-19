import * as React from "react";
import { Pressable, Text, View } from "react-native";

import { cn } from "@workspace/ui/lib/utils";

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

type TabsProps = React.ComponentProps<typeof View> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  children,
  ...props
}: TabsProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const currentValue = value ?? internalValue;

  const handleValueChange = React.useCallback(
    (nextValue: string) => {
      if (value === undefined) {
        setInternalValue(nextValue);
      }
      onValueChange?.(nextValue);
    },
    [onValueChange, value],
  );

  return (
    <TabsContext.Provider
      value={{ value: currentValue, onValueChange: handleValueChange }}
    >
      <View className={cn("flex flex-col gap-2", className)} {...props}>
        {children}
      </View>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof View>) {
  return (
    <View
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        className,
      )}
      {...props}
    />
  );
}

type TabsTriggerProps = React.ComponentProps<typeof Pressable> & {
  value: string;
};

function TabsTrigger({
  className,
  value,
  children,
  disabled,
  onPress,
  ...props
}: TabsTriggerProps) {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("TabsTrigger must be used within Tabs");
  }

  const isActive = context.value === value;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive, disabled: Boolean(disabled) }}
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:scale-105 dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-all duration-200 ease-out focus-visible:ring-[3px] focus-visible:outline-1 hover:bg-background/50 hover:scale-[1.02] hover:shadow-xs disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        isActive &&
          "bg-background shadow-sm dark:bg-input/30 dark:border-input dark:text-foreground",
        "min-h-11 min-w-11",
        className,
      )}
      disabled={disabled}
      hitSlop={4}
      {...props}
      onPress={(event) => {
        context.onValueChange(value);
        onPress?.(event);
      }}
    >
      {typeof children === "string" || typeof children === "number" ? (
        <Text className={cn(isActive ? "text-foreground" : "text-muted-foreground")}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

type TabsContentProps = React.ComponentProps<typeof View> & {
  value: string;
};

function TabsContent({
  className,
  value,
  children,
  ...props
}: TabsContentProps) {
  const context = React.useContext(TabsContext);
  if (!context || context.value !== value) {
    return null;
  }

  return (
    <View
      className={cn(
        "flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    >
      {children}
    </View>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
