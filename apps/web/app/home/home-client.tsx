"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth-client";
import { useSmoothRouter } from "@/hooks/use-smooth-router";
import { completeAuthNavigation } from "@/lib/auth-navigation";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { Logo, ThemeToggle } from "@workspace/ui/components/layout";
import { gsap, useGSAP } from "@workspace/ui/lib/gsap";
import { CALENDAR_HOME_PATH, MAIL_HOME_PATH } from "@/lib/app-routes";
import { CalendarDays, Mail, ChevronRight, LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import Link from "next/link";

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

export function HomeAppClient() {
  const { data: session, isPending } = useSession();
  const router = useSmoothRouter();
  const prefersReducedMotion = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.startRouteTransition({ messageContext: "AUTH_FLOW" });
      completeAuthNavigation("/login");
    }
  }, [isPending, session?.user, router]);

  useGSAP(
    () => {
      if (prefersReducedMotion || isPending || !session?.user) return;

      const ctx = gsap.context(() => {
        gsap.from("[data-home-header]", {
          opacity: 0,
          y: -8,
          duration: 0.4,
          ease: "power2.out",
        });
        gsap.from("[data-home-greeting]", {
          opacity: 0,
          y: 10,
          duration: 0.45,
          delay: 0.08,
          ease: "power2.out",
        });
        gsap.from("[data-home-nav-item]", {
          opacity: 0,
          y: 8,
          duration: 0.35,
          stagger: 0.07,
          delay: 0.18,
          ease: "power2.out",
        });
      }, containerRef);

      return () => ctx.revert();
    },
    {
      scope: containerRef,
      dependencies: [isPending, session?.user, prefersReducedMotion],
    },
  );

  if (isPending || !session?.user) {
    return null;
  }

  const firstName = session.user.name?.split(" ")[0] ?? "there";

  return (
    <div ref={containerRef} className="min-h-svh bg-background flex flex-col">
      {/* Header */}
      <header
        data-home-header
        className="flex items-center justify-between px-5 pt-safe-top pt-4 pb-3 border-b border-border/40"
      >
        <Logo className="h-5 w-auto text-foreground" aria-label="Solace" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() =>
              void signOut().then(() => {
                completeAuthNavigation("/login");
              })
            }
            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col px-5 pt-10 pb-8 max-w-md mx-auto w-full">
        {/* Greeting */}
        <div data-home-greeting className="mb-10">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">
            Good{getTimeOfDay()}
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            {firstName}
          </h1>
        </div>

        {/* Navigation list */}
        <nav>
          <ul className="divide-y divide-border/50 border-t border-b border-border/50">
            {NAV_ITEMS.map((item) => (
              <li key={item.href} data-home-nav-item>
                <Link
                  href={item.href}
                  className="flex items-center justify-between py-4 group transition-colors hover:text-primary"
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
