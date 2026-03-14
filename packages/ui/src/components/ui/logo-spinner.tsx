"use client";

import { cn } from "../../lib/utils";
import { default as Logo } from "../layout/logo";
import { useCyclingMessage } from "../../hooks/use-cycling-message";
import type { COMBINED_MESSAGES } from "../../constants/loading-messages";

interface LogoSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showText?: boolean;
  text?: string;
  messageContext?: keyof typeof COMBINED_MESSAGES;
  enableCycling?: boolean;
}

export function LogoSpinner({
  size = "md",
  className,
  showText = true,
  text,
  messageContext = "PAGE_LOAD",
  enableCycling = true,
}: LogoSpinnerProps) {
  // Use cycling messages if no static text provided
  const { message, isTransitioning } = useCyclingMessage({
    context: messageContext,
    enabled: enableCycling && !text && showText,
  });

  // Use static text if provided, otherwise use cycling message
  const displayText = text || message;

  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-12 w-12",
    lg: "h-16 w-16",
    xl: "h-20 w-20",
  };

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* Logo with subtle pulse */}
      <Logo
        className={cn("text-primary animate-pulse", sizeClasses[size])}
        fill="currentColor"
        style={{ animationDuration: "2s" }}
      />

      {/* Loading text */}
      {showText && (
        <div className="flex flex-col items-center gap-1.5">
          <p
            className={cn(
              "text-sm font-medium text-muted-foreground transition-opacity duration-300",
              isTransitioning && enableCycling && !text
                ? "opacity-50"
                : "opacity-100",
            )}
          >
            {displayText}
          </p>
        </div>
      )}
    </div>
  );
}

// Page loading overlay with logo spinner
interface PageLoadingOverlayProps {
  isLoading?: boolean;
  message?: string;
  messageContext?: keyof typeof COMBINED_MESSAGES;
  className?: string;
  enableCycling?: boolean;
}

export function PageLoadingOverlay({
  isLoading = true,
  message,
  messageContext = "PAGE_LOAD",
  className,
  enableCycling = true,
}: PageLoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm",
        "animate-fade-in",
        className,
      )}
    >
      <LogoSpinner
        size="lg"
        text={message}
        messageContext={messageContext}
        enableCycling={enableCycling}
      />
    </div>
  );
}

// Small inline loader for components
interface InlineLogoSpinnerProps {
  className?: string;
  size?: "sm" | "md";
  text?: string;
  messageContext?: keyof typeof COMBINED_MESSAGES;
  enableCycling?: boolean;
}

export function InlineLogoSpinner({
  className,
  size = "sm",
  text,
  messageContext = "PAGE_LOAD",
  enableCycling = false,
}: InlineLogoSpinnerProps) {
  // Use cycling messages if no static text provided
  const { message, isTransitioning } = useCyclingMessage({
    context: messageContext,
    enabled: enableCycling && !text,
    cycleInterval: 3000,
  });

  const displayText = text || message;

  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Logo
        className={cn("text-primary animate-pulse", sizeClasses[size])}
        fill="currentColor"
        style={{ animationDuration: "2s" }}
      />
      <span
        className={cn(
          "text-sm text-muted-foreground transition-opacity duration-300",
          isTransitioning && enableCycling && !text
            ? "opacity-50"
            : "opacity-100",
        )}
      >
        {displayText}
      </span>
    </div>
  );
}
