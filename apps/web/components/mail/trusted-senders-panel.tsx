"use client";

import { useMemo, useState } from "react";
import { getContactDisplayLabel } from "@workspace/calendar-core";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { useRecentContacts } from "@/hooks/use-recent-contacts";
import {
  addTrustedSender,
  removeTrustedSender,
  TRUSTED_SENDER_DESCRIPTION,
  useMailDisplaySettings,
} from "@/lib/mail/mail-display-settings";

export function TrustedSendersPanel({ className }: { className?: string }) {
  const { settings } = useMailDisplaySettings();
  const { payload } = useRecentContacts();
  const [newEmail, setNewEmail] = useState("");

  const contactsByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const contact of payload?.contacts ?? []) {
      map.set(contact.email, getContactDisplayLabel(contact));
    }
    return map;
  }, [payload?.contacts]);

  const trustedEntries = useMemo(
    () =>
      settings.trustedSenders.map((email) => ({
        email,
        label: contactsByEmail.get(email) ?? email,
      })),
    [contactsByEmail, settings.trustedSenders],
  );

  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground px-3 pt-1 pb-3">
        {TRUSTED_SENDER_DESCRIPTION}
      </p>

      <form
        className="flex gap-2 px-3 pb-3"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = newEmail.trim();
          if (!trimmed.includes("@")) return;
          addTrustedSender(trimmed);
          setNewEmail("");
        }}
      >
        <Input
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          placeholder="sender@example.com"
          className="h-8 text-sm"
          type="email"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={!newEmail.trim().includes("@")}
        >
          Add
        </Button>
      </form>

      {trustedEntries.length === 0 ? (
        <p className="px-3 pb-3 text-sm text-muted-foreground">
          No trusted senders yet.
        </p>
      ) : (
        <ul className="max-h-52 overflow-y-auto px-2 pb-2 space-y-0.5">
          {trustedEntries.map(({ email, label }) => (
            <li
              key={email}
              className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2.5 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate">{label}</div>
                {label !== email ? (
                  <div className="truncate text-xs text-muted-foreground">
                    {email}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => removeTrustedSender(email)}
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
