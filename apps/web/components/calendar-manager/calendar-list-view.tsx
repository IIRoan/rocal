import type { ComponentType } from "react";
import type { Calendar } from "@workspace/calendar-core";
import {
  EncryptionStatusBadge,
  getColorSwatchValue,
  useCalendarContext,
} from "@workspace/ui/components/calendar";
import { ChevronRight, Eye, EyeOff, Globe, Plus, Tag } from "lucide-react";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { partitionCalendarsByKind } from "@/lib/calendar-ui-helpers";
import { CalendarManagerHeader } from "./calendar-manager-header";

const ROW_BUTTON_CLASS =
  "rounded-md text-left hover:bg-accent/30 focus-visible:bg-accent/50 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-colors";

const SECTION_LABEL_CLASS =
  "px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1";

function ownedCalendarSubtitle(calendar: Calendar) {
  if (calendar.isSyncOnly) return "Synced (read-only)";
  if (calendar.isDefault) return "Default";
  return null;
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 w-full cursor-pointer ${ROW_BUTTON_CLASS}`}
    >
      <Icon className="size-4 text-muted-foreground shrink-0" />
      <span className="text-sm">{label}</span>
      <ChevronRight className="ml-auto size-3.5 text-muted-foreground/40 shrink-0" />
    </button>
  );
}

function CalendarRow({
  calendar,
  subtitle,
  onOpen,
}: {
  calendar: Calendar;
  subtitle: string | null;
  onOpen: () => void;
}) {
  const { toggleCalendarVisibility, isCalendarVisible } = useCalendarContext();
  const isVisible = isCalendarVisible(calendar.id);
  return (
    <div className="flex items-center group/cal">
      <button
        type="button"
        onClick={onOpen}
        className={`flex items-center gap-3 px-3 py-2 flex-1 min-w-0 ${ROW_BUTTON_CLASS}`}
      >
        <div
          className="size-3.5 rounded-sm shrink-0"
          style={{ backgroundColor: getColorSwatchValue(calendar.color) }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{calendar.name}</div>
          {subtitle ? (
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        <EncryptionStatusBadge
          item={calendar}
          kind="calendar"
          asIcon
          className="opacity-80"
        />
        <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
      </button>
      <button
        type="button"
        onClick={() => toggleCalendarVisibility(calendar.id)}
        aria-label={
          isVisible ? `Hide ${calendar.name}` : `Show ${calendar.name}`
        }
        className="shrink-0 size-7 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/40 transition-colors mr-1"
      >
        {isVisible ? (
          <Eye className="size-3.5" strokeWidth={2} />
        ) : (
          <EyeOff className="size-3.5" strokeWidth={2} />
        )}
      </button>
    </div>
  );
}

function ExternalCalendarSection({
  title,
  subtitle,
  calendars,
  onGoToSubscriptions,
}: {
  title: string;
  subtitle: string;
  calendars: Calendar[];
  onGoToSubscriptions: (calendarId?: string) => void;
}) {
  if (calendars.length === 0) return null;
  return (
    <>
      <div className={SECTION_LABEL_CLASS}>{title}</div>
      <div className="p-1">
        {calendars.map((calendar) => (
          <CalendarRow
            key={calendar.id}
            calendar={calendar}
            subtitle={subtitle}
            onOpen={() => onGoToSubscriptions(calendar.id)}
          />
        ))}
      </div>
    </>
  );
}

export function CalendarListView({
  onBack,
  onCreate,
  onEdit,
  onGoToSubscriptions,
  onGoToCategories,
}: {
  onBack: () => void;
  onCreate: () => void;
  onEdit: (calendar: Calendar) => void;
  onGoToSubscriptions: (calendarId?: string) => void;
  onGoToCategories: () => void;
}) {
  const { calendars } = useSharedCalendarData();
  const { ownedCalendars, publicCalendars, subscribedCalendars } =
    partitionCalendarsByKind(calendars);

  return (
    <div className="flex flex-col">
      <CalendarManagerHeader title="Calendars" onBack={onBack} />
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
          Actions
        </div>
        <div className="p-1">
          <ActionRow
            icon={Plus}
            label="Create New Calendar"
            onClick={onCreate}
          />
          <ActionRow
            icon={Globe}
            label="Public & External Feeds"
            onClick={() => onGoToSubscriptions()}
          />
          <ActionRow icon={Tag} label="Categories" onClick={onGoToCategories} />
        </div>

        <div className={SECTION_LABEL_CLASS}>Your Calendars</div>
        <div className="p-1">
          {ownedCalendars.map((calendar) => (
            <CalendarRow
              key={calendar.id}
              calendar={calendar}
              subtitle={ownedCalendarSubtitle(calendar)}
              onOpen={() =>
                calendar.isSyncOnly
                  ? onGoToSubscriptions(calendar.id)
                  : onEdit(calendar)
              }
            />
          ))}
        </div>

        <ExternalCalendarSection
          title="Public Calendars"
          subtitle="Public holiday calendar"
          calendars={publicCalendars}
          onGoToSubscriptions={onGoToSubscriptions}
        />
        <ExternalCalendarSection
          title="Subscribed Calendars"
          subtitle="External subscription"
          calendars={subscribedCalendars}
          onGoToSubscriptions={onGoToSubscriptions}
        />
      </div>
    </div>
  );
}
