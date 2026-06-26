import { useState } from "react";
import { MailOpen, MoreHorizontal, Trash2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { cn } from "@workspace/ui/lib/utils";

export function ConversationMessageMenu({
  messageId,
  isRead,
  onDelete,
  onMarkUnread,
}: {
  messageId: string;
  isRead: boolean;
  onDelete?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Message actions"
          className={cn(
            "shrink-0 flex size-6 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <MoreHorizontal className="size-3.5" strokeWidth={2.25} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-48 p-1 overflow-hidden rounded-lg border border-border shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        {isRead && onMarkUnread && (
          <button
            type="button"
            onClick={() => {
              onMarkUnread(messageId);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-foreground/80 hover:bg-accent/50 transition-colors text-left"
          >
            <MailOpen
              className="size-3.5 text-muted-foreground"
              strokeWidth={2}
            />
            Mark as unread
          </button>
        )}
        {onDelete && (
          <>
            {isRead && onMarkUnread && (
              <div className="mx-1 my-1 h-px bg-border/40" />
            )}
            <button
              type="button"
              onClick={() => {
                onDelete(messageId);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-destructive/80 hover:bg-destructive/10 transition-colors text-left"
            >
              <Trash2 className="size-3.5" strokeWidth={2} />
              Delete
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
