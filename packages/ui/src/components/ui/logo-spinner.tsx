"use client";

import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import { default as Logo } from "../layout/logo";
import { useCyclingMessage } from "../../hooks/use-cycling-message";
import type { COMBINED_MESSAGES } from "../../constants/loading-messages";

export const FORCE_LOADING_DESIGN_PREVIEW = false;

function getBootstrapLoadingDate(): Date | null {
  if (typeof document === "undefined") {
    return null;
  }

  const raw = document.documentElement.dataset.calendarBootstrapDate;
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

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

  const shellClasses = {
    sm: "h-12 w-12 rounded-xl",
    md: "h-16 w-16 rounded-2xl",
    lg: "h-20 w-20 rounded-[1.4rem]",
    xl: "h-24 w-24 rounded-[1.75rem]",
  };

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-[1.4rem] border border-border/80 bg-card shadow-sm",
          shellClasses[size],
        )}
      >
        <div className="absolute inset-[8px] rounded-[inherit] border border-border/50" />
        <Logo
          className={cn("relative text-primary animate-pulse", sizeClasses[size])}
          fill="currentColor"
          style={{ animationDuration: "2s" }}
        />
      </div>

      {showText && (
        <p
          className={cn(
            "text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground transition-opacity duration-300",
            isTransitioning && enableCycling && !text
              ? "opacity-50"
              : "opacity-100",
          )}
        >
          {displayText}
        </p>
      )}
    </div>
  );
}

interface LoadingBoardProps {
  message?: string;
  messageContext?: keyof typeof COMBINED_MESSAGES;
  enableCycling?: boolean;
}

function LoadingBoard({
  message,
  messageContext = "PAGE_LOAD",
  enableCycling = true,
}: LoadingBoardProps) {
  const [now] = useState<Date | null>(() => {
    const bootstrapDate = getBootstrapLoadingDate();
    if (bootstrapDate) {
      return bootstrapDate;
    }

    return typeof window === "undefined" ? null : new Date();
  });
  const { message: cyclingMessage, isTransitioning } = useCyclingMessage({
    context: messageContext,
    enabled: enableCycling && !message,
  });

  const displayText = message || cyclingMessage;
  const dayName = now?.toLocaleDateString("en-US", { weekday: "long" }) || "";
  const dayNum = now ? now.getDate().toString().padStart(2, "0") : "";
  const monthName = now?.toLocaleDateString("en-US", { month: "long" }) || "";
  const year = now?.getFullYear().toString() || "";

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden p-8 sm:p-14">
      {/* Top row: logo + wordmark left, day name right */}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo className="h-4 w-4 text-primary" fill="currentColor" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.5em] text-muted-foreground/40">
            Solace
          </span>
        </div>
        <span
          className="text-[9px] font-semibold uppercase tracking-[0.4em] text-muted-foreground/30"
          data-calendar-bootstrap="dayName"
          suppressHydrationWarning
        >
          {dayName}
        </span>
      </div>

      {/* Center: giant date number */}
      <div className="relative select-none text-center leading-none">
        <span
          className="block font-bold text-foreground/[0.07]"
          data-calendar-bootstrap="dayNum"
          suppressHydrationWarning
          style={{ fontSize: "clamp(140px, 38vw, 380px)", lineHeight: 1 }}
        >
          {dayNum}
        </span>
        {/* Month + year overlay, centered on the number */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span
            className="text-[clamp(22px,4vw,52px)] font-bold tracking-[-0.02em] text-foreground"
            data-calendar-bootstrap="monthName"
            suppressHydrationWarning
          >
            {monthName}
          </span>
          <span
            className="text-base font-medium text-muted-foreground/50"
            data-calendar-bootstrap="year"
            suppressHydrationWarning
          >
            {year}
          </span>
        </div>
      </div>

      {/* Bottom: status message + sweep line */}
      <div className="relative">
        <p
          className={cn(
            "mb-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 transition-opacity duration-300",
            isTransitioning && enableCycling && !message ? "opacity-20" : "opacity-100",
          )}
        >
          {displayText}
        </p>
        <div className="relative h-px w-full overflow-hidden bg-border/40">
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/80 to-transparent [animation:wave_2.4s_ease-in-out_infinite]" />
        </div>
      </div>
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
  /** Render above other overlays (z-[10000] vs z-[9999]) */
  priority?: boolean;
}

export function PageLoadingOverlay({
  isLoading = true,
  message,
  messageContext = "PAGE_LOAD",
  className,
  enableCycling = true,
  priority = false,
}: PageLoadingOverlayProps) {
  const [visible, setVisible] = useState(isLoading);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setVisible(true);
      setFading(false);
    } else {
      setFading(true);
      const t = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [isLoading]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 bg-background",
        priority ? "z-[10000]" : "z-[9999]",
        fading && "animate-out fade-out-0 fill-mode-forwards duration-300",
        className,
      )}
    >
      <LoadingBoard
        message={message}
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
