"use client";

import type { COMBINED_MESSAGES } from "../../constants/loading-messages";
import { cn } from "../../lib/utils";
import { InlineLogoSpinner } from "./logo-spinner";

type AppLoadingStateVariant = "inline" | "inline-icon" | "centered";

interface AppLoadingStateProps {
  variant?: AppLoadingStateVariant;
  size?: "sm" | "md";
  text?: string;
  messageContext?: keyof typeof COMBINED_MESSAGES;
  enableCycling?: boolean;
  className?: string;
  spinnerClassName?: string;
}

export function AppLoadingState({
  variant = "inline",
  size,
  text,
  messageContext = "PAGE_LOAD",
  enableCycling = false,
  className,
  spinnerClassName,
}: AppLoadingStateProps) {
  const resolvedSize = size ?? (variant === "centered" ? "md" : "sm");
  const spinner = (
    <InlineLogoSpinner
      size={resolvedSize}
      text={text}
      messageContext={messageContext}
      enableCycling={enableCycling}
      showText={variant !== "inline-icon"}
      className={spinnerClassName}
    />
  );

  if (variant === "centered") {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-muted-foreground",
          className,
        )}
      >
        {spinner}
      </div>
    );
  }

  return <div className={className}>{spinner}</div>;
}
