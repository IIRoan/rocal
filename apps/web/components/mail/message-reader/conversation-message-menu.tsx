import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  Dropdown,
  DropdownDivider,
  DropdownItem,
  Icon,
} from "@workspace/ui/solace";

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
  const canMarkUnread = isRead && Boolean(onMarkUnread);

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      width={192}
      trigger={
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Message actions"
          className="shrink-0 flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <MoreHorizontal className="size-3.5" strokeWidth={2.25} />
        </button>
      }
    >
      {canMarkUnread ? (
        <DropdownItem
          icon={Icon.EnvelopeUnread}
          label="Mark as unread"
          onSelect={() => onMarkUnread?.(messageId)}
        />
      ) : null}
      {onDelete ? (
        <>
          {canMarkUnread ? <DropdownDivider /> : null}
          <DropdownItem
            icon={Icon.Trash}
            label="Delete"
            destructive
            onSelect={() => onDelete(messageId)}
          />
        </>
      ) : null}
    </Dropdown>
  );
}
