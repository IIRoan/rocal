"use client";

import Link from "next/link";
import { ChevronDown, Mail, CalendarDays } from "lucide-react";
import { cn } from "../../lib/utils";
import LogoSvg from "./logo";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";

interface SidebarAppSwitcherProps {
  activeApp: "calendar" | "mail";
}

export function SidebarAppSwitcher({ activeApp }: SidebarAppSwitcherProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 -ml-1.5 hover:bg-muted/50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <LogoSvg width="26" height="26" className="text-primary shrink-0" />
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[15px] tracking-[-0.04em] text-foreground"
              style={{ fontWeight: 380 }}
            >
              solace
            </span>
            <span className="text-[12px] font-medium text-muted-foreground/55 tracking-[-0.01em]">
              {activeApp}
            </span>
          </div>
          <ChevronDown
            className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0"
            strokeWidth={2.5}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-40 p-0 overflow-hidden rounded-lg border border-border shadow-md"
      >
        <div className="flex">
          <Link
            href="/mail"
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors cursor-pointer",
              activeApp === "mail"
                ? "text-primary bg-primary/8"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Mail className="h-3.5 w-3.5" strokeWidth={2} />
            Mail
          </Link>
          <div className="w-px bg-border/60 self-stretch" />
          <Link
            href="/calendar"
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors cursor-pointer",
              activeApp === "calendar"
                ? "text-primary bg-primary/8"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} />
            Calendar
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
