"use client";

import Link from "next/link";
import { CalendarDays, Mail } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import { cn } from "@workspace/ui/lib/utils";
import { CALENDAR_HOME_PATH, MAIL_HOME_PATH } from "@/lib/app-routes";

type MobileApp = "calendar" | "mail";

const APP_LINKS = [
  {
    app: "calendar" as const,
    href: CALENDAR_HOME_PATH,
    label: "Calendar",
    Icon: CalendarDays,
  },
  {
    app: "mail" as const,
    href: MAIL_HOME_PATH,
    label: "Mail",
    Icon: Mail,
  },
] satisfies Array<{
  app: MobileApp;
  href: string;
  label: string;
  Icon: typeof CalendarDays;
}>;

interface MobileAppSwitcherProps {
  activeApp: MobileApp;
  className?: string;
}

export function MobileAppSwitcher({
  activeApp,
  className,
}: MobileAppSwitcherProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/95 p-1 shadow-sm",
        className,
      )}
    >
      {APP_LINKS.map(({ app, href, label, Icon }) => {
        const isActive = activeApp === app;

        return (
          <Button
            key={app}
            asChild
            variant={isActive ? "secondary" : "ghost"}
            size="sm"
            className="h-8 rounded-full px-3 text-xs font-medium"
          >
            <Link href={href} aria-current={isActive ? "page" : undefined}>
              <Icon data-icon="inline-start" />
              {label}
            </Link>
          </Button>
        );
      })}
    </div>
  );
}
