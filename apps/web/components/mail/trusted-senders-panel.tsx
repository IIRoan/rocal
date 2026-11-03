"use client";

import { useId, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getContactDisplayLabel } from "@workspace/calendar-core";
import { useRecentContacts } from "@/hooks/use-recent-contacts";
import {
  addTrustedSender,
  removeTrustedSender,
  TRUSTED_SENDER_DESCRIPTION,
  useMailDisplaySettings,
} from "@/lib/mail/mail-display-settings";
import {
  PaletteButton,
  PaletteEmptyState,
  PaletteField,
  PaletteIconBox,
  PaletteSection,
} from "../command-palette/palette-ui";
import { PALETTE_INPUT_CLASS } from "../command-palette/palette-styles";

export function TrustedSendersPanel() {
  const { settings } = useMailDisplaySettings();
  const { payload } = useRecentContacts();
  const [newEmail, setNewEmail] = useState("");
  const [emailInvalid, setEmailInvalid] = useState(false);
  const emailInputId = useId();
  const emailErrorId = useId();
  const emailInputRef = useRef<HTMLInputElement>(null);

  const contactsByEmail = new Map<string, string>();
  for (const contact of payload?.contacts ?? []) {
    contactsByEmail.set(contact.email, getContactDisplayLabel(contact));
  }

  const trustedEntries = settings.trustedSenders.map((email) => ({
    email,
    label: contactsByEmail.get(email) ?? email,
  }));

  return (
    <>
      <p className="p-2 text-[13px] leading-[130%] text-muted-foreground">
        {TRUSTED_SENDER_DESCRIPTION}
      </p>
      <PaletteField label="Add a sender" htmlFor={emailInputId}>
        <form
          className="flex items-center gap-2"
          noValidate
          action={() => {
            const trimmed = newEmail.trim();
            if (!trimmed.includes("@")) {
              setEmailInvalid(true);
              emailInputRef.current?.focus();
              return;
            }
            addTrustedSender(trimmed);
            setNewEmail("");
          }}
        >
          <input
            ref={emailInputRef}
            id={emailInputId}
            value={newEmail}
            onChange={(event) => {
              setNewEmail(event.target.value);
              setEmailInvalid(false);
            }}
            placeholder="sender@example.com"
            aria-label="Add a sender"
            aria-invalid={emailInvalid || undefined}
            aria-describedby={emailInvalid ? emailErrorId : undefined}
            className={PALETTE_INPUT_CLASS}
            type="email"
            autoComplete="email"
          />
          <PaletteButton type="submit" variant="primary" className="h-9">
            Add
          </PaletteButton>
        </form>
        {emailInvalid ? (
          <p id={emailErrorId} className="text-[13px] leading-[130%] text-destructive">
            Enter an email address, like sender@example.com.
          </p>
        ) : null}
      </PaletteField>
      {trustedEntries.length === 0 ? (
        <PaletteEmptyState>No trusted senders yet.</PaletteEmptyState>
      ) : (
        <PaletteSection label="Your trusted senders">
          <ul className="flex flex-col gap-px">
            {trustedEntries.map(({ email, label }) => (
              <li
                key={email}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5"
              >
                <PaletteIconBox>
                  <ShieldCheck className="size-4" />
                </PaletteIconBox>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] leading-[130%] text-foreground wrap-anywhere">
                    {label}
                  </div>
                  {label !== email ? (
                    <div className="text-[13px] leading-[130%] text-muted-foreground wrap-anywhere">
                      {email}
                    </div>
                  ) : null}
                </div>
                <PaletteButton
                  variant="ghost"
                  onClick={() => removeTrustedSender(email)}
                  aria-label={`Remove ${label} from trusted senders`}
                >
                  Remove
                </PaletteButton>
              </li>
            ))}
          </ul>
        </PaletteSection>
      )}
    </>
  );
}
