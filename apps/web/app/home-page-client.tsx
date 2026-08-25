"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSession } from "@/lib/auth-client";
import { useSmoothRouter } from "@/hooks/use-smooth-router";
import { completeAuthNavigation } from "@/lib/auth-navigation";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { Logo, ThemeToggle } from "@workspace/ui/components/layout";
import { gsap, useGSAP } from "@workspace/ui/lib/gsap";
import { HOME_PATH } from "@/lib/app-routes";
import {
  FORCE_LOADING_DESIGN_PREVIEW,
  PageLoadingOverlay,
} from "@workspace/ui/components/ui";
import { Button } from "@workspace/ui/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { WallpaperBackdrop } from "@/components/landing/wallpaper-backdrop";

const PILLARS = [
  {
    title: "Calendar",
    body: "Shared schedules, recurring events, and reminders that actually arrive.",
  },
  {
    title: "Mail",
    body: "Your own mailbox. Encrypted at rest. No ads, no profiling.",
  },
] as const;

const subscribeNever = () => () => {};
const getClientHydrated = () => true;
const getServerHydrated = () => false;

export function HomePageClient() {
  const { data: session, isPending } = useSession();
  const router = useSmoothRouter();
  const [isLeaving, setIsLeaving] = useState(false);
  const hasHydrated = useSyncExternalStore(
    subscribeNever,
    getClientHydrated,
    getServerHydrated,
  );
  const rootRef = useRef<HTMLElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldShowLoadingOverlay =
    FORCE_LOADING_DESIGN_PREVIEW ||
    !hasHydrated ||
    isPending ||
    Boolean(session?.user);

  useEffect(() => {
    if (!isPending && session?.user) {
      router.startRouteTransition({
        messageContext: "AUTH_FLOW",
      });
      completeAuthNavigation(HOME_PATH);
    }
  }, [isPending, session?.user, router]);

  useGSAP(
    () => {
      if (prefersReducedMotion || shouldShowLoadingOverlay) {
        return;
      }

      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });

      timeline
        .fromTo(
          "[data-hero-scrim]",
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.7 },
          0,
        )
        .fromTo(
          "[data-hero-nav]",
          { autoAlpha: 0, y: -10 },
          { autoAlpha: 1, y: 0, duration: 0.5 },
          0.06,
        )
        .fromTo(
          ["[data-hero-heading]", "[data-hero-copy]", "[data-hero-cta]"],
          { autoAlpha: 0, y: 22 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.62,
            stagger: 0.09,
          },
          0.12,
        )
        .fromTo(
          "[data-hero-pillar]",
          { autoAlpha: 0, y: 16 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.5,
            stagger: 0.08,
          },
          0.42,
        )
        .fromTo(
          "[data-hero-footer]",
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.4 },
          0.58,
        );
    },
    {
      scope: rootRef,
      dependencies: [prefersReducedMotion, shouldShowLoadingOverlay],
    },
  );

  if (shouldShowLoadingOverlay) {
    return (
      <PageLoadingOverlay isLoading={true} messageContext="AUTH_FLOW" />
    );
  }

  const handleSignIn = () => {
    setIsLeaving(true);
    router.push("/login", undefined, {
      messageContext: "AUTH_FLOW",
      minimumVisibleMs: 120,
    });
  };

  return (
    <section
      ref={rootRef}
      className="relative flex min-h-dvh flex-col overflow-hidden bg-background"
    >
      <div data-hero-scrim className="absolute inset-0">
        <WallpaperBackdrop />
      </div>

      <header
        data-hero-nav
        className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 sm:px-8 lg:px-10"
      >
        <div className="flex items-center gap-2.5">
          <Logo
            width={26}
            height={26}
            className="text-primary"
            aria-hidden
          />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Solace
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="rounded-md bg-background/90 ring-1 ring-foreground/20">
            <ThemeToggle />
          </div>
          <Button
            size="sm"
            className="ml-1"
            onClick={handleSignIn}
            disabled={isLeaving}
          >
            Sign in
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 pb-10 sm:px-8 lg:px-10">
        <div className="flex max-w-xl flex-1 flex-col justify-center pt-10 pb-16 sm:pt-16 lg:pt-20">
          <h1
            data-hero-heading
            className="text-4xl leading-[1.12] font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl lg:leading-[1.08]"
          >
            Calendar and mail,
            <br className="hidden sm:block" /> without the noise.
          </h1>

          <p
            data-hero-copy
            className="mt-6 max-w-lg text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg"
          >
            Solace is a calm calendar and a private inbox: shared schedules,
            real notifications, and a mailbox that isn&apos;t a product. Not
            open to the public yet.
          </p>

          <div data-hero-cta className="mt-8 flex items-center gap-3">
            <Button
              size="lg"
              onClick={handleSignIn}
              disabled={isLeaving}
            >
              Sign in
              <ArrowRight />
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/privacy">Privacy</Link>
            </Button>
          </div>
        </div>

        <ul className="grid gap-8 border-t border-border/50 py-10 sm:grid-cols-3 sm:gap-10">
          {PILLARS.map((pillar) => (
            <li key={pillar.title} data-hero-pillar className="min-w-0">
              <p className="text-sm font-semibold tracking-tight text-foreground">
                {pillar.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
                {pillar.body}
              </p>
            </li>
          ))}
        </ul>
      </main>

      <footer
        data-hero-footer
        className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5 text-xs text-muted-foreground sm:px-8 lg:px-10"
      >
        <p>Solace. Private, for now.</p>
        <Link
          href="/privacy"
          className="font-medium transition-colors hover:text-foreground"
        >
          Privacy commitments
        </Link>
      </footer>
    </section>
  );
}
