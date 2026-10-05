"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSession } from "@/lib/auth-client";
import { useSmoothRouter } from "@/hooks/use-smooth-router";
import { completeAuthNavigation } from "@/lib/auth-navigation";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { gsap, useGSAP } from "@workspace/ui/lib/gsap";
import { HOME_PATH } from "@/lib/app-routes";
import {
  FORCE_LOADING_DESIGN_PREVIEW,
  PageLoadingOverlay,
} from "@workspace/ui/components/ui";
import { Button } from "@workspace/ui/components/ui/button";
import Link from "next/link";
import { WallpaperBackdrop } from "@/components/landing/wallpaper-backdrop";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingSignInButton } from "@/components/landing/landing-sign-in-button";

const PILLARS = [
  {
    id: "calendar",
    title: "Calendar",
    body: "Shared schedules, recurring events, and reminders that actually arrive.",
  },
  {
    id: "mail",
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
    return <PageLoadingOverlay isLoading={true} messageContext="AUTH_FLOW" />;
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
      className="relative flex min-h-dvh flex-col overflow-clip bg-background"
    >
      <div data-hero-scrim className="absolute inset-0">
        <WallpaperBackdrop />
      </div>

      <LandingNavbar onSignIn={handleSignIn} isLeaving={isLeaving} />

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
            className="mt-6 max-w-lg text-base leading-relaxed text-pretty text-foreground sm:text-lg"
          >
            Solace is a calm calendar and a private inbox: shared schedules,
            real notifications, and a mailbox that isn&apos;t a product. Not
            open to the public yet.
          </p>

          <div data-hero-cta className="mt-8 flex items-center gap-3">
            <LandingSignInButton
              onSignIn={handleSignIn}
              isLeaving={isLeaving}
            />
            <Button
              size="lg"
              variant="outline"
              className="relative rounded-lg after:absolute after:inset-x-0 after:-inset-y-0.5"
              asChild
            >
              <Link href="/privacy">Privacy</Link>
            </Button>
          </div>
        </div>

        <ul className="grid gap-8 border-t border-border/50 py-10 sm:grid-cols-2 sm:gap-10 lg:grid-cols-3">
          {PILLARS.map((pillar) => (
            <li
              key={pillar.title}
              id={pillar.id}
              data-hero-pillar
              className="min-w-0 scroll-mt-28"
            >
              <p className="text-base font-semibold tracking-tight text-foreground lg:text-sm">
                {pillar.title}
              </p>
              <p className="mt-2 text-base leading-relaxed text-pretty text-foreground lg:text-sm">
                {pillar.body}
              </p>
            </li>
          ))}
        </ul>
      </main>

      <footer
        data-hero-footer
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-start gap-1 px-6 py-5 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-8 lg:px-10"
      >
        <p>Solace. Private, for now.</p>
        <Link
          href="/privacy"
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md font-medium outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:min-h-0"
        >
          Privacy commitments
        </Link>
      </footer>
    </section>
  );
}
