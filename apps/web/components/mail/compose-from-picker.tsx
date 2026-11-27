"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { cn } from "@workspace/ui/lib/utils";
import type { JmapIdentity } from "@/lib/mail/types";
import { SenderAvatar } from "./mail-avatar";
import { COMPOSE_MENU_CLASS, ComposeMenuHeading, ComposeMenuNote } from "./compose-menu";

const PILL_CLASS =
  "inline-flex h-8 min-w-0 max-w-full items-center gap-2 rounded-full pl-1 pr-2 text-sm";

function IdentityLabel({ name, email }: { name?: string | null; email: string }) {
  return (
    <>
      <span className="truncate text-foreground">{name || email}</span>
      {name ? <span className="hidden truncate text-muted-foreground sm:inline">{email}</span> : null}
    </>
  );
}

/** The sender pill: a menu of addresses when there is more than one, each with the signature it brings. */
export function ComposeFromPicker({
  id,
  identities,
  selected,
  fallbackEmail,
  disabled,
  signatureNameFor,
  onChange,
}: {
  id: string;
  identities: JmapIdentity[];
  selected: JmapIdentity | null;
  fallbackEmail: string;
  disabled: boolean;
  signatureNameFor: (identityId: string) => string | null;
  onChange: (identityId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const email = selected?.email ?? fallbackEmail;

  if (identities.length < 2) {
    return (
      <span id={id} className={cn(PILL_CLASS, "text-muted-foreground")}>
        <SenderAvatar name={selected?.name || email} email={email} className="size-6 shrink-0" />
        <IdentityLabel name={selected?.name} email={email} />
      </span>
    );
  }

  const hasSignatures = identities.some((identity) => signatureNameFor(identity.id));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            PILL_CLASS,
            "cursor-pointer transition-colors hover:bg-[var(--bg-overlay-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
            open && "bg-[var(--bg-overlay-tertiary)]",
          )}
        >
          <SenderAvatar name={selected?.name || email} email={email} className="size-6 shrink-0" />
          <IdentityLabel name={selected?.name} email={email} />
          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className={cn(COMPOSE_MENU_CLASS, "w-[25rem]")}>
        <ComposeMenuHeading>Send from</ComposeMenuHeading>
        {identities.map((identity) => {
          const isSelected = identity.id === selected?.id;
          const signature = signatureNameFor(identity.id);
          return (
            <button
              key={identity.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                setOpen(false);
                onChange(identity.id);
              }}
              className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <SenderAvatar name={identity.name || identity.email} email={identity.email} className="size-8 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col leading-[1.35]">
                <span className="truncate text-sm font-medium text-foreground">{identity.name || identity.email}</span>
                {identity.name ? <span className="truncate text-xs text-muted-foreground">{identity.email}</span> : null}
                {signature ? <span className="truncate text-xs text-muted-foreground/80">Signature: {signature}</span> : null}
              </span>
              {isSelected ? <Check aria-hidden className="size-4 shrink-0 text-accent" /> : null}
            </button>
          );
        })}
        {hasSignatures ? <ComposeMenuNote>Each address brings its own default signature.</ComposeMenuNote> : null}
      </PopoverContent>
    </Popover>
  );
}
