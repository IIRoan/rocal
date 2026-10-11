"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useSession } from "@/lib/auth-client";
import { useSmoothRouter } from "@/hooks/use-smooth-router";
import {
  beginAuthNavigation,
  completeAuthNavigation,
  isAuthNavigationPending,
} from "@/lib/auth-navigation";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { Logo, ThemeToggle } from "@workspace/ui/components/layout";
import { MOTION_EASING, revealSequence } from "@workspace/ui/lib/motion";
import { CALENDAR_HOME_PATH, MAIL_HOME_PATH } from "@/lib/app-routes";
import { CalendarDays, Mail, ChevronRight, LogOut } from "lucide-react";
import { signOutAndClearLocalState } from "@/lib/auth-local-state";
import Link from "next/link";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";

const NAV_ITEMS = [
  {
    href: CALENDAR_HOME_PATH,
    label: "Calendar",
    description: "Events, schedules & reminders",
    icon: CalendarDays,
  },
  {
    href: MAIL_HOME_PATH,
    label: "Mail",
    description: "Inbox, drafts & sent messages",
    icon: Mail,
  },
];

const subscribeNever = () => () => {};
const getServerTimeOfDay = () => "";

export function HomeAppClient() {
  const { data: session, isPending } = useSession();
  const router = useSmoothRouter();
  const prefersReducedMotion = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const timeOfDay = useSyncExternalStore(
    subscribeNever,
    getTimeOfDay,
    getServerTimeOfDay,
  );

  const handleSignOut = () => {
    const finishNavigation = beginAuthNavigation("/login");
    if (!finishNavigation) return;
    void signOutAndClearLocalState()
      .then(finishNavigation)
      .catch(finishNavigation);
  };

  const hasSession = Boolean(session?.user);
  const redirectToLogin = useEffectEvent(() => {
    if (isAuthNavigationPending()) return;
    router.startRouteTransition({ messageContext: "AUTH_FLOW" });
    completeAuthNavigation("/login");
  });

  useEffect(() => {
    if (!isPending && !hasSession) {
      redirectToLogin();
    }
  }, [isPending, hasSession]);

  // Keyed on sign-in state, not the user object, so session refetches on focus don't replay the entrance.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || prefersReducedMotion || isPending || !hasSession) return;
    return revealSequence(container, [
      {
        selector: "[data-home-header]",
        offset: { y: -8 },
        duration: 400,
        easing: MOTION_EASING.soft,
      },
      {
        selector: "[data-home-greeting]",
        offset: { y: 10 },
        duration: 450,
        delay: 80,
        easing: MOTION_EASING.soft,
      },
      {
        selector: "[data-home-nav-item]",
        offset: { y: 8 },
        duration: 350,
        delay: 180,
        stagger: 70,
        easing: MOTION_EASING.soft,
      },
    ]);
  }, [isPending, hasSession, prefersReducedMotion]);

  if (isPending || !session?.user) {
    return null;
  }

  const firstName = session.user.name?.split(" ")[0] ?? "there";

  return (
    <div ref={containerRef} className="min-h-svh bg-background flex flex-col">
      <header
        data-home-header
        className="flex items-center justify-between px-5 pt-safe-top pt-4 pb-3 border-b border-border/40"
      >
        <Logo className="h-5 w-auto text-foreground" aria-label="Solace" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <SimpleTooltip content="Sign out">
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              aria-label="Sign out"
            >
              <LogOut size={15} />
            </button>
          </SimpleTooltip>
        </div>
      </header>

      <main className="flex-1 flex flex-col px-5 pt-10 pb-8 max-w-md mx-auto w-full">
        <div data-home-greeting className="mb-10">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">
            Good{timeOfDay}
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            {firstName}
          </h1>
        </div>

        <nav>
          <ul className="divide-y divide-border/50 border-t border-b border-border/50">
            {NAV_ITEMS.map((item) => (
              <li key={item.href} data-home-nav-item>
                <Link
                  href={item.href}
                  className="flex items-center justify-between py-4 group transition-colors hover:text-primary cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <item.icon
                      size={17}
                      className="text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0"
                    />
                    <div>
                      <span className="text-[15px] font-medium leading-none block mb-0.5">
                        {item.label}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {item.description}
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    className="text-muted-foreground/50 group-hover:text-primary transition-colors"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  );
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return " morning";
  if (hour < 17) return " afternoon";
  return " evening";
}
