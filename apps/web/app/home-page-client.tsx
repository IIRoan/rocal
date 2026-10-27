"use client";

import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSession } from "@/lib/auth-client";
import { useSmoothRouter } from "@/hooks/use-smooth-router";
import { completeAuthNavigation } from "@/lib/auth-navigation";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { revealSequence } from "@workspace/ui/lib/motion";
import { HOME_PATH } from "@/lib/app-routes";
import {
  FORCE_LOADING_DESIGN_PREVIEW,
  PageLoadingOverlay,
} from "@workspace/ui/components/ui";
import Image from "next/image";
import Link from "next/link";
import { AppPreview } from "@/components/landing/app-preview";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingSignInButton } from "@/components/landing/landing-sign-in-button";
import { WarpCta } from "@/components/landing/warp-cta";

const PILLARS = [
  {
    id: "calendar",
    title: "Calendar",
    body: "Shared calendars, recurring events, and reminders. Your event titles, notes, and locations are encrypted on your device.",
  },
  {
    id: "mail",
    title: "Mail",
    body: "A private inbox for everyday conversations. Your own mailbox, encrypted at rest, without ads or profiling.",
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
  const hasSession = Boolean(session?.user);
  const shouldShowLoadingOverlay =
    FORCE_LOADING_DESIGN_PREVIEW || !hasHydrated || isPending || hasSession;

  const redirectToHome = useEffectEvent(() => {
    router.startRouteTransition({ messageContext: "AUTH_FLOW" });
    completeAuthNavigation(HOME_PATH);
  });

  useEffect(() => {
    if (!isPending && hasSession) {
      redirectToHome();
    }
  }, [isPending, hasSession]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion || shouldShowLoadingOverlay) return;
    return revealSequence(root, [
      {
        selector:
          "[data-hero-copy], [data-hero-art], [data-hero-preview], [data-hero-pillar]",
        offset: { y: 12 },
        duration: 550,
        stagger: 90,
      },
    ]);
  }, [prefersReducedMotion, shouldShowLoadingOverlay]);

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
      className="relative isolate flex min-h-dvh flex-col overflow-clip bg-background"
    >
      <LandingNavbar onSignIn={handleSignIn} isLeaving={isLeaving} />

      <main className="relative z-10 flex w-full flex-1 flex-col pb-12">
        <div
          data-hero-copy
          className="mx-auto grid w-full max-w-6xl gap-6 px-6 pt-8 pb-12 sm:px-8 sm:pt-12 sm:pb-14 lg:grid-cols-[1.6fr_1fr] lg:items-end lg:gap-16 lg:px-10 lg:pt-14 lg:pb-16"
        >
          <h1 className="max-w-3xl font-display text-[clamp(2.5rem,5.4vw,5rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance text-foreground">
            Calendar and mail, without the noise.
          </h1>
          <div className="flex min-w-0 flex-col items-start gap-6">
            <p className="max-w-sm text-base leading-7 text-pretty text-muted-foreground">
              A calm calendar and a private inbox. Make plans, share your
              schedule, and keep your mail to yourself.
            </p>
            <LandingSignInButton onSignIn={handleSignIn} isLeaving={isLeaving} />
          </div>
        </div>

        <div className="mx-auto w-full max-w-6xl px-6 sm:px-8 lg:px-10">
          <div
            data-hero-art
            className="relative aspect-[4/5] overflow-hidden rounded-2xl sm:aspect-[4/3] lg:aspect-video"
          >
            <Image
              src="/wallpaper.jpg"
              alt=""
              fill
              preload
              sizes="(min-width: 1152px) 1072px, 100vw"
              className="object-cover"
            />
          </div>
          <div
            data-hero-preview
            className="relative mx-auto -mt-16 sm:-mt-[22%] sm:w-[92%] lg:-mt-[17%]"
          >
            <AppPreview />
          </div>
        </div>

        <ul className="mx-auto grid w-full max-w-6xl gap-8 px-6 pt-10 sm:grid-cols-2 sm:gap-16 sm:px-8 lg:gap-28 lg:px-10 lg:pt-12">
          {PILLARS.map((pillar) => (
            <li
              key={pillar.title}
              id={pillar.id}
              data-hero-pillar
              className="min-w-0 scroll-mt-28"
            >
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {pillar.title}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-7 text-pretty text-muted-foreground">
                {pillar.body}
              </p>
            </li>
          ))}
        </ul>

        <div className="mx-auto w-full max-w-6xl px-6 pt-16 sm:px-8 lg:px-10 lg:pt-20">
          <WarpCta onAction={handleSignIn} isLeaving={isLeaving} />
        </div>
      </main>

      <footer
        data-hero-footer
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-start gap-1 px-6 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-8 lg:px-10"
      >
        <p>Solace. Calendar and mail, kept private.</p>
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
