"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { loopMotion } from "../../lib/motion";
import { cn } from "@workspace/ui/lib/utils";
import { default as Logo } from "../layout/logo";
import { useCyclingMessage } from "../../hooks/use-cycling-message";
import { usePrefersReducedMotion } from "../../hooks/use-prefers-reduced-motion";
import type { COMBINED_MESSAGES } from "../../constants/loading-messages";

export const FORCE_LOADING_DESIGN_PREVIEW = false;

const LOADING_NOW_TICK_MS = 60_000;
const loadingWeekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
});
const loadingMonthFormatter = new Intl.DateTimeFormat(undefined, {
  month: "long",
});

const loadingNowListeners = new Set<() => void>();
let loadingNowClient: Date | null = null;
let loadingNowIntervalId: number | null = null;

function subscribeLoadingNow(onStoreChange: () => void) {
  loadingNowListeners.add(onStoreChange);
  loadingNowClient ??= new Date();
  if (loadingNowIntervalId === null && typeof window !== "undefined") {
    loadingNowIntervalId = window.setInterval(() => {
      loadingNowClient = new Date();
      loadingNowListeners.forEach((listener) => listener());
    }, LOADING_NOW_TICK_MS);
  }
  return () => {
    loadingNowListeners.delete(onStoreChange);
    if (loadingNowListeners.size === 0) {
      if (loadingNowIntervalId !== null) {
        window.clearInterval(loadingNowIntervalId);
        loadingNowIntervalId = null;
      }
      loadingNowClient = null;
    }
  };
}

function getLoadingNowClient(): Date {
  loadingNowClient ??= new Date();
  return loadingNowClient;
}

function getLoadingNowServer(): null {
  return null;
}

function useLoadingNow(): Date | null {
  return useSyncExternalStore(
    subscribeLoadingNow,
    getLoadingNowClient,
    getLoadingNowServer,
  );
}

function getLoadingDateParts(now: Date | null) {
  if (!now) {
    return {
      dayName: "",
      dayNum: "",
      monthName: "",
      year: "",
    };
  }

  return {
    dayName: loadingWeekdayFormatter.format(now),
    dayNum: now.getDate().toString().padStart(2, "0"),
    monthName: loadingMonthFormatter.format(now),
    year: now.getFullYear().toString(),
  };
}

const LOGO_SPINNER_SIZE_CLASSES = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
  xl: "h-20 w-20",
} as const;

const LOGO_SPINNER_SHELL_CLASSES = {
  sm: "h-12 w-12 rounded-xl",
  md: "h-16 w-16 rounded-2xl",
  lg: "h-20 w-20 rounded-[1.4rem]",
  xl: "h-24 w-24 rounded-[1.75rem]",
} as const;

const INLINE_LOGO_SPINNER_SIZE_CLASSES = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
} as const;

const LOGO_PULSE: Keyframe[] = [
  { opacity: 1, transform: "scale(1)" },
  { opacity: 0.58, transform: "scale(1.04)" },
];

const LOADING_SWEEP: Keyframe[] = [
  { transform: "translateX(-120%)" },
  { transform: "translateX(120%)" },
];

function useLogoPulse() {
  const logoRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const logoNode = logoRef.current;
    if (!logoNode || prefersReducedMotion) return;
    const pulse = loopMotion(logoNode, LOGO_PULSE, { duration: 1200, alternate: true });
    return () => pulse?.cancel();
  }, [prefersReducedMotion]);

  return logoRef;
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
  const logoRef = useLogoPulse();

  const { message, isTransitioning } = useCyclingMessage({
    context: messageContext,
    enabled: enableCycling && !text && showText,
  });

  const displayText = text || message;

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-[1.4rem] border border-border/80 bg-card shadow-sm",
          LOGO_SPINNER_SHELL_CLASSES[size],
        )}
      >
        <div className="absolute inset-[8px] rounded-[inherit] border border-border/50" />
        <div ref={logoRef} className="relative">
          <Logo
            className={cn("relative text-accent", LOGO_SPINNER_SIZE_CLASSES[size])}
            fill="currentColor"
          />
        </div>
      </div>

      {showText && (
        <p
          className={cn(
            "text-xs font-medium uppercase tracking-widest text-muted-foreground transition-opacity duration-300",
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
  const sweepRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const now = useLoadingNow();
  const { message: cyclingMessage, isTransitioning } = useCyclingMessage({
    context: messageContext,
    enabled: enableCycling && !message,
  });

  const displayText = message || cyclingMessage;
  const { dayName, dayNum, monthName, year } = getLoadingDateParts(now);

  useEffect(() => {
    const sweepNode = sweepRef.current;
    if (!sweepNode || prefersReducedMotion) return;
    const sweep = loopMotion(sweepNode, LOADING_SWEEP, { duration: 2400 });
    return () => sweep?.cancel();
  }, [prefersReducedMotion]);

  return (
    <div
      aria-hidden="true"
      className="relative flex h-full flex-col justify-between overflow-hidden p-8 sm:p-14"
    >
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo className="size-4 text-accent" fill="currentColor" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.5em] text-muted-foreground/40">
            Solace
          </span>
        </div>
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.4em] text-muted-foreground/30"
          suppressHydrationWarning
        >
          {dayName}
        </span>
      </div>

      <div className="relative select-none text-center leading-none">
        <span
          className="block font-bold text-foreground/[0.07]"
          suppressHydrationWarning
          style={{ fontSize: "clamp(140px, 38vw, 380px)", lineHeight: 1 }}
        >
          {dayNum}
        </span>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span
            className="text-[clamp(22px,4vw,52px)] font-bold tracking-[-0.02em] text-foreground"
            suppressHydrationWarning
          >
            {monthName}
          </span>
          <span
            className="text-base font-medium text-muted-foreground/50"
            suppressHydrationWarning
          >
            {year}
          </span>
        </div>
      </div>

      <div className="relative">
        <p
          className={cn(
            "mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground transition-opacity duration-300",
            isTransitioning && enableCycling && !message
              ? "opacity-20"
              : "opacity-100",
          )}
        >
          {displayText}
        </p>
        <div className="relative h-px w-full overflow-hidden bg-border/40">
          <div
            ref={sweepRef}
            // repo-rules-allow theme-tokens-only: the sweep highlight is inherently a moving gradient between transparent and primary.
            className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/80 to-transparent"
          />
        </div>
      </div>
    </div>
  );
}

interface PageLoadingOverlayProps {
  isLoading?: boolean;
  message?: string;
  messageContext?: keyof typeof COMBINED_MESSAGES;
  className?: string;
  enableCycling?: boolean;
  fadeDurationMs?: number;
  /** Render above other overlays (z-[10000] vs z-[9999]) */
  priority?: boolean;
}

function FadeUnmountTimer({
  durationMs,
  onComplete,
}: {
  durationMs: number;
  onComplete: () => void;
}) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onComplete();
    }, durationMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [durationMs, onComplete]);

  return null;
}

export function PageLoadingOverlay({
  isLoading = true,
  message,
  messageContext = "PAGE_LOAD",
  className,
  enableCycling = true,
  fadeDurationMs = 300,
  priority = false,
}: PageLoadingOverlayProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const canFade = !prefersReducedMotion && fadeDurationMs > 0;
  const [mounted, setMounted] = useState(false);
  const unmountOverlay = useCallback(() => {
    setMounted(false);
  }, []);

  if (isLoading) {
    if (!mounted) {
      setMounted(true);
    }
  } else if (!canFade && mounted) {
    setMounted(false);
  }

  const visible = isLoading || mounted;
  const isFadingOut = visible && canFade && !isLoading;

  if (!visible) return null;

  const shouldAnimateOpacity = !prefersReducedMotion && fadeDurationMs > 0;

  return (
    <div
      role="status"
      data-motion-skip="true"
      data-page-loading-overlay="true"
      className={cn(
        "fixed inset-0 bg-background",
        priority ? "z-[10000]" : "z-[9999]",
        className,
      )}
      style={
        shouldAnimateOpacity
          ? {
              opacity: isLoading ? 1 : 0,
              pointerEvents: isLoading ? "auto" : "none",
              transition: `opacity ${fadeDurationMs}ms ease`,
              willChange: "opacity",
            }
          : isLoading
            ? undefined
            : { pointerEvents: "none" }
      }
    >
      {isFadingOut ? (
        <FadeUnmountTimer
          durationMs={fadeDurationMs}
          onComplete={unmountOverlay}
        />
      ) : null}
      <span className="sr-only">{message ?? "Loading…"}</span>
      <LoadingBoard
        message={message}
        messageContext={messageContext}
        enableCycling={enableCycling}
      />
    </div>
  );
}

interface InlineLogoSpinnerProps {
  className?: string;
  size?: "sm" | "md";
  text?: string;
  messageContext?: keyof typeof COMBINED_MESSAGES;
  enableCycling?: boolean;
  showText?: boolean;
}

export function InlineLogoSpinner({
  className,
  size = "sm",
  text,
  messageContext = "PAGE_LOAD",
  enableCycling = false,
  showText = true,
}: InlineLogoSpinnerProps) {
  const logoRef = useLogoPulse();

  const { message, isTransitioning } = useCyclingMessage({
    context: messageContext,
    enabled: enableCycling && !text,
    cycleInterval: 3000,
  });

  const displayText = text || message;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div ref={logoRef}>
        <Logo
          className={cn("text-accent", INLINE_LOGO_SPINNER_SIZE_CLASSES[size])}
          fill="currentColor"
        />
      </div>
      {showText ? (
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
      ) : null}
    </div>
  );
}
