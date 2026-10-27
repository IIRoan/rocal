"use client";

import { useState, type CSSProperties } from "react";
import {
  DEFAULT_TIME_FORMAT,
  getDeviceTimezone,
  getWeekCalendarDays,
  resolveTimezone,
  wallClockToUtc,
} from "@workspace/calendar-core";
import {
  EventGap,
  EventHeight,
  WeekCellsHeight,
  WeekView,
  type CalendarEvent,
  type EventColor,
} from "@workspace/ui/components/calendar";
import { EventCalendarToolbar } from "@workspace/ui/components/calendar/event-calendar-toolbar";
import { SolaceTheme } from "@workspace/ui/solace";
import { MailMailboxHeader } from "@/components/mail/mail-mailbox-header";
import { MessageListRow } from "@/components/mail/message-list/message-list-row";
import type {
  MessageListRowInteraction,
  MessageListRowPresentation,
} from "@/components/mail/message-list/message-list-types";
import type { MessageListThreadRow } from "@/components/mail/message-list/message-list-utils";

const WEEK_START_DAY = 1;

const SAMPLE_EVENTS: {
  weekday: number;
  start: [number, number];
  end: [number, number];
  title: string;
  color: EventColor;
}[] = [
  { weekday: 0, start: [9, 0], end: [9, 45], title: "Standup", color: "sky" },
  { weekday: 0, start: [12, 30], end: [13, 30], title: "Lunch with Maya", color: "amber" },
  { weekday: 1, start: [10, 0], end: [11, 30], title: "Design review", color: "violet" },
  { weekday: 2, start: [9, 30], end: [10, 30], title: "Yoga", color: "emerald" },
  { weekday: 2, start: [11, 0], end: [12, 0], title: "1:1 with Sam", color: "sky" },
  { weekday: 3, start: [10, 30], end: [12, 0], title: "Planning", color: "indigo" },
  { weekday: 4, start: [9, 0], end: [10, 0], title: "Dentist", color: "rose" },
  { weekday: 4, start: [11, 30], end: [12, 30], title: "Coffee with Ana", color: "orange" },
  { weekday: 5, start: [10, 0], end: [12, 0], title: "Farmers market", color: "lime" },
];

const SAMPLE_MAIL = [
  {
    from: "Maya Lindqvist",
    subject: "Saturday market?",
    preview: "Still on for Saturday? I can pick you up around ten.",
    minutesAgo: 25,
    unread: true,
  },
  {
    from: "Studio Noord",
    subject: "Your class is booked",
    preview: "Thursday at 18:00, mat 4. See you there.",
    minutesAgo: 140,
    unread: true,
  },
  {
    from: "Sam de Vries",
    subject: "Re: Splitting the rent",
    preview: "Sounds fair to me, I'll send my half tonight.",
    minutesAgo: 60 * 26,
    unread: false,
  },
  {
    from: "Dr. Patel's office",
    subject: "Appointment reminder",
    preview: "A reminder of your appointment this Friday at 9:00.",
    minutesAgo: 60 * 24 * 3,
    unread: false,
  },
] as const;

const noop = () => {};

const MAIL_INTERACTION: MessageListRowInteraction = {
  selectedMessageId: null,
  selectedIds: new Set(),
  onSelect: noop,
  onToggleSelect: noop,
  onToggleThreadExpand: noop,
};

const CALENDAR_STYLE = {
  "--event-height": `${EventHeight}px`,
  "--event-gap": `${EventGap}px`,
  "--week-cells-height": `${WeekCellsHeight}px`,
  "--calendar-toolbar-height": "52px",
  "--calendar-toolbar-height-sm": "56px",
} as CSSProperties;

function buildWeekEvents(now: Date, timezone: string): CalendarEvent[] {
  const days = getWeekCalendarDays(now, WEEK_START_DAY, timezone);
  return SAMPLE_EVENTS.flatMap((sample) => {
    const day = days[sample.weekday];
    if (!day) return [];
    return [
      {
        id: `preview-${sample.title}`,
        title: sample.title,
        color: sample.color,
        start: wallClockToUtc(day, ...sample.start, timezone),
        end: wallClockToUtc(day, ...sample.end, timezone),
        calendarId: "preview",
        userId: "preview",
        createdAt: now,
        updatedAt: now,
      },
    ];
  });
}

/** Senders carry no address, so the avatars never look anyone up. */
function buildInboxRows(now: Date): MessageListThreadRow[] {
  return SAMPLE_MAIL.map((sample) => {
    const message = {
      id: `preview-${sample.from}`,
      subject: sample.subject,
      preview: sample.preview,
      from: [{ name: sample.from, email: "" }],
      receivedAt: new Date(
        now.getTime() - sample.minutesAgo * 60_000,
      ).toISOString(),
      keywords: sample.unread ? {} : { $seen: true },
    };
    return {
      id: message.id,
      messages: [message],
      messageIds: [message.id],
      latestMessage: message,
    };
  });
}

/** The real calendar and mail components on sample data, inert so it reads as a picture. */
export function AppPreview() {
  const [now] = useState(() => new Date());
  const timezone = resolveTimezone(getDeviceTimezone());
  const rows = buildInboxRows(now);
  const presentation: MessageListRowPresentation = {
    labels: [],
    moveTargets: [],
    spamActions: { canReportSpam: false, canNotSpam: false },
    display: {
      isMobile: false,
      narrow: true,
      density: "comfortable",
      showLabelChips: false,
      threadExpandEnabled: false,
    },
    threadUi: {
      expandedThreads: new Set(),
      expandedThreadMessages: {},
      loadingThreadIds: new Set(),
    },
    timeFormat: DEFAULT_TIME_FORMAT,
    timezone,
    mailboxActions: {},
  };

  return (
    <div
      inert
      className="flex flex-col gap-3 sm:grid sm:grid-cols-[56fr_8fr_36fr] sm:items-start sm:gap-0"
    >
      <div
        className="isolate overflow-hidden rounded-xl bg-background shadow-md ring-1 ring-border sm:col-span-2 sm:col-start-1 sm:row-start-1"
        style={CALENDAR_STYLE}
      >
        <div className="max-sm:hidden">
          <EventCalendarToolbar
            currentDate={now}
            onNext={noop}
            onPrevious={noop}
            onToday={noop}
            onViewChange={noop}
            timezone={timezone}
            view="week"
            weekStartDay={WEEK_START_DAY}
          />
        </div>
        <div className="relative h-60 sm:h-72">
          <WeekView
            currentDate={now}
            events={buildWeekEvents(now, timezone)}
            onEventSelect={noop}
            onEventCreate={noop}
            timeFormat={DEFAULT_TIME_FORMAT}
            weekStartDay={WEEK_START_DAY}
            timezone={timezone}
          />
        </div>
      </div>
      <SolaceTheme
        scoped
        className="relative isolate h-auto overflow-hidden rounded-xl bg-[var(--bg-l2-solid)] shadow-md ring-1 ring-border sm:col-span-2 sm:col-start-2 sm:row-start-1 sm:mt-14"
      >
        <MailMailboxHeader
          title="Inbox"
          unreadCount={2}
          filter={{ value: "all", onChange: noop }}
          searchInputRef={null}
          search={{
            open: false,
            value: "",
            busy: false,
            onOpenChange: noop,
            onChange: noop,
            onKeyDown: noop,
            onClear: noop,
          }}
          advanced={{
            filters: { conditions: [] },
            expanded: false,
            onFiltersChange: noop,
            onExpandedChange: noop,
          }}
          refresh={{ spinning: false, disabled: false, onClick: noop }}
        />
        {rows.map((row, index) => (
          <div key={row.id} className={index > 1 ? "max-sm:hidden" : undefined}>
            <MessageListRow
              row={row}
              primaryIds={new Set(row.messageIds)}
              interaction={MAIL_INTERACTION}
              presentation={presentation}
            />
          </div>
        ))}
      </SolaceTheme>
    </div>
  );
}
