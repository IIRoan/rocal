import type { EventReminderMailView } from "@workspace/calendar-core";
import { Clock, ExternalLink, Loader2, MapPin } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import { cn } from "@workspace/ui/lib/utils";
import { MailNotificationBanner } from "./mail-notification-banner";

type EventReminderBannerProps = {
  eventId: string;
  loading?: boolean;
  error?: string | null;
  reminder?: EventReminderMailView | null;
  className?: string;
};

export function EventReminderBanner({
  eventId,
  loading = false,
  error = null,
  reminder,
  className,
}: EventReminderBannerProps) {
  const eventUrl = `/calendar?eventId=${encodeURIComponent(eventId)}`;

  const title = loading ? (
    <span className="flex items-center gap-2 text-muted-foreground">
      <Loader2 className="size-4 shrink-0 animate-spin" />
      Loading event details…
    </span>
  ) : error ? (
    "Couldn't load event"
  ) : (
    (reminder?.title ?? "Event reminder")
  );

  const description = error ? (
    <span className="text-destructive">{error}</span>
  ) : loading ? (
    "Fetching the latest event content from your calendar."
  ) : reminder ? (
    reminder.timeUntilEvent
  ) : undefined;

  const meta =
    !loading && !error && reminder
      ? [
          {
            icon: Clock,
            children: `${reminder.eventDate} · ${reminder.eventTime}`,
          },
          ...(reminder.location
            ? [{ icon: MapPin, children: reminder.location }]
            : []),
        ]
      : undefined;

  const actions =
    !loading && !error ? (
      <Button asChild variant="outline" size="xs" className="ml-auto gap-1.5">
        <a href={eventUrl}>
          Open in calendar
          <ExternalLink className="size-3" />
        </a>
      </Button>
    ) : undefined;

  return (
    <MailNotificationBanner
      className={cn("shrink-0", className)}
      title={title}
      description={description}
      meta={meta}
      actions={actions}
    />
  );
}
