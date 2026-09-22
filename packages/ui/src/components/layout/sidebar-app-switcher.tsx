"use client";

import Link from "next/link";
import { CalendarDays, Check, Grip, Mail } from "lucide-react";
import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const APPS = [
  { id: "mail", label: "Mail", href: "/mail", icon: Mail },
  { id: "calendar", label: "Calendar", href: "/calendar", icon: CalendarDays },
] as const;

interface SidebarAppSwitcherProps {
  activeApp: "calendar" | "mail";
}

export function SidebarAppSwitcher({ activeApp }: SidebarAppSwitcherProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Switch app"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Grip size={16} strokeWidth={2} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-48 p-1">
        {APPS.map((app) => {
          const isActive = app.id === activeApp;
          return (
            <Link
              key={app.id}
              href={app.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[15px] transition-colors hover:bg-muted",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <app.icon size={16} strokeWidth={2} />
              <span className="flex-1">{app.label}</span>
              {isActive ? <Check size={14} strokeWidth={2.25} /> : null}
            </Link>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
