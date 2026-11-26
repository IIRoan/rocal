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
import { cn } from "@workspace/ui/lib/utils";
import {
  COMPOSE_MENU_CLASS,
  COMPOSE_TOOL_CLASS,
  ComposeMenuHeading,
  ComposeMenuNote,
} from "./compose-menu";

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
            className={cn(COMPOSE_TOOL_CLASS, open && "bg-[var(--bg-overlay-tertiary)] text-[var(--icon-primary)]")}
          >
            <FileText className="size-[17px]" />
          </button>
        </PopoverTrigger>
      </SimpleTooltip>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        // Focus returns to the body editor on insert, not to this trigger.
        onCloseAutoFocus={(event) => event.preventDefault()}
        className={cn(COMPOSE_MENU_CLASS, "w-[21rem]")}
      >
        <ComposeMenuHeading>Insert template</ComposeMenuHeading>
        {templates.length === 0 ? (
          <p className="px-2.5 pb-2 text-sm leading-snug text-muted-foreground">
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
              className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-foreground">{template.name}</span>
                <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                  {template.subject || template.body.replace(/\s+/g, " ").trim()}
                </span>
              </span>
            </button>
          ))
        )}
        {templates.length > 0 ? <ComposeMenuNote>Manage templates in Mail settings.</ComposeMenuNote> : null}
      </PopoverContent>
    </Popover>
  );
}
