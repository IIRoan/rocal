import React from "react";
import { NavigationHeader } from "./layout";

interface StackScreenHeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

/** @see NavigationHeader */
export function StackScreenHeader({
  title,
  onBack,
  rightAction,
}: StackScreenHeaderProps) {
  return (
    <NavigationHeader
      variant="stack"
      title={title}
      onBack={onBack}
      trailing={rightAction}
    />
  );
}
