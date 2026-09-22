"use client";

import { useState } from "react";
import { Loader2, Plus, Search, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  formatContactContextSummary,
  getContactDisplayLabel,
  normalizeEmailAddress,
  type RecentContactEntry,
} from "@workspace/calendar-core";
import { cn } from "@workspace/ui/lib/utils";
import { useRecentContacts } from "@/hooks/use-recent-contacts";
import { SolaceAvatar } from "../solace-avatar";
import {
  addTrustedSender,
  isTrustedSender,
  removeTrustedSender,
  useMailDisplaySettings,
} from "@/lib/mail/mail-display-settings";
import { TrustedSenderSwitchRow } from "./trusted-sender-switch-row";
import {
  PaletteButton,
  PaletteEmptyState,
  PaletteField,
  PaletteFormActions,
  PaletteView,
  PaletteViewHeader,
} from "../command-palette/palette-ui";
import { PALETTE_INPUT_CLASS, PALETTE_ROW_CLASS, PALETTE_VIEW_STYLE } from "../command-palette/palette-styles";

async function runWithSavingFlag<T>(
  setSaving: (value: boolean) => void,
  task: () => Promise<T>,
): Promise<T> {
  setSaving(true);
  try {
    return await task();
  } finally {
    setSaving(false);
  }
}

function AddContactForm({
  isSaving,
  onCancel,
  onSave,
}: {
  isSaving: boolean;
  onCancel: () => void;
  onSave: (email: string, displayName?: string) => Promise<boolean>;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");

  return (
    <div className="pb-2">
      <p className="p-2 text-[13px] leading-[130%] text-muted-foreground">
        Add someone you email even if they have not appeared in your history
        yet.
      </p>
      <div className="flex flex-col gap-1.5 px-2">
        <input
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          aria-label="Email"
          placeholder="email@example.com"
          className={PALETTE_INPUT_CLASS}
          type="email"
          autoComplete="email"
        />
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          aria-label="Full name"
          placeholder="Full name (optional)"
          className={PALETTE_INPUT_CLASS}
        />
      </div>
      <PaletteFormActions>
        <PaletteButton variant="ghost" onClick={onCancel}>
          Cancel
        </PaletteButton>
        <PaletteButton
          variant="primary"
          disabled={!newEmail.trim().includes("@") || isSaving}
          onClick={() => {
            const email = normalizeEmailAddress(newEmail);
            if (!email) return;
            void onSave(email, newName.trim() || undefined).then((saved) => {
              if (!saved) return;
              setNewEmail("");
              setNewName("");
            });
          }}
        >
          Save contact
        </PaletteButton>
      </PaletteFormActions>
    </div>
  );
}

function ContactDetailView({
  contact,
  onBack,
  onRemove,
  onSave,
  isSaving,
}: {
  contact: RecentContactEntry;
  onBack: () => void;
  onRemove: () => Promise<void>;
  onSave: (patch: {
    displayName: string;
    phone: string;
    notes: string;
  }) => Promise<boolean>;
  isSaving: boolean;
}) {
  const { settings } = useMailDisplaySettings();
  const [displayName, setDisplayName] = useState(contact.displayName ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [isRemoving, setIsRemoving] = useState(false);

  const trusted = isTrustedSender(contact.email, settings);
  const contextSummary = formatContactContextSummary(contact);

  const handleTrustedChange = (next: boolean) => {
    if (next) {
      addTrustedSender(contact.email);
      return;
    }
    removeTrustedSender(contact.email);
  };

  return (
    <PaletteView title={getContactDisplayLabel(contact)} onBack={onBack}>
      <div className="flex items-center gap-3 p-2">
        <SolaceAvatar
          email={contact.email}
          name={getContactDisplayLabel(contact)}
          className="size-8"
        />
        <div className="min-w-0">
          <div className="truncate text-[15px] leading-[130%] text-foreground">
            {contact.email}
          </div>
          {contextSummary ? (
            <div className="text-[13px] leading-[130%] text-muted-foreground">
              {contextSummary}
            </div>
          ) : null}
        </div>
      </div>

      <PaletteField label="Full name" htmlFor="contact-name">
        <input
          id="contact-name"
          aria-label="Full name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Display name"
          className={PALETTE_INPUT_CLASS}
        />
      </PaletteField>

      <PaletteField label="Phone" htmlFor="contact-phone">
        <input
          id="contact-phone"
          aria-label="Phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+1 555 0100"
          className={PALETTE_INPUT_CLASS}
          type="tel"
          autoComplete="tel"
        />
      </PaletteField>

      <PaletteField label="Notes" htmlFor="contact-notes">
        <textarea
          id="contact-notes"
          aria-label="Notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional notes"
          rows={3}
          className={cn(PALETTE_INPUT_CLASS, "h-auto min-h-[5.5rem] resize-none py-2")}
        />
      </PaletteField>

      <TrustedSenderSwitchRow
        checked={trusted}
        onCheckedChange={handleTrustedChange}
      />

      <PaletteFormActions>
        <PaletteButton
          variant="destructive"
          className="mr-auto"
          disabled={isRemoving}
          onClick={() => {
            setIsRemoving(true);
            void onRemove().finally(() => setIsRemoving(false));
          }}
        >
          <Trash2 className="size-3.5" />
          {isRemoving ? "Removing…" : "Remove"}
        </PaletteButton>
        <PaletteButton
          variant="primary"
          loading={isSaving}
          onClick={() =>
            void onSave({
              displayName,
              phone,
              notes,
            }).then((saved) => {
              if (saved) {
                toast.success("Contact saved.");
                onBack();
              }
            })
          }
        >
          {isSaving ? "Saving" : "Save"}
        </PaletteButton>
      </PaletteFormActions>
    </PaletteView>
  );
}

export function ContactsSettingsPanel({ goBack }: { goBack: () => void }) {
  const {
    payload,
    filterContacts,
    addContact,
    updateContact,
    removeContact,
    isLoading,
    isAvailable,
  } = useRecentContacts();
  const { settings } = useMailDisplaySettings();
  const [query, setQuery] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const contacts = filterContacts(payload, { query });
  const selectedContact = selectedEmail
    ? (payload?.contacts.find((entry) => entry.email === selectedEmail) ?? null)
    : null;

  if (!isAvailable) {
    return (
      <PaletteView title="Contacts" onBack={goBack}>
        <PaletteEmptyState>
          Unlock encrypted data on this device to view and manage contacts.
        </PaletteEmptyState>
      </PaletteView>
    );
  }

  if (selectedContact) {
    return (
      <ContactDetailView
        contact={selectedContact}
        onBack={() => setSelectedEmail(null)}
        isSaving={isSaving}
        onSave={(patch) =>
          runWithSavingFlag(setIsSaving, () =>
            updateContact(selectedContact.email, patch),
          )
        }
        onRemove={async () => {
          await removeContact(selectedContact.email);
          setSelectedEmail(null);
          toast.success("Contact removed.");
        }}
      />
    );
  }

  return (
    <div className="flex flex-col" style={PALETTE_VIEW_STYLE}>
      <PaletteViewHeader
        title="Contacts"
        onBack={goBack}
        actions={
          <PaletteButton
            variant="ghost"
            className="px-2"
            onClick={() => setIsAdding((value) => !value)}
          >
            <Plus className="size-3.5" />
            Add
          </PaletteButton>
        }
      />

      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/50 px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search contacts"
          placeholder="Search contacts"
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-[15px] text-foreground shadow-none outline-none placeholder:text-muted-foreground/60 focus:border-0 focus:shadow-none focus:ring-0"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {isAdding ? (
          <AddContactForm
            isSaving={isSaving}
            onCancel={() => setIsAdding(false)}
            onSave={async (email, displayName) => {
              const saved = await runWithSavingFlag(setIsSaving, () =>
                addContact({
                  email,
                  displayName,
                }),
              );
              if (saved) {
                setIsAdding(false);
                setSelectedEmail(email);
              }
              return saved;
            }}
          />
        ) : null}

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-2 py-8 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading contacts…
          </div>
        ) : contacts.length === 0 ? (
          <PaletteEmptyState>
            {query.trim()
              ? "No contacts match your search."
              : "Contacts from mail and calendar appear here as you correspond with people."}
          </PaletteEmptyState>
        ) : (
          <ul className="flex flex-col gap-px">
            {contacts.map((contact) => {
              const label = getContactDisplayLabel(contact);
              const trusted = isTrustedSender(contact.email, settings);

              return (
                <li key={contact.email}>
                  <button
                    type="button"
                    onClick={() => setSelectedEmail(contact.email)}
                    className={PALETTE_ROW_CLASS}
                  >
                    <SolaceAvatar
                      email={contact.email}
                      name={label}
                      className="size-8"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[15px] leading-[130%] text-foreground">
                          {label}
                        </span>
                        {trusted ? (
                          <ShieldCheck
                            className="size-3 shrink-0 text-foreground"
                            aria-label="Trusted sender"
                          />
                        ) : null}
                      </div>
                      <div className="truncate text-[13px] leading-[130%] text-muted-foreground">
                        {contact.email}
                      </div>
                    </div>
                    <UserRound className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
