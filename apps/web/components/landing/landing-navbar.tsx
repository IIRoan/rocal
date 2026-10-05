"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import Logo from "@workspace/ui/components/layout/logo";
import { ThemeToggle } from "@workspace/ui/components/layout/theme-toggle";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { LandingSignInButton } from "./landing-sign-in-button";

const NAV_LINKS = [
  { label: "Calendar", href: "#calendar" },
  { label: "Mail", href: "#mail" },
  { label: "Privacy", href: "/privacy" },
] as const;

interface LandingNavbarProps {
  onSignIn: () => void;
  isLeaving: boolean;
}

export function LandingNavbar({ onSignIn, isLeaving }: LandingNavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 mx-auto w-full max-w-6xl px-6 py-4 sm:px-8 lg:px-10">
      <nav
        aria-label="Main navigation"
        className="flex w-full items-center justify-between gap-2 rounded-2xl bg-muted/95 py-2 pr-2 pl-4 shadow-sm ring-1 ring-border sm:gap-3 sm:pl-6"
      >
        <div className="flex flex-1">
          <Link
            href="/"
            aria-label="Solace home"
            className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Logo width={26} height={26} className="text-primary" aria-hidden />
            <span className="text-[15px] font-semibold tracking-tight text-foreground">
              Solace
            </span>
          </Link>
        </div>

        <ul className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-md text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex flex-1 items-center justify-end gap-1">
          <div className="hidden sm:block [&_label]:size-11 [&_label]:rounded-lg">
            <ThemeToggle />
          </div>
          <LandingSignInButton onSignIn={onSignIn} isLeaving={isLeaving} />
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 rounded-lg md:hidden"
                aria-label="Open navigation menu"
              >
                <Menu aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={16}
              aria-label="Navigation menu"
              className="w-52 rounded-2xl p-2 md:hidden"
            >
              <nav aria-label="Mobile navigation">
                <ul className="flex flex-col gap-1">
                  {NAV_LINKS.map((link) => (
                    <li key={link.href}>
                      <Button
                        variant="ghost"
                        className="min-h-11 w-full justify-start rounded-lg"
                        asChild
                      >
                        <Link
                          href={link.href}
                          onClick={() => setMenuOpen(false)}
                        >
                          {link.label}
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="flex min-h-11 items-center justify-between px-3 sm:hidden [&_label]:size-11 [&_label]:rounded-lg">
                <span className="text-sm">Theme</span>
                <ThemeToggle />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </nav>
    </header>
  );
}
