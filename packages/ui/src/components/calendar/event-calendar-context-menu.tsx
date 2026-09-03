import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import {
  canCurrentUserDeleteEvent,
  canCurrentUserEditEvent,
  wallClockToUtc,
} from "@workspace/calendar-core";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { DefaultStartHour } from "./constants";
import type { CalendarEvent } from "./types";

export type EventCalendarContextTarget =
  | { type: "event"; event: CalendarEvent }
  | { type: "timeline"; startTime: Date }
  | { type: "general" };

export function EventCalendarContextMenu({
  currentDate,
  onCreateEvent,
  onDeleteEvent,
  onEditEvent,
  onOpenChange,
  open,
  position,
  target,
  timezone,
}: {
  currentDate: Date;
  onCreateEvent: (startTime: Date) => void;
  onDeleteEvent: (eventId: string) => void;
  onEditEvent?: (
    event: CalendarEvent,
    options?: {
      mode?: "modal" | "popover";
      eventViewMode?: "view" | "edit";
    },
  ) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  position: { x: number; y: number };
  target: EventCalendarContextTarget;
  timezone: string;
}) {
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          className="fixed size-px opacity-0 pointer-events-none"
          style={{
            left: position.x,
            top: position.y,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {target.type === "event" ? (
          target.event.isSynced ? (
            <>
              <DropdownMenuItem
                onClick={() =>
                  onEditEvent?.(target.event, {
                    mode: "modal",
                    eventViewMode: "view",
                  })
                }
              >
                <Eye className="size-4" />
                View
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Synced calendar event - cannot edit
              </div>
            </>
          ) : (
            <>
              <DropdownMenuItem
                onClick={() =>
                  onEditEvent?.(target.event, {
                    mode: "modal",
                    eventViewMode: "view",
                  })
                }
              >
                <Eye className="size-4" />
                View
              </DropdownMenuItem>
              {canCurrentUserEditEvent(target.event) ? (
                <DropdownMenuItem
                  onClick={() =>
                    onEditEvent?.(target.event, {
                      mode: "modal",
                      eventViewMode: "edit",
                    })
                  }
                >
                  <Pencil className="size-4" />
                  Edit
                </DropdownMenuItem>
              ) : null}
              {canCurrentUserDeleteEvent(target.event) ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDeleteEvent(target.event.id)}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </>
          )
        ) : (
          <DropdownMenuItem
            onClick={() => {
              if (target.type === "timeline") {
                onCreateEvent(new Date(target.startTime));
                return;
              }

              onCreateEvent(
                wallClockToUtc(currentDate, DefaultStartHour, 0, timezone),
              );
            }}
          >
            <Plus className="size-4" />
            Create event
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
