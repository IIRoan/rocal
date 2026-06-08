import type { ComponentPropsWithoutRef, ReactNode } from "react";
import {
  EVENT_REMINDER_MAIL_CONTENT_HEIGHT_PX,
  EVENT_REMINDER_MAIL_MAX_WIDTH_PX,
  EVENT_REMINDER_MAIL_MIN_FILL_RATIO,
  type EventReminderMailView,
} from "@workspace/calendar-core";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@workspace/ui/lib/utils";

type EventReminderBodyShellProps = {
  isDark?: boolean;
  attachedAbove?: boolean;
  className?: string;
  children: ReactNode;
} & ComponentPropsWithoutRef<"div">;

function EventReminderBodyShell({
  isDark = false,
  attachedAbove = false,
  className,
  children,
  ...props
}: EventReminderBodyShellProps) {
  return (
    <div
      {...props}
      className={cn(
        "mx-4 mb-2 flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/50",
        "min-h-[max(var(--event-reminder-min-fill),calc(min(100cqw,var(--event-reminder-max-width))*var(--event-reminder-height-ratio)))]",
        isDark ? "bg-[#1a1a1a] [color-scheme:dark]" : "bg-white [color-scheme:light]",
        attachedAbove && "rounded-t-none border-t-0",
        className,
      )}
      style={{
        ["--event-reminder-max-width" as string]: `${EVENT_REMINDER_MAIL_MAX_WIDTH_PX}px`,
        ["--event-reminder-height-ratio" as string]: String(
          EVENT_REMINDER_MAIL_CONTENT_HEIGHT_PX / EVENT_REMINDER_MAIL_MAX_WIDTH_PX,
        ),
        ["--event-reminder-min-fill" as string]: `${EVENT_REMINDER_MAIL_MIN_FILL_RATIO * 100}%`,
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-[555px] flex-1 flex-col px-7 pt-12 pb-10">
        {children}
      </div>
    </div>
  );
}

type EventReminderMessageBodyProps = {
  reminder: EventReminderMailView;
  className?: string;
  isDark?: boolean;
  attachedAbove?: boolean;
};

export function EventReminderMessageBody({
  reminder,
  className,
  isDark = false,
  attachedAbove = false,
}: EventReminderMessageBodyProps) {
  const eventUrl = `/calendar?eventId=${encodeURIComponent(reminder.eventId)}`;

  return (
    <EventReminderBodyShell
      isDark={isDark}
      attachedAbove={attachedAbove}
      className={className}
    >
      <Link href="/calendar" className="mb-7 inline-block outline-none">
        <Image
          src="/favicon-192x192.png"
          alt="Solace"
          width={36}
          height={36}
          className="block size-9"
          unoptimized
        />
      </Link>

      <h1
        className={cn(
          "m-0 text-[22px] font-bold leading-[130%] tracking-[-0.01em]",
          isDark ? "text-white" : "text-black",
        )}
      >
        {reminder.title}
      </h1>
      <p
        className={cn(
          "mt-1.5 text-[15px] leading-[130%]",
          isDark ? "text-white/55" : "text-black/50",
        )}
      >
        {reminder.timeUntilEvent}
      </p>

      <div className="mt-7">
        <ReminderDetail
          isDark={isDark}
          label="When"
          value={`${reminder.eventDate} · ${reminder.eventTime}`}
        />
        {reminder.location ? (
          <ReminderDetail
            isDark={isDark}
            label="Where"
            value={reminder.location}
          />
        ) : null}
        {reminder.calendarName ? (
          <ReminderDetail
            isDark={isDark}
            label="Calendar"
            value={reminder.calendarName}
          />
        ) : null}
        {reminder.duration ? (
          <ReminderDetail
            isDark={isDark}
            label="Duration"
            value={reminder.duration}
          />
        ) : null}
      </div>

      <div className="pt-1.5">
        <Link
          href={eventUrl}
          className={cn(
            "inline-block rounded-xl border px-5 py-3 text-[15px] font-medium leading-none no-underline transition-colors",
            isDark
              ? "border-white/15 bg-[#2a2a2a] text-white hover:bg-[#333]"
              : "border-black/12 border-b-2 bg-white text-black hover:bg-black/[0.02]",
          )}
        >
          Open Event
        </Link>
      </div>

      <hr
        className={cn(
          "my-9 h-px border-0",
          isDark ? "bg-[#333]" : "bg-[#e5e5e5]",
        )}
      />

      <p
        className={cn(
          "mb-1.5 text-xs font-semibold leading-snug",
          isDark ? "text-[#666]" : "text-[#a8a8a8]",
        )}
      >
        Solace
      </p>
      <p
        className={cn(
          "mb-1 text-xs leading-normal",
          isDark ? "text-[#666]" : "text-[#a8a8a8]",
        )}
      >
        This reminder was sent because email notifications are enabled for your
        account.
      </p>
      <p
        className={cn(
          "m-0 text-xs leading-normal",
          isDark ? "text-[#666]" : "text-[#a8a8a8]",
        )}
      >
        <Link
          href="/settings"
          className={cn(
            "underline",
            isDark ? "text-[#666]" : "text-[#a8a8a8]",
          )}
        >
          Settings
        </Link>
        {" · "}
        <Link
          href="/privacy"
          className={cn(
            "underline",
            isDark ? "text-[#666]" : "text-[#a8a8a8]",
          )}
        >
          Privacy
        </Link>
        {" · "}
        <Link
          href="/calendar"
          className={cn(
            "underline",
            isDark ? "text-[#666]" : "text-[#a8a8a8]",
          )}
        >
          Calendar
        </Link>
      </p>
    </EventReminderBodyShell>
  );
}

type EventReminderMessageBodyLoadingProps = {
  isDark?: boolean;
  attachedAbove?: boolean;
  className?: string;
};

export function EventReminderMessageBodyLoading({
  isDark = false,
  attachedAbove = false,
  className,
}: EventReminderMessageBodyLoadingProps) {
  const skeleton = isDark ? "bg-white/10" : "bg-black/[0.06]";

  return (
    <EventReminderBodyShell
      isDark={isDark}
      attachedAbove={attachedAbove}
      className={className}
      aria-busy
      aria-label="Loading event reminder"
    >
      <div className={cn("mb-7 size-9 animate-pulse rounded-md", skeleton)} />
      <div className={cn("h-7 w-3/5 max-w-[280px] animate-pulse rounded-md", skeleton)} />
      <div
        className={cn(
          "mt-2 h-4 w-2/5 max-w-[180px] animate-pulse rounded-md",
          skeleton,
        )}
      />
      <div className="mt-7 space-y-5">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className={cn("h-3 w-12 animate-pulse rounded", skeleton)} />
            <div className={cn("h-5 w-full animate-pulse rounded-md", skeleton)} />
          </div>
        ))}
      </div>
      <div
        className={cn(
          "mt-6 h-11 w-[132px] animate-pulse rounded-xl",
          skeleton,
        )}
      />
      <div className={cn("my-9 h-px", isDark ? "bg-[#333]" : "bg-[#e5e5e5]")} />
      <div className={cn("h-3 w-14 animate-pulse rounded", skeleton)} />
      <div className={cn("mt-2 h-3 w-full animate-pulse rounded", skeleton)} />
      <div className={cn("mt-2 h-3 w-4/5 animate-pulse rounded", skeleton)} />
    </EventReminderBodyShell>
  );
}

function ReminderDetail({
  label,
  value,
  isDark,
}: {
  label: string;
  value: string;
  isDark: boolean;
}) {
  return (
    <div className="mb-[18px] last:mb-0">
      <div
        className={cn(
          "mb-1 text-[11px] font-semibold uppercase leading-[14px] tracking-[0.06em]",
          isDark ? "text-white/40" : "text-[#999]",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "break-words text-base font-normal leading-[22px]",
          isDark ? "text-[#e5e5e5]" : "text-[#1a1a1a]",
        )}
      >
        {value}
      </div>
    </div>
  );
}
