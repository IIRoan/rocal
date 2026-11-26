"use client";

import { useState } from "react";
import { Check, Signature } from "lucide-react";
import type { ComposeSignatureOption } from "@workspace/calendar-core";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";

export function ComposeSignaturePopover({
  options,
  noneSelected,
  disabled,
  onChoose,
}: {
  options: ComposeSignatureOption[];
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
            className="cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <Signature className="size-4" />
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
          Signature
        </p>
        {options.map((option) => (
          <SignatureOptionButton
            key={option.key}
            label={option.name}
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
          <p className="px-2 pb-2 text-sm leading-snug text-muted-foreground">
            No signatures yet. Add one in Mail settings under Signatures.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function SignatureOptionButton({
  label,
  detail,
  selected,
  onClick,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-foreground">{label}</span>
        {detail ? (
          <span className="truncate text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      {selected ? <Check className="size-4 shrink-0 text-accent" aria-hidden /> : null}
    </button>
  );
}
