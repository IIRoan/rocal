"use client";

import { useState } from "react";
import { ChevronDown, Tag } from "lucide-react";
import {
  parseSubAddress,
  type MailRecipientSummary,
  type SummarizedMailRecipient,
} from "@workspace/calendar-core";
import { DROPDOWN_PANEL_ROW_CLASS, DropdownPanel } from "@workspace/ui/solace";
import { cn } from "@workspace/ui/lib/utils";
import { SenderAvatar } from "../mail-avatar";
import { RecipientActions } from "../recipient-popover";

const GROUP_LABELS = { to: "To", cc: "Cc", bcc: "Bcc" } as const;
const STACK_SIZE = 3;

/** The plus-tag the user was reached at, in the accent so it stands out from the rest of the address. */
export function SelfTag({ tag }: { tag: string }) {
  return <span className="font-mono text-accent">+{tag}</span>;
}

/** Recipients as an avatar stack that opens the full To, Cc and Bcc list. */
export function MessageReaderRecipients({
  summary,
  compact,
}: {
  summary: MailRecipientSummary;
  /** Narrow layouts show only the count beside the stack. */
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const lead = summary.people[0];
  if (!lead) return null;
  const others = summary.people.length - 1;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setExpanded(null);
  };

  return (
    <DropdownPanel
      open={open}
      onOpenChange={onOpenChange}
      align="end"
      width={320}
      trigger={
        <button
          type="button"
          className="inline-flex h-8 max-w-[45%] shrink-0 cursor-pointer items-center gap-2 rounded-full bg-[var(--bg-overlay-tertiary)] pr-2.5 pl-1 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-overlay-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-[var(--bg-overlay-secondary)]"
        >
          <span className="flex shrink-0">
            {summary.people.slice(0, STACK_SIZE).map((person, index) => (
              <SenderAvatar
                key={person.email}
                email={person.email}
                name={person.name ?? undefined}
                className={cn(
                  "size-[22px] bg-[var(--bg-overlay-secondary)] ring-2 ring-[var(--bg-main-container)]",
                  index > 0 && "-ml-1",
                )}
              />
            ))}
          </span>
          {compact ? (
            <span className="tabular-nums text-muted-foreground">
              {summary.people.length}
              <span className="sr-only"> recipients</span>
            </span>
          ) : (
            <span className="min-w-0 truncate">
              <span className="sr-only">Recipients: </span>
              {lead.self ? "you" : lead.name || lead.email}
              {lead.self && summary.selfTag ? <SelfTag tag={summary.selfTag} /> : null}
              {others > 0 ? (
                <span className="text-muted-foreground">
                  {" "}
                  &amp; {others} {others === 1 ? "other" : "others"}
                </span>
              ) : null}
            </span>
          )}
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      }
    >
      <div className="max-h-[min(420px,60dvh)] overflow-y-auto p-1">
        {summary.groups.map((group) => (
          <div key={group.kind} className="py-0.5">
            <p className="px-2 pt-1.5 pb-0.5 text-xs font-medium text-[var(--text-tertiary)]">
              {GROUP_LABELS[group.kind]}
            </p>
            {group.recipients.map((recipient, index) => {
              const id = `${group.kind}:${index}`;
              const isOpen = expanded === id;
              return (
                <div key={id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : id)}
                    className={cn(DROPDOWN_PANEL_ROW_CLASS, "h-auto gap-2.5 py-1.5", isOpen && "bg-[var(--bg-cell-hover)]")}
                  >
                    <SenderAvatar email={recipient.email} name={recipient.name ?? undefined} className="size-7" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {recipient.name || recipient.email}
                        {recipient.self ? (
                          <span className="font-normal text-[var(--text-tertiary)]"> · you</span>
                        ) : null}
                      </span>
                      {recipient.name ? (
                        <span className="block truncate text-xs text-[var(--text-secondary)]">
                          <RecipientAddress recipient={recipient} />
                        </span>
                      ) : null}
                    </span>
                  </button>
                  {isOpen ? (
                    <RecipientActions
                      name={recipient.name}
                      email={recipient.email}
                      onDone={() => onOpenChange(false)}
                      className="pl-9"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
        {summary.selfTag ? (
          <p className="mt-1 flex items-center gap-1.5 border-t border-[var(--border-tertiary)] px-2 pt-2 pb-1 text-xs text-[var(--text-tertiary)]">
            <Tag className="size-3 shrink-0 text-accent" strokeWidth={2.25} aria-hidden />
            <span>
              Sent to your <SelfTag tag={summary.selfTag} /> address
            </span>
          </p>
        ) : null}
      </div>
    </DropdownPanel>
  );
}

function RecipientAddress({ recipient }: { recipient: SummarizedMailRecipient }) {
  const parsed = parseSubAddress(recipient.email);
  if (!recipient.self || !parsed.tag) return <>{recipient.email}</>;
  return (
    <>
      {parsed.baseUser}
      <SelfTag tag={parsed.tag} />@{parsed.domain}
    </>
  );
}
