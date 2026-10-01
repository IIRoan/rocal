import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  type CalendarEncryptionKind,
  type EncryptableCalendarItem,
  getEncryptionStatusMeta,
} from "./encryption-status-utils";

export {
  type EncryptableCalendarItem,
  type EncryptionDisplayState,
  getEncryptionStatusMeta,
  resolveEncryptionState,
} from "./encryption-status-utils";

interface EncryptionStatusBadgeProps {
  item: EncryptableCalendarItem;
  kind?: CalendarEncryptionKind;
  className?: string;
  showLabel?: boolean;
  labelClassName?: string;
  hidePlaintext?: boolean;
  asIcon?: boolean;
  iconSize?: "sm" | "md";
}

export function EncryptionStatusBadge({
  item,
  kind = "event",
  className,
  hidePlaintext = true,
  asIcon = false,
  iconSize = "sm",
}: EncryptionStatusBadgeProps) {
  const meta = getEncryptionStatusMeta(item, kind);
  const { Icon } = meta;
  const summary = [
    meta.description,
    `Server can read: ${meta.visibleFields.join("; ")}.`,
    meta.originWarning,
    meta.policyNotice,
  ]
    .filter(Boolean)
    .join(" ");

  if (hidePlaintext && meta.state === "plaintext") return null;

  if (asIcon) {
    return (
      <span
        aria-label={`${meta.label}. ${summary}`}
        title={`${meta.label}. ${summary}`}
        className={cn(
          "inline-flex shrink-0 items-center justify-center",
          iconSize === "md" ? "size-7" : "size-4",
          className,
        )}
      >
        <Icon
          className={cn("size-4", meta.iconClassName)}
          aria-hidden
          strokeWidth={2.25}
        />
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={meta.label}
          className={cn("size-11 shrink-0 cursor-pointer", className)}
        >
          <Icon className={meta.iconClassName} aria-hidden strokeWidth={2.25} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 p-3"
      >
        <p className="text-sm font-medium leading-tight">{meta.label}</p>
        <p className="text-xs leading-snug text-muted-foreground">
          {meta.description}
        </p>
        <p className="text-xs leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">Server can read: </span>
          {meta.visibleFields.join("; ")}.
        </p>
        {meta.originWarning ? (
          <p className="text-xs leading-snug text-muted-foreground">
            {meta.originWarning}
          </p>
        ) : null}
        {meta.policyNotice ? (
          <p className="text-xs leading-snug text-muted-foreground">
            {meta.policyNotice}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
