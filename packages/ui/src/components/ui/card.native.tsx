import * as React from "react";
import { Text, View } from "react-native";

import { cn } from "@workspace/ui/lib/utils";

interface CardProps extends React.ComponentProps<typeof View> {
  hoverable?: boolean;
  animated?: boolean;
  children?: React.ReactNode;
}

function Card({
  className,
  hoverable = false,
  animated = true,
  ...props
}: CardProps) {
  return (
    <View
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm transition-all duration-200 ease-out",
        hoverable &&
          "hover:shadow-md hover:scale-[1.02] hover:-translate-y-1 cursor-pointer",
        animated && "animate-fade-in",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<typeof View>) {
  return (
    <View
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text className={cn("leading-none font-semibold", className)} {...props}>
      {children}
    </Text>
  );
}

function CardDescription({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text className={cn("text-muted-foreground text-sm", className)} {...props}>
      {children}
    </Text>
  );
}

function CardAction({ className, ...props }: React.ComponentProps<typeof View>) {
  return (
    <View
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn("px-6", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<typeof View>) {
  return (
    <View className={cn("flex items-center px-6 [.border-t]:pt-6", className)} {...props} />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
