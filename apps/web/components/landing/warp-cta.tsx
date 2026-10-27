"use client";

import { Warp } from "@paper-design/shaders-react";
import { Pause, Play } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { afterPaint } from "@workspace/calendar-core";
import { Button } from "@workspace/ui/components/ui/button";
import { usePrefersReducedMotion } from "@workspace/ui/hooks/use-prefers-reduced-motion";
import { LandingSignInButton } from "./landing-sign-in-button";

// repo-rules-allow theme-tokens-only: Warp takes literal uniforms; dark warm browns keep the strip's dark-scoped text above 4.5:1.
const WARP_COLORS = ["#1c1814", "#3d3024", "#211c17", "#5c4834"];

interface WarpCtaProps {
  onAction: () => void;
  isLeaving: boolean;
}

export function WarpCta({ onAction, isLeaving }: WarpCtaProps) {
  const headingId = useId();
  const [isPaused, setIsPaused] = useState(false);
  const [hasPainted, setHasPainted] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => afterPaint(() => setHasPainted(true)), []);

  return (
    <section
      data-slot="warp-cta"
      aria-labelledby={headingId}
      className="dark relative isolate overflow-hidden rounded-2xl bg-background text-foreground"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [&_canvas]:starting:opacity-0 [&_canvas]:motion-safe:transition-opacity [&_canvas]:motion-safe:duration-700"
      >
        <Warp
          className="absolute inset-0"
          colors={WARP_COLORS}
          shape="checks"
          proportion={0.45}
          softness={1}
          distortion={0.25}
          swirl={0.8}
          swirlIterations={10}
          shapeScale={0.1}
          speed={hasPainted && !prefersReducedMotion && !isPaused ? 0.5 : 0}
          frame={12000}
          minPixelRatio={1}
          maxPixelCount={400000}
        />
      </div>
      <div className="flex flex-col items-start gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:py-12">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Access by invitation.
          </h2>
          <p className="mt-2 text-sm leading-6 text-pretty">
            Solace isn&apos;t open to the public yet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LandingSignInButton onSignIn={onAction} isLeaving={isLeaving} />
          {!prefersReducedMotion && (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="relative size-10 rounded-lg after:absolute after:-inset-0.5"
              aria-label={
                isPaused ? "Play background animation" : "Pause background animation"
              }
              onClick={() => setIsPaused((paused) => !paused)}
            >
              {isPaused ? <Play aria-hidden /> : <Pause aria-hidden />}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
