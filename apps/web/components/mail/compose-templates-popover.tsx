"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import type { MailTemplate } from "@workspace/calendar-core";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";

export function ComposeTemplatesPopover({
  templates,
  disabled,
  onInsert,
}: {
  templates: MailTemplate[];
  disabled: boolean;
  onInsert: (template: MailTemplate) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <SimpleTooltip content="Insert template">
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Insert template"
            className="cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <FileText className="size-4" />
          </button>
        </PopoverTrigger>
      </SimpleTooltip>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        // Focus returns to the body editor on insert, not to this trigger.
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="z-[100] flex max-h-80 w-72 max-w-[calc(100dvw-2rem)] flex-col gap-1 overflow-y-auto p-2"
      >
        <p className="px-2 pt-1 pb-1 text-xs font-medium text-muted-foreground">
          Templates
        </p>
        {templates.length === 0 ? (
          <p className="px-2 pb-2 text-sm leading-snug text-muted-foreground">
            No templates yet. Add one in Mail settings under Templates.
          </p>
        ) : (
          templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => {
                setOpen(false);
                onInsert(template);
              }}
              className="flex min-h-9 cursor-pointer flex-col rounded-md px-2 py-1.5 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate text-sm text-foreground">{template.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {template.subject || template.body.replace(/\s+/g, " ").trim()}
              </span>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
