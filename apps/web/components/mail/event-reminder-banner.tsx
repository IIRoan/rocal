import type { EventReminderMailView } from "@workspace/calendar-core";
import { Bell, Clock, ExternalLink, Loader2, MapPin } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import {
  InvitationBanner,
  InvitationBannerHeader,
  InvitationBannerMeta,
  InvitationBannerMetaItem,
} from "@workspace/ui/components/ui/invitation-banner";
import { cn } from "@workspace/ui/lib/utils";

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

  return (
    <InvitationBanner
      className={cn(
        "border-primary/15 bg-primary/[0.04]",
        className,
      )}
    >
      <InvitationBannerHeader
        label={
          <span className="inline-flex items-center gap-1.5 text-primary/80">
            <Bell className="size-3 shrink-0" strokeWidth={2.25} />
            Event reminder
          </span>
        }
        title={
          loading ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 shrink-0 animate-spin" />
              Loading event details…
            </span>
          ) : error ? (
            "Couldn't load event"
          ) : (
            reminder?.title ?? "Event reminder"
          )
        }
        description={
          error ? (
            <span className="text-destructive">{error}</span>
          ) : loading ? (
            "Fetching the latest event content from your calendar."
          ) : reminder ? (
            reminder.timeUntilEvent
          ) : null
        }
        action={
          <Button asChild variant="secondary" size="xs" className="gap-1.5">
            <a href={eventUrl}>
              Open in calendar
              <ExternalLink className="size-3" />
            </a>
          </Button>
        }
      />
      {!loading && !error && reminder ? (
        <InvitationBannerMeta>
          <InvitationBannerMetaItem icon={Clock}>
            {reminder.eventDate} · {reminder.eventTime}
          </InvitationBannerMetaItem>
          {reminder.location ? (
            <InvitationBannerMetaItem icon={MapPin}>
              {reminder.location}
            </InvitationBannerMetaItem>
          ) : null}
        </InvitationBannerMeta>
      ) : null}
    </InvitationBanner>
  );
}
