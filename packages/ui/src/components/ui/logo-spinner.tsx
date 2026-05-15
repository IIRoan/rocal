"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "../../lib/gsap";
import { cn } from "@workspace/ui/lib/utils";
import { default as Logo } from "../layout/logo";
import { useCyclingMessage } from "../../hooks/use-cycling-message";
import { usePrefersReducedMotion } from "../../hooks/use-prefers-reduced-motion";
import type { COMBINED_MESSAGES } from "../../constants/loading-messages";

export const FORCE_LOADING_DESIGN_PREVIEW = false;

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
    dayName: new Intl.DateTimeFormat(undefined, {
      weekday: "long",
    }).format(now),
    dayNum: now.getDate().toString().padStart(2, "0"),
    monthName: new Intl.DateTimeFormat(undefined, {
      month: "long",
    }).format(now),
    year: now.getFullYear().toString(),
  };
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
  const logoRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Use cycling messages if no static text provided
  const { message, isTransitioning } = useCyclingMessage({
    context: messageContext,
    enabled: enableCycling && !text && showText,
  });

  // Use static text if provided, otherwise use cycling message
  const displayText = text || message;

  const sizeClasses = {
    sm: "size-8",
    md: "size-12",
    lg: "size-16",
    xl: "size-20",
  };

  const shellClasses = {
    sm: "size-12 rounded-xl",
    md: "size-16 rounded-2xl",
    lg: "size-20 rounded-[1.4rem]",
    xl: "size-24 rounded-[1.75rem]",
  };

  useEffect(() => {
    const logoNode = logoRef.current;

    if (!logoNode) {
      return;
    }

    gsap.killTweensOf(logoNode);

    if (prefersReducedMotion) {
      gsap.set(logoNode, { clearProps: "opacity,scale" });
      return;
    }

    const tween = gsap.to(logoNode, {
      opacity: 0.58,
      scale: 1.04,
      duration: 1.2,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
      transformOrigin: "center center",
    });

    return () => {
      tween.kill();
      gsap.set(logoNode, { clearProps: "opacity,scale" });
    };
  }, [prefersReducedMotion]);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-[1.4rem] border border-border/80 bg-card shadow-sm",
          shellClasses[size],
        )}
      >
        <div className="absolute inset-[8px] rounded-[inherit] border border-border/50" />
        <div ref={logoRef} className="relative">
          <Logo
            className={cn("relative text-primary", sizeClasses[size])}
            fill="currentColor"
          />
        </div>
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
  const sweepRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [now, setNow] = useState<Date>(() => new Date());
  const { message: cyclingMessage, isTransitioning } = useCyclingMessage({
    context: messageContext,
    enabled: enableCycling && !message,
  });

  const displayText = message || cyclingMessage;
  const { dayName, dayNum, monthName, year } = getLoadingDateParts(now);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setNow(new Date());

    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const sweepNode = sweepRef.current;

    if (!sweepNode) {
      return;
    }

    gsap.killTweensOf(sweepNode);

    if (prefersReducedMotion) {
      gsap.set(sweepNode, { clearProps: "transform" });
      return;
    }

    const tween = gsap.fromTo(
      sweepNode,
      { xPercent: -120 },
      {
        xPercent: 120,
        duration: 2.4,
        ease: "sine.inOut",
        repeat: -1,
      },
    );

    return () => {
      tween.kill();
      gsap.set(sweepNode, { clearProps: "transform" });
    };
  }, [prefersReducedMotion]);

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden p-8 sm:p-14">
      {/* Top row: logo + wordmark left, day name right */}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo className="size-4 text-primary" fill="currentColor" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.5em] text-muted-foreground/40">
            Solace
          </span>
        </div>
        <span
          className="text-[9px] font-semibold uppercase tracking-[0.4em] text-muted-foreground/30"
          suppressHydrationWarning
        >
          {dayName}
        </span>
      </div>

      {/* Center: giant date number */}
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

      {/* Bottom: status message + sweep line */}
      <div className="relative">
        <p
          className={cn(
            "mb-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 transition-opacity duration-300",
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
            className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/80 to-transparent"
          />
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
  fadeDurationMs?: number;
  /** Render above other overlays (z-[10000] vs z-[9999]) */
  priority?: boolean;
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
  const [visible, setVisible] = useState(isLoading);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (isLoading) {
      setVisible(true);
      return;
    }

    if (prefersReducedMotion || fadeDurationMs <= 0) {
      setVisible(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setVisible(false);
    }, fadeDurationMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fadeDurationMs, isLoading, prefersReducedMotion]);

  if (!visible) return null;

  const shouldAnimateOpacity = !prefersReducedMotion && fadeDurationMs > 0;

  return (
    <div
      data-gsap-skip="true"
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
  const logoRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Use cycling messages if no static text provided
  const { message, isTransitioning } = useCyclingMessage({
    context: messageContext,
    enabled: enableCycling && !text,
    cycleInterval: 3000,
  });

  const displayText = text || message;

  const sizeClasses = {
    sm: "size-4",
    md: "size-6",
  };

  useEffect(() => {
    const logoNode = logoRef.current;

    if (!logoNode) {
      return;
    }

    gsap.killTweensOf(logoNode);

    if (prefersReducedMotion) {
      gsap.set(logoNode, { clearProps: "opacity,scale" });
      return;
    }

    const tween = gsap.to(logoNode, {
      opacity: 0.58,
      scale: 1.04,
      duration: 1.2,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
      transformOrigin: "center center",
    });

    return () => {
      tween.kill();
      gsap.set(logoNode, { clearProps: "opacity,scale" });
    };
  }, [prefersReducedMotion]);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div ref={logoRef}>
        <Logo
          className={cn("text-primary", sizeClasses[size])}
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
