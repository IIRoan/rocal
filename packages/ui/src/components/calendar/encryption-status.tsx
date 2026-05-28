import { Lock, ShieldCheck } from "lucide-react";

import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  type EncryptableCalendarItem,
  type EncryptionDisplayState,
  getEncryptionStatusMeta,
  resolveEncryptionState,
} from "./encryption-status-utils";

export {
  type EncryptableCalendarItem,
  type EncryptionDisplayState,
  getEncryptionStatusMeta,
  resolveEncryptionState,
} from "./encryption-status-utils";

interface EncryptionStatusBadgeProps {
  item: EncryptableCalendarItem;
  className?: string;
  /**
   * Deprecated. The badge is always rendered as a single uniform icon
   * with a tooltip on hover. Kept for source compatibility with existing
   * call sites.
   */
  showLabel?: boolean;
  labelClassName?: string;
  /**
   * When true (the default), no icon is rendered for plaintext items.
   * Calendar surfaces are dense, and showing an indicator on every
   * plaintext event/calendar adds visual noise without meaningful
   * information.
   */
  hidePlaintext?: boolean;
  /**
   * When true, renders only the status icon (non-interactive span). Use this
   * when embedding inside another button/clickable element to avoid nested
   * interactive elements (which break hydration / a11y).
   */
  asIcon?: boolean;
  /**
   * Override the icon and button size. Defaults to "sm" (h-3 w-3 icon, h-5 w-5
   * button). Use "md" to match standard toolbar icon buttons (h-4 w-4 icon,
   * h-7 w-7 button).
   */
  iconSize?: "sm" | "md";
}

export function EncryptionStatusBadge({
  item,
  className,
  hidePlaintext = true,
  asIcon = false,
  iconSize = "sm",
}: EncryptionStatusBadgeProps) {
  const meta = getEncryptionStatusMeta(item);
  const { Icon } = meta;

  const iconCls = iconSize === "md" ? "h-7 w-7" : "h-4 w-4";
  const buttonCls =
    iconSize === "md" ? "h-7 w-7 rounded" : "h-4 w-4 rounded-sm";
  const spanCls = iconSize === "md" ? "h-7 w-7" : "h-4 w-4";

  if (hidePlaintext && meta.state === "plaintext") {
    return null;
  }

  if (asIcon) {
    return (
      <span
        aria-label={meta.label}
        title={meta.label}
        className={cn(
          "inline-flex items-center justify-center shrink-0",
          spanCls,
          className,
        )}
      >
        <Icon
          className={cn(iconCls, meta.iconClassName)}
          aria-hidden
          strokeWidth={2.25}
        />
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={meta.label}
          className={cn(
            "inline-flex items-center justify-center shrink-0",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            "transition-colors hover:bg-accent/40",
            buttonCls,
            className,
          )}
        >
          <Icon
            className={cn(iconCls, meta.iconClassName)}
            aria-hidden
            strokeWidth={2.25}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="w-72 p-0 overflow-hidden"
      >
        <div className="flex items-start gap-2.5 px-3 pt-3 pb-2 border-b border-border/50">
          <div
            className={cn(
              "flex items-center justify-center h-7 w-7 rounded-md shrink-0 bg-muted/50",
            )}
          >
            <Icon
              className={cn("h-4 w-4", meta.iconClassName)}
              strokeWidth={2.25}
              aria-hidden
            />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium leading-tight">
              {meta.label}
            </div>
            <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">
              {meta.description}
            </div>
          </div>
        </div>
        <div className="px-3 py-2.5 space-y-2.5">
          {meta.protectedFields.length > 0 && (
            <div>
              <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase mb-1">
                Encrypted on server
              </div>
              <ul className="space-y-0.5">
                {meta.protectedFields.map((field) => (
                  <li
                    key={`enc-${field}`}
                    className="text-xs flex items-center gap-1.5"
                  >
                    <ShieldCheck
                      className="h-3 w-3 text-primary shrink-0"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <span className="truncate">{field}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {meta.visibleFields.length > 0 && (
            <div>
              <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase mb-1">
                Visible to server
              </div>
              <ul className="space-y-0.5">
                {meta.visibleFields.map((field) => (
                  <li
                    key={`plain-${field}`}
                    className="text-xs flex items-center gap-1.5 text-muted-foreground"
                  >
                    <Lock
                      className="h-3 w-3 opacity-40 shrink-0"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <span className="truncate">{field}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
