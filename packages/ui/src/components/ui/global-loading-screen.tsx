"use client";

import { cn } from "../../lib/utils";
import { Skeleton } from "./skeleton";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoSpinner } from "./logo-spinner";
import type { COMBINED_MESSAGES } from "../../constants/loading-messages";

interface GlobalLoadingScreenProps {
  isLoading?: boolean;
  message?: string;
  variant?: "minimal" | "detailed" | "splash";
  className?: string;
  // Improved UX options
  enableMessageCycling?: boolean; // When no static message provided
  messageContext?: keyof typeof COMBINED_MESSAGES;
  // Auto-retry & recovery
  autoRetry?: boolean; // Enable automatic retry when stuck
  retryDelaysMs?: number[]; // Sequence of retry delays per attempt
  longerThanUsualMs?: number; // When to show the "taking longer" hint
  onRetry?: (attempt: number) => void | Promise<void>; // Default reload
  onGiveUp?: (attempts: number) => void; // Called after final retry
}

export function GlobalLoadingScreen({
  isLoading = true,
  message,
  variant = "detailed",
  className,
  enableMessageCycling = true,
  messageContext = "PAGE_LOAD",
  autoRetry = true,
  retryDelaysMs,
  longerThanUsualMs = 8000,
  onRetry,
  onGiveUp,
}: GlobalLoadingScreenProps) {
  // Simple dot animation used by minimal variant
  const [dots, setDots] = useState("");
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, [isLoading]);

  // Only enable auto-retry for global overlays (splash/detailed)
  const autoRetryEnabled =
    autoRetry && (variant === "splash" || variant === "detailed");
  const delays = useMemo(
    () => retryDelaysMs ?? [10000, 20000, 40000],
    [retryDelaysMs],
  );

  const [attempt, setAttempt] = useState(0);
  const [showLonger, setShowLonger] = useState(false);
  const [nextRetryAt, setNextRetryAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Default retry action: reload the app
  const defaultRetry = useCallback((attemptNo: number) => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, []);

  const doRetry = useCallback(async () => {
    // Prevent duplicate triggers
    setNextRetryAt(null);
    const next = attempt + 1;
    setAttempt(next);
    try {
      await (onRetry ? onRetry(next) : defaultRetry(next));
    } catch {
      // ignore
    } finally {
      // If still loading after retry, schedule next one
      if (autoRetryEnabled && next < delays.length) {
        const d = delays.at(next) ?? delays[delays.length - 1] ?? 10000;
        setNextRetryAt(Date.now() + d);
      } else if (autoRetryEnabled && next >= delays.length) {
        onGiveUp?.(next);
      }
    }
  }, [attempt, onRetry, defaultRetry, autoRetryEnabled, delays, onGiveUp]);

  // Manage timers when overlay is visible
  useEffect(() => {
    if (!isLoading) {
      setAttempt(0);
      setShowLonger(false);
      setNextRetryAt(null);
      setTimeLeft(null);
      return;
    }

    const longerTimer = window.setTimeout(
      () => setShowLonger(true),
      longerThanUsualMs,
    );
    if (autoRetryEnabled && attempt < delays.length && nextRetryAt === null) {
      const d = delays.at(attempt) ?? delays[delays.length - 1] ?? 10000;
      setNextRetryAt(Date.now() + d);
    }
    return () => {
      window.clearTimeout(longerTimer);
    };
  }, [
    isLoading,
    longerThanUsualMs,
    autoRetryEnabled,
    delays,
    attempt,
    nextRetryAt,
  ]);

  // Countdown state for next retry
  useEffect(() => {
    if (!nextRetryAt) {
      setTimeLeft(null);
      return;
    }
    const tick = () => setTimeLeft(Math.max(0, nextRetryAt - Date.now()));
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [nextRetryAt]);

  // Trigger retry when countdown hits zero
  useEffect(() => {
    if (nextRetryAt && timeLeft === 0) {
      void doRetry();
    }
  }, [timeLeft, nextRetryAt, doRetry]);

  if (!isLoading) return null;

  if (variant === "minimal") {
    return (
      <div
        data-gsap-skip="true"
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm",
          className,
        )}
      >
        <div className="flex items-center space-x-2">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent [animation:spin_1s_linear_infinite]" />
          <span className="text-sm font-medium text-muted-foreground">
            {message ?? "Loading"}
            {dots}
          </span>
        </div>
      </div>
    );
  }

  // Enhanced splash/detailed variants share the same improved UI
  return (
    <div
      data-gsap-skip="true"
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex flex-col items-center space-y-6 max-w-md mx-auto px-4">
        {/* Animated logo + cycling message */}
        <LogoSpinner
          size={variant === "splash" ? "lg" : "md"}
          text={message}
          messageContext={messageContext}
          enableCycling={enableMessageCycling && !message}
          className="animate-fade-in"
        />

        {/* Status and guidance */}
        <div className="w-full text-center space-y-2">
          {showLonger && (
            <p className="text-sm text-muted-foreground">
              This is taking longer than usual.
            </p>
          )}
          {autoRetryEnabled && nextRetryAt && timeLeft !== null && (
            <p className="text-xs text-muted-foreground">
              {attempt > 0
                ? `Attempt ${attempt + 1} of ${delays.length}. `
                : ""}
              Auto-retry in {Math.ceil((timeLeft || 0) / 1000)}s
            </p>
          )}
        </div>

        {/* Indeterminate progress bar */}
        <div className="w-full max-w-sm">
          <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary [animation:pulse_1.4s_ease-in-out_infinite]"
              style={{ width: "75%", animationDuration: "1.4s" }}
            />
          </div>
        </div>

        {/* Actions */}
        {autoRetryEnabled && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void doRetry()}
              className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              Try again now
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
              className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              Reload app
            </button>
          </div>
        )}

        {/* Decorative skeletons remain for detailed variant only */}
        {variant === "detailed" && (
          <div className="w-full max-w-sm space-y-3 animate-fade-in">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-20" variant="shimmer" />
                <Skeleton className="h-4 w-12" variant="shimmer" />
              </div>
              <Skeleton className="h-2 w-full" variant="wave" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" variant="shimmer" />
                <Skeleton className="h-4 w-16" variant="shimmer" />
              </div>
              <Skeleton className="h-2 w-4/5" variant="wave" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-16" variant="shimmer" />
                <Skeleton className="h-4 w-10" variant="shimmer" />
              </div>
              <Skeleton className="h-2 w-3/5" variant="wave" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Loading screen for specific sections
interface SectionLoadingProps {
  title?: string;
  description?: string;
  className?: string;
}

export function SectionLoading({
  title = "Loading",
  description = "Please wait...",
  className,
}: SectionLoadingProps) {
  return (
    <div
      data-gsap-skip="true"
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center space-y-4",
        className,
      )}
    >
      <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary [animation:spin_1s_linear_infinite]" />
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// Loading overlay for interactive elements
interface LoadingOverlayProps {
  isLoading?: boolean;
  children: React.ReactNode;
  message?: string;
  className?: string;
}

export function LoadingOverlay({
  isLoading = false,
  children,
  message = "Loading...",
  className,
}: LoadingOverlayProps) {
  return (
    <div data-gsap-skip="true" className={cn("relative", className)}>
      {children}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent [animation:spin_1s_linear_infinite]" />
            <span className="text-sm font-medium">{message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export type {
  GlobalLoadingScreenProps,
  SectionLoadingProps,
  LoadingOverlayProps,
};
