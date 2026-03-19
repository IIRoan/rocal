import * as React from "react";
import { Image, type ImageProps, Text, View } from "react-native";

import { cn } from "@workspace/ui/lib/utils";

type AvatarContextValue = {
  showFallback: boolean;
  setShowFallback: React.Dispatch<React.SetStateAction<boolean>>;
};

const AvatarContext = React.createContext<AvatarContextValue | null>(null);

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof View>) {
  const [showFallback, setShowFallback] = React.useState(true);

  return (
    <AvatarContext.Provider value={{ showFallback, setShowFallback }}>
      <View
        className={cn(
          "relative flex size-8 shrink-0 overflow-hidden rounded-full",
          className,
        )}
        {...props}
      />
    </AvatarContext.Provider>
  );
}

function AvatarImage({
  className,
  onError,
  onLoad,
  ...props
}: ImageProps & { className?: string }) {
  const context = React.useContext(AvatarContext);

  return (
    <Image
      className={cn("aspect-square size-full", className)}
      onError={(event) => {
        context?.setShowFallback(true);
        onError?.(event);
      }}
      onLoad={(event) => {
        context?.setShowFallback(false);
        onLoad?.(event);
      }}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  children,
  ...props
}: React.ComponentProps<typeof View>) {
  const context = React.useContext(AvatarContext);

  if (!context?.showFallback) {
    return null;
  }

  return (
    <View
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className,
      )}
      {...props}
    >
      {typeof children === "string" || typeof children === "number" ? (
        <Text>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

export { Avatar, AvatarImage, AvatarFallback };
