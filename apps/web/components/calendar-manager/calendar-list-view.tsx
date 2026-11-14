import type { ComponentType } from "react";
import type { Calendar } from "@workspace/calendar-core";
import {
  EncryptionStatusBadge,
  getColorSwatchValue,
  useCalendarContext,
} from "@workspace/ui/components/calendar";
import {
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { useCalendarIcsExport } from "@/hooks/use-calendar-ics-export";
import { partitionCalendarsByKind } from "@/lib/calendar-ui-helpers";
import { CalendarManagerHeader } from "./calendar-manager-header";

const ROW_BUTTON_CLASS =
  "rounded-md text-left hover:bg-hover/30 focus-visible:bg-hover/50 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring transition-colors";

const SECTION_LABEL_CLASS =
  "px-4 py-2 text-[13px] font-medium text-muted-foreground border-t border-border/50 mt-1";

function ownedCalendarSubtitle(calendar: Calendar) {
  if (calendar.isSyncOnly) return "Synced (read-only)";
  if (calendar.isDefault) return "Default";
  return null;
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
  pending = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-busy={pending || undefined}
      className={`flex items-center gap-3 px-3 py-2 w-full cursor-pointer disabled:cursor-default ${ROW_BUTTON_CLASS}`}
    >
      <Icon className="size-4 text-muted-foreground shrink-0" />
      <span className="text-[15px] leading-[130%]">{label}</span>
      {pending ? (
        <Loader2 className="ml-auto size-3.5 text-muted-foreground shrink-0 animate-spin" />
      ) : (
        <ChevronRight className="ml-auto size-3.5 text-muted-foreground/40 shrink-0" />
      )}
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
          className="size-3 rounded-full shrink-0"
          style={{ backgroundColor: getColorSwatchValue(calendar.color) }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] leading-[130%] truncate">
            {calendar.name}
          </div>
          {subtitle ? (
            <div className="text-[13px] leading-[130%] text-muted-foreground">
              {subtitle}
            </div>
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
        className="shrink-0 size-11 sm:size-8 flex items-center justify-center rounded-md cursor-pointer text-muted-foreground hover:text-foreground hover:bg-hover/40 transition-colors mr-1"
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
  onGoToTrash,
}: {
  onBack: () => void;
  onCreate: () => void;
  onEdit: (calendar: Calendar) => void;
  onGoToSubscriptions: (calendarId?: string) => void;
  onGoToCategories: () => void;
  onGoToTrash: () => void;
}) {
  const { calendars } = useSharedCalendarData();
  const { ownedCalendars, publicCalendars, subscribedCalendars } =
    partitionCalendarsByKind(calendars);
  const icsExport = useCalendarIcsExport();

  return (
    <div className="flex flex-col">
      <CalendarManagerHeader title="Calendars" onBack={onBack} />
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-2 text-[13px] font-medium text-muted-foreground">
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
          <ActionRow icon={Trash2} label="Trash" onClick={onGoToTrash} />
          <ActionRow
            icon={Download}
            label={icsExport.isPending ? "Exporting…" : "Export all calendars"}
            pending={icsExport.isPending}
            onClick={() =>
              icsExport.mutate(
                ownedCalendars.filter((calendar) => !calendar.isSyncOnly),
              )
            }
          />
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
