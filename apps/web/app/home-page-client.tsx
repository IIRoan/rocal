"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type React from "react";

// ─── static data ──────────────────────────────────────────────────────────────

const APRIL_GRID: (number | null)[] = [
  null,
  null,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  30,
  null,
  null,
  null,
];

const MINI_DOTS: Record<number, string[]> = {
  7: ["sky"],
  10: ["violet", "orange"],
  14: ["sky"],
  17: ["emerald"],
  20: ["sky"],
  21: ["sky", "orange", "violet"],
  22: ["emerald"],
  23: ["violet"],
  24: ["emerald"],
  28: ["sky"],
};

const WEEKDAY_LABELS = [
  { id: "monday", label: "M" },
  { id: "tuesday", label: "T" },
  { id: "wednesday", label: "W" },
  { id: "thursday", label: "T" },
  { id: "friday", label: "F" },
  { id: "saturday", label: "S" },
  { id: "sunday", label: "S" },
];

const MONTH_EVENTS: Record<number, Array<{ label: string; color: string }>> = {
  7: [{ label: "Stand-up", color: "sky" }],
  10: [
    { label: "Client call", color: "violet" },
    { label: "Lunch", color: "orange" },
  ],
  14: [{ label: "Design meeting", color: "sky" }],
  17: [{ label: "Client demo", color: "emerald" }],
  20: [{ label: "Stand-up", color: "sky" }],
  21: [
    { label: "Team sync", color: "sky" },
    { label: "Design review", color: "violet" },
  ],
  22: [{ label: "Client demo", color: "emerald" }],
  23: [{ label: "1:1 Alex", color: "violet" }],
  24: [{ label: "Conference", color: "emerald" }],
  25: [{ label: "Conference", color: "emerald" }],
  28: [{ label: "All hands", color: "sky" }],
};

const WEEKS: (number | null)[][] = [
  [null, null, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10, 11, 12],
  [13, 14, 15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24, 25, 26],
  [27, 28, 29, 30, null, null, null],
];

interface WeekEvent {
  day: number;
  label: string;
  color: string;
  start: number;
  end: number;
}

const WEEK_EVENTS: WeekEvent[] = [
  { day: 1, label: "Stand-up", color: "sky", start: 9, end: 9.5 },
  { day: 2, label: "Team sync", color: "sky", start: 10, end: 11 },
  { day: 2, label: "Lunch", color: "orange", start: 12.5, end: 13.5 },
  { day: 2, label: "Design review", color: "violet", start: 14, end: 15 },
  { day: 3, label: "Client demo", color: "emerald", start: 11, end: 12 },
  { day: 4, label: "1:1 Alex", color: "violet", start: 15, end: 15.5 },
  { day: 5, label: "Conference", color: "emerald", start: 9, end: 17 },
];

const DAY_EVENTS: WeekEvent[] = [
  { day: 2, label: "Team sync", color: "sky", start: 10, end: 11 },
  { day: 2, label: "Lunch", color: "orange", start: 12.5, end: 13.5 },
  { day: 2, label: "Design review", color: "violet", start: 14, end: 15 },
];

const CALENDARS = [
  { name: "Personal", color: "sky" },
  { name: "Work", color: "violet" },
  { name: "Family", color: "emerald" },
  { name: "Travel", color: "orange" },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

const START_H = 8;
const END_H = 17;
const SPAN = END_H - START_H;

function pct(h: number) {
  return `${Math.max(0, Math.min(100, ((h - START_H) / SPAN) * 100))}%`;
}
function heightPct(start: number, end: number) {
  const s = Math.max(start, START_H);
  const e = Math.min(end, END_H);
  return `${Math.max(2, ((e - s) / SPAN) * 100)}%`;
}
function eventStyle(color: string): React.CSSProperties {
  return {
    backgroundColor: `var(--event-${color})`,
    color: `var(--event-${color}-foreground)`,
    borderColor: `color-mix(in oklch, var(--event-${color}) 60%, transparent)`,
  };
}

// ─── app preview sub-components ───────────────────────────────────────────────

function MiniCalendar({ today }: { today: number }) {
  return (
    <div className="shrink-0 px-3 pb-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px]">
          <span className="font-semibold text-foreground">April</span>
          <span className="ml-0.5 text-muted-foreground">2026</span>
        </span>
        <div className="flex items-center text-muted-foreground">
          <span className="flex size-6 items-center justify-center">
            <ChevronLeft className="size-3.5" />
          </span>
          <span className="flex size-6 items-center justify-center">
            <ChevronRight className="size-3.5" />
          </span>
        </div>
      </div>
      <div className="mb-0.5 grid grid-cols-7">
        {WEEKDAY_LABELS.map(({ id, label }) => (
          <div
            key={id}
            className="flex h-6 items-center justify-center text-[10px] font-medium text-muted-foreground/50"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {APRIL_GRID.map((day, i) => {
          if (day === null) return <div key={`n-${i}`} className="h-6" />;
          const isCurrentDay = day === today;
          const isWeekDay = day >= 20 && day <= 26;
          const dots = MINI_DOTS[day] ?? [];
          return (
            <div
              key={day}
              className="flex flex-col items-center gap-[2px] py-px"
            >
              <div
                className={[
                  "flex size-5 items-center justify-center rounded-full text-[10px]",
                  isCurrentDay
                    ? "bg-primary/20 font-semibold text-primary"
                    : isWeekDay
                      ? "bg-muted/60 text-foreground"
                      : "text-foreground",
                ].join(" ")}
              >
                {day}
              </div>
              {dots.length > 0 && (
                <div className="flex h-[4px] gap-[2px]">
                  {dots.slice(0, 3).map((c, di) => (
                    <span
                      key={di}
                      className="size-[4px] rounded-full"
                      style={{ backgroundColor: `var(--event-${c})` }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeLabels() {
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16];
  return (
    <div className="relative w-7 shrink-0">
      {hours.map((h) => (
        <div
          key={h}
          className="absolute right-1 -translate-y-1/2 text-[8px] tabular-nums text-muted-foreground/50"
          style={{ top: pct(h) }}
        >
          {h < 12 ? `${h}` : h === 12 ? "12" : `${h - 12}`}
        </div>
      ))}
    </div>
  );
}

function WeekGrid({ today }: { today: number }) {
  const dayHeaders = [
    { short: "Mon", n: 20 },
    { short: "Tue", n: 21 },
    { short: "Wed", n: 22 },
    { short: "Thu", n: 23 },
    { short: "Fri", n: 24 },
    { short: "Sat", n: 25 },
    { short: "Sun", n: 26 },
  ];
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16];
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="grid shrink-0 grid-cols-[1.75rem_repeat(7,minmax(0,1fr))] border-b">
        <div />
        {dayHeaders.map((d) => {
          const isToday = d.n === today;
          return (
            <div
              key={d.n}
              className="flex flex-col items-center gap-0.5 py-1.5"
            >
              <span className="text-[8px] font-medium uppercase text-muted-foreground/60">
                {d.short}
              </span>
              <span
                className={[
                  "flex size-5 items-center justify-center rounded-full text-[10px] font-medium",
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground",
                ].join(" ")}
              >
                {d.n}
              </span>
            </div>
          );
        })}
      </div>
      <div className="relative flex flex-1 overflow-hidden">
        <TimeLabels />
        <div className="relative flex-1 grid grid-cols-7">
          {hours.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 border-t border-border/30"
              style={{ top: pct(h) }}
            />
          ))}
          {hours.map((h) => (
            <div
              key={`${h}.5`}
              className="absolute left-0 right-0 border-t border-border/15"
              style={{ top: pct(h + 0.5) }}
            />
          ))}
          {/* Current-time line — Tuesday's column only */}
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              top: pct(10.5),
              left: `${(1 / 7) * 100}%`,
              width: `${(1 / 7) * 100}%`,
            }}
          >
            <div className="absolute inset-x-0 h-px bg-red-500" />
            <div
              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500"
              style={{ left: 0, top: 0 }}
            />
          </div>
          {WEEK_EVENTS.map((ev) => {
            const colIndex = ev.day - 1;
            const showLabel = ev.end - ev.start >= 0.75;
            return (
              <div
                key={`${ev.day}-${ev.start}-${ev.end}-${ev.label}`}
                className="absolute overflow-hidden rounded-[3px] border-l-2 px-1 py-[2px] text-[8px] font-medium leading-tight shadow-sm"
                style={{
                  ...eventStyle(ev.color),
                  top: pct(ev.start),
                  height: heightPct(ev.start, ev.end),
                  left: `${(colIndex / 7) * 100}%`,
                  width: `calc(${(1 / 7) * 100}% - 2px)`,
                }}
              >
                {showLabel && (
                  <span className="truncate block">{ev.label}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayGrid({ today }: { today: number }) {
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16];
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2">
        <span className="text-[8px] font-medium uppercase text-muted-foreground/60">
          Tue
        </span>
        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
          {today}
        </span>
        <span className="ml-1 text-[9px] text-muted-foreground">
          April 2026
        </span>
      </div>
      <div className="relative flex flex-1 overflow-hidden">
        <TimeLabels />
        <div className="relative flex-1">
          {hours.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 border-t border-border/30"
              style={{ top: pct(h) }}
            />
          ))}
          {hours.map((h) => (
            <div
              key={`${h}.5`}
              className="absolute left-0 right-0 border-t border-border/15"
              style={{ top: pct(h + 0.5) }}
            />
          ))}
          <div
            className="absolute z-20 pointer-events-none left-0 right-0"
            style={{ top: pct(10.5) }}
          >
            <div className="absolute h-px bg-red-500 left-0 right-0" />
            <div
              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500"
              style={{ left: 0, top: 0 }}
            />
          </div>
          {DAY_EVENTS.map((ev) => (
            <div
              key={`${ev.day}-${ev.start}-${ev.end}-${ev.label}`}
              className="absolute overflow-hidden rounded-[3px] border-l-2 px-1 py-[2px] text-[8px] font-medium leading-tight shadow-sm"
              style={{
                ...eventStyle(ev.color),
                top: pct(ev.start),
                height: heightPct(ev.start, ev.end),
                left: 2,
                right: 2,
              }}
            >
              <span className="truncate block">{ev.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ today }: { today: number }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="grid shrink-0 grid-cols-7 border-b">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="py-1.5 text-center text-[9px] font-medium uppercase text-muted-foreground/60"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-rows-5">
        {WEEKS.map((week, wi) => (
          <div
            key={wi}
            className="grid grid-cols-7 [&:last-child>*]:border-b-0"
          >
            {week.map((day, di) => {
              const isToday = day === today;
              const evs = day ? (MONTH_EVENTS[day] ?? []) : [];
              return (
                <div
                  key={`${wi}-${di}`}
                  className={[
                    "overflow-hidden border-b border-r px-1 pb-0.5 pt-1 last:border-r-0",
                    !day ? "bg-muted/25" : "",
                  ].join(" ")}
                >
                  {day !== null && (
                    <>
                      <div
                        className={[
                          "mb-0.5 inline-flex size-5 items-center justify-center rounded-full text-[10px]",
                          isToday
                            ? "bg-primary/20 font-semibold text-primary"
                            : "text-foreground",
                        ].join(" ")}
                      >
                        {day}
                      </div>
                      <div className="space-y-[2px]">
                        {evs.slice(0, 2).map((ev) => (
                          <div
                            key={ev.label}
                            className="truncate rounded px-1 py-[1px] text-[9px] font-medium leading-tight"
                            style={{
                              backgroundColor: `var(--event-${ev.color})`,
                              color: `var(--event-${ev.color}-foreground)`,
                            }}
                          >
                            {ev.label}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── app preview ──────────────────────────────────────────────────────────────

type CalView = "Day" | "Week" | "Month";

function AppPreview() {
  const today = 21;
  const [view, setView] = useState<CalView>("Week");

  const rangeLabel =
    view === "Day"
      ? "Tuesday, April 21"
      : view === "Week"
        ? "Apr 20 – 26, 2026"
        : "April 2026";

  return (
    <div className="w-full overflow-hidden rounded-2xl border bg-card/95 shadow-xl backdrop-blur-sm">
      {/* Window chrome */}
      <div className="flex shrink-0 items-center gap-1.5 border-b bg-muted/40 px-3.5 py-2">
        <span className="size-2.5 rounded-full bg-destructive/60" />
        <span className="size-2.5 rounded-full bg-warning/70" />
        <span className="size-2.5 rounded-full bg-success/70" />
        <div className="ml-auto flex items-center gap-1.5 rounded-md border border-border/40 bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground">
          <Search className="size-3" />
          <span>Search events…</span>
        </div>
      </div>

      <div className="flex" style={{ height: 370 }}>
        {/* Sidebar */}
        <div className="flex w-[165px] shrink-0 flex-col overflow-hidden border-r">
          <div className="flex shrink-0 items-center justify-between px-3 pb-2.5 pt-3">
            <div className="flex items-center gap-1.5">
              <Logo width={20} height={20} className="text-primary" />
              <span
                className="text-[13px] tracking-[-0.04em] text-foreground"
                style={{ fontWeight: 380 }}
              >
                Solace
              </span>
            </div>
            <div className="flex items-center gap-0.5 text-muted-foreground/40">
              <span className="flex size-6 items-center justify-center">
                <Search className="size-3" />
              </span>
              <span className="flex size-6 items-center justify-center">
                <PanelLeftClose className="size-3" />
              </span>
            </div>
          </div>
          <MiniCalendar today={today} />
          <div className="shrink-0 px-2.5 pb-3">
            <div className="flex h-8 w-full items-center justify-center gap-1.5 rounded-xl border border-border/60 text-[12px] text-foreground/80">
              <Plus className="size-3.5" />
              <span style={{ fontWeight: 470 }}>New event</span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden px-2">
            <div className="mb-1.5 flex items-center justify-between px-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Calendars
              </span>
              <Settings2 className="size-3 text-muted-foreground/40" />
            </div>
            <div className="space-y-0.5">
              {CALENDARS.map((cal) => (
                <div
                  key={cal.name}
                  className="flex h-7 items-center gap-2 rounded-lg px-2 text-[12px] font-medium text-foreground"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: `var(--event-${cal.color})` }}
                  />
                  <span className="truncate">{cal.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main area */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-1">
              <div className="flex text-muted-foreground/70">
                <ChevronLeft className="size-3.5" />
                <ChevronRight className="size-3.5" />
              </div>
              <span className="ml-1 text-[11px] font-medium text-foreground">
                {rangeLabel}
              </span>
            </div>
            <div className="flex items-center rounded-md border border-border/60 bg-background/60 p-0.5">
              {(["Day", "Week", "Month"] as CalView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={[
                    "rounded px-2 py-0.5 text-[10px] transition-colors",
                    v === view
                      ? "bg-primary/15 font-medium text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          {view === "Week" && <WeekGrid today={today} />}
          {view === "Day" && <DayGrid today={today} />}
          {view === "Month" && <MonthGrid today={today} />}
        </div>
      </div>
    </div>
  );
}

// ─── hero left side ───────────────────────────────────────────────────────────

function ThisWeekWidget() {
  const days = [
    { short: "M", n: 20 },
    { short: "T", n: 21 },
    { short: "W", n: 22 },
    { short: "T", n: 23 },
    { short: "F", n: 24 },
    { short: "S", n: 25 },
    { short: "S", n: 26 },
  ];
  const upcoming = [
    { time: "Now", label: "Team sync", color: "sky" },
    { time: "2:00", label: "Design review", color: "violet" },
    { time: "Fri", label: "Conference", color: "emerald" },
  ];
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-foreground">
          This week
        </span>
        <span className="text-[11px] text-muted-foreground">Apr 20 – 26</span>
      </div>
      {/* Week strip */}
      <div className="mb-3.5 grid grid-cols-7">
        {days.map((d) => {
          const isToday = d.n === 21;
          const dots = MINI_DOTS[d.n] ?? [];
          return (
            <div key={d.n} className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-medium text-muted-foreground/60">
                {d.short}
              </span>
              <span
                className={[
                  "flex size-7 items-center justify-center rounded-full text-[12px] font-medium",
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground",
                ].join(" ")}
              >
                {d.n}
              </span>
              <div className="flex h-[5px] items-center gap-[2px]">
                {dots.slice(0, 2).map((c) => (
                  <span
                    key={`${d.n}-${c}`}
                    className="size-[4px] rounded-full"
                    style={{ backgroundColor: `var(--event-${c})` }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {/* Upcoming events */}
      <div className="space-y-2 border-t border-border/40 pt-3">
        {upcoming.map((ev) => (
          <div key={ev.label} className="flex items-center gap-3">
            <span className="w-7 text-right text-[11px] tabular-nums text-muted-foreground/60">
              {ev.time}
            </span>
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: `var(--event-${ev.color})` }}
            />
            <span className="text-[13px] font-medium text-foreground">
              {ev.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroContent({
  onLogin,
  isExiting,
}: {
  onLogin: () => void;
  isExiting: boolean;
}) {
  return (
    <div className="relative z-10 flex w-full flex-col items-center">
      {/* Text + CTA capped at md */}
      <div className="w-full max-w-md">
        {/* Logo + theme toggle */}
        <div className="mb-10 flex items-center justify-between">
          <Logo
            width={44}
            height={44}
            className="text-primary"
            aria-label="Solace"
          />
          <ThemeToggle />
        </div>

        {/* Heading */}
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Shared calendars, without the chaos.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Solace is a calm, focused calendar built for shared schedules,
            recurring events, and real notifications, with no ads and no noise.
          </p>
        </div>

        {/* CTA */}
        <Button
          size="lg"
          className="h-11 w-full rounded-lg font-medium"
          onClick={onLogin}
          disabled={isExiting}
        >
          Get started
          <ArrowRight className="ml-2 size-4" />
        </Button>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Before continuing, please read our{" "}
          <Link
            href="/privacy"
            className="font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            privacy commitments
          </Link>
        </p>
      </div>

      {/* App preview */}
      <div className="mt-12 w-full max-w-3xl">
        <AppPreview />
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export function HomePageClient() {
  const { data: session, isPending } = useSession();
  const router = useSmoothRouter();
  const [isExiting, setIsExiting] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldShowLoadingOverlay =
    FORCE_LOADING_DESIGN_PREVIEW || isPending || Boolean(session?.user);

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
          { autoAlpha: 1, duration: 0.45 },
          0,
        )
        .fromTo(
          [
            "[data-hero-logo-row]",
            "[data-hero-heading]",
            "[data-hero-copy]",
            "[data-hero-cta]",
            "[data-hero-footer]",
          ],
          { autoAlpha: 0, y: 24 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.62,
            stagger: 0.08,
          },
          0.08,
        )
        .fromTo(
          "[data-hero-preview-shell]",
          {
            autoAlpha: 0,
            x: 52,
            y: 18,
            scale: 0.96,
          },
          {
            autoAlpha: 1,
            x: 0,
            y: 0,
            scale: 1,
            duration: 0.78,
            ease: "expo.out",
          },
          0.18,
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

  const handleLoginClick = () => {
    setIsExiting(true);
    router.push("/login", undefined, {
      messageContext: "AUTH_FLOW",
      minimumVisibleMs: 120,
    });
  };

  return (
    <section
      ref={rootRef}
      className="relative min-h-[100dvh] flex overflow-hidden"
    >
      {/* Full-bleed wallpaper */}
      <Image
        src="/wallpaper02.jpg"
        alt=""
        fill
        sizes="100vw"
        unoptimized
        priority
        className="pointer-events-none object-cover"
      />
      {/* Directional overlay — heavier on the left so text is always readable */}
      <div
        data-hero-scrim
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/95 via-background/70 to-background/20"
      />

      {/* Left — hero text */}
      <div className="relative z-10 flex w-full flex-col justify-center px-8 py-16 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="max-w-md">
          <div
            data-hero-logo-row
            className="mb-10 flex items-center justify-between"
          >
            <Logo
              width={44}
              height={44}
              className="text-primary"
              aria-label="Solace"
            />
            <ThemeToggle />
          </div>
          <h1
            data-hero-heading
            className="mb-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
          >
            Shared calendars,
            <br />
            without the chaos.
          </h1>
          <p
            data-hero-copy
            className="mb-8 text-sm leading-relaxed text-muted-foreground"
          >
            Solace is a calm, focused calendar built for shared schedules,
            recurring events, and real notifications, with no ads and no noise.
          </p>
          <Button
            data-hero-cta
            size="lg"
            className="h-11 w-full rounded-lg font-medium"
            onClick={handleLoginClick}
            disabled={isExiting}
          >
            Get started
            <ArrowRight className="ml-2 size-4" />
          </Button>
          <p
            data-hero-footer
            className="mt-6 text-center text-xs text-muted-foreground"
          >
            Before continuing, please read our{" "}
            <Link
              href="/privacy"
              className="font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              privacy commitments
            </Link>
          </p>
        </div>
      </div>

      {/* Right — app preview */}
      <div
        className="relative z-10 hidden items-center justify-center py-10 pl-4 pr-10 lg:flex lg:w-1/2"
        style={{ perspective: "1200px" }}
      >
        <div
          data-hero-preview-shell
          className="w-full overflow-hidden rounded-2xl shadow-[0_32px_80px_-12px_rgba(0,0,0,0.5)]"
          style={{
            transform: "rotateY(-5deg) rotateX(2deg)",
            transformOrigin: "center center",
          }}
        >
          <AppPreview />
        </div>
      </div>
    </section>
  );
}
