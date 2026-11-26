"use client";

import { useState } from "react";
import { Signature } from "lucide-react";
import type { ComposeSignatureOption } from "@workspace/calendar-core";
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

export function ComposeSignaturePopover({
  options,
  defaultKey,
  noneSelected,
  disabled,
  onChoose,
}: {
  options: ComposeSignatureOption[];
  /** The sender's default signature, marked so picking another is a visible choice. */
  defaultKey: string | null;
  noneSelected: boolean;
  disabled: boolean;
  onChoose: (choice: string | null | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const choose = (choice: string | null | undefined) => {
    setOpen(false);
    onChoose(choice);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <SimpleTooltip content="Signature">
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Signature"
            className={cn(COMPOSE_TOOL_CLASS, open && "bg-[var(--bg-overlay-tertiary)] text-[var(--icon-primary)]")}
          >
            <Signature className="size-[17px]" />
          </button>
        </PopoverTrigger>
      </SimpleTooltip>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        // Focus returns to the body editor on insert, not to this trigger.
        onCloseAutoFocus={(event) => event.preventDefault()}
        className={cn(COMPOSE_MENU_CLASS, "w-[19rem]")}
      >
        <ComposeMenuHeading>Signature</ComposeMenuHeading>
        {options.map((option) => (
          <SignatureOptionButton
            key={option.key}
            label={option.name}
            note={option.key === defaultKey ? "Default" : undefined}
            detail={option.preview}
            selected={option.selected}
            onClick={() => choose(option.choice)}
          />
        ))}
        <SignatureOptionButton
          label="No signature"
          selected={noneSelected}
          onClick={() => choose(null)}
        />
        {options.length === 0 ? (
          <p className="px-2.5 pb-2 text-sm leading-snug text-muted-foreground">
            No signatures yet. Add one in Mail settings under Signatures.
          </p>
        ) : (
          <ComposeMenuNote>Edit signatures in Mail settings.</ComposeMenuNote>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SignatureOptionButton({
  label,
  note,
  detail,
  selected,
  onClick,
}: {
  label: string;
  note?: string;
  detail?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden
        className={cn(
          "size-4 shrink-0 rounded-full border-[1.5px] border-input-border",
          selected && "border-[5px] border-accent",
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col leading-[1.35]">
        <span className="truncate text-sm text-foreground">
          {label}
          {note ? <span className="ml-1.5 text-xs text-muted-foreground">{note}</span> : null}
        </span>
        {detail ? (
          <span className="truncate text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </span>
    </button>
  );
}
