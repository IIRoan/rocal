"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Textarea } from "@workspace/ui/components/ui/textarea";
import {
  formatContactContextSummary,
  getContactDisplayLabel,
  normalizeEmailAddress,
  type RecentContactEntry,
} from "@workspace/calendar-core";
import { useRecentContacts } from "@/hooks/use-recent-contacts";
import {
  addTrustedSender,
  isTrustedSender,
  removeTrustedSender,
  useMailDisplaySettings,
} from "@/lib/mail/mail-display-settings";
import { TrustedSenderSwitchRow } from "./trusted-sender-switch-row";
import { TrustedSendersPanel } from "./trusted-senders-panel";

function ContactAvatar({ label }: { label: string }) {
  const initial = label.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
      {initial}
    </div>
  );
}

function ContactDetailView({
  contact,
  onBack,
  onOpenTrustedSenders,
  onRemove,
  onSave,
  isSaving,
}: {
  contact: RecentContactEntry;
  onBack: () => void;
  onOpenTrustedSenders: () => void;
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
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
          aria-label="Back to contacts"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium truncate">
          {getContactDisplayLabel(contact)}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <ContactAvatar label={getContactDisplayLabel(contact)} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{contact.email}</div>
            {contextSummary ? (
              <div className="text-xs text-muted-foreground">{contextSummary}</div>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="contact-name">
              Full name
            </label>
            <Input
              id="contact-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Display name"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="contact-phone">
              Phone
            </label>
            <Input
              id="contact-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+1 555 0100"
              className="h-8 text-sm"
              type="tel"
              autoComplete="tel"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="contact-notes">
              Notes
            </label>
            <Textarea
              id="contact-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes"
              rows={3}
              className="min-h-[5.5rem] resize-none text-sm"
            />
          </div>
        </div>

        <div className="rounded-md border border-border/50 overflow-hidden">
          <TrustedSenderSwitchRow
            checked={trusted}
            onCheckedChange={handleTrustedChange}
          />
          <div className="border-t border-border/40 px-3 py-2">
            <button
              type="button"
              onClick={onOpenTrustedSenders}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Manage all trusted senders
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            disabled={isSaving}
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
            {isSaving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Saving
              </>
            ) : (
              "Save"
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={isRemoving}
            onClick={() => {
              setIsRemoving(true);
              void onRemove().finally(() => setIsRemoving(false));
            }}
          >
            <Trash2 className="size-3.5" />
            {isRemoving ? "Removing…" : "Remove"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TrustedSendersView({ goBack }: { goBack: () => void }) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
        <button
          type="button"
          onClick={goBack}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
          aria-label="Back to contacts"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium">Trusted senders</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <TrustedSendersPanel />
      </div>
    </div>
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
  const [showTrustedSenders, setShowTrustedSenders] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");

  const contacts = useMemo(
    () => filterContacts(payload, { query }),
    [filterContacts, payload, query],
  );

  const selectedContact = useMemo(
    () =>
      selectedEmail
        ? (payload?.contacts.find((entry) => entry.email === selectedEmail) ??
          null)
        : null,
    [payload?.contacts, selectedEmail],
  );

  const trustedCount = settings.trustedSenders.length;
  const trustedLabel =
    trustedCount === 0
      ? "None"
      : trustedCount === 1
        ? "1 sender"
        : `${trustedCount} senders`;

  if (!isAvailable) {
    return (
      <div
        className="flex flex-col"
        style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
          <button
            type="button"
            onClick={goBack}
            className="p-1 rounded hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="size-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-medium">Contacts</span>
        </div>
        <div className="p-4 text-sm text-muted-foreground">
          Unlock encrypted data on this device to view and manage contacts.
        </div>
      </div>
    );
  }

  if (showTrustedSenders) {
    return (
      <div
        className="flex flex-col"
        style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}
      >
        <TrustedSendersView goBack={() => setShowTrustedSenders(false)} />
      </div>
    );
  }

  if (selectedContact) {
    return (
      <div
        className="flex flex-col"
        style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}
      >
        <ContactDetailView
          contact={selectedContact}
          onBack={() => setSelectedEmail(null)}
          onOpenTrustedSenders={() => setShowTrustedSenders(true)}
          isSaving={isSaving}
          onSave={async (patch) => {
            setIsSaving(true);
            try {
              return await updateContact(selectedContact.email, patch);
            } finally {
              setIsSaving(false);
            }
          }}
          onRemove={async () => {
            await removeContact(selectedContact.email);
            setSelectedEmail(null);
            toast.success("Contact removed.");
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: "240px", maxHeight: "calc(100dvh - 200px)" }}
    >
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
        <button
          type="button"
          onClick={goBack}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium flex-1">Contacts</span>
        <button
          type="button"
          onClick={() => setIsAdding((value) => !value)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <Plus className="size-3.5" />
          Add
        </button>
      </div>

      <div className="px-3 py-2 border-b border-border/40">
        <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-2">
          <Search className="size-3.5 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts"
            className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowTrustedSenders(true)}
        className="mx-2 mt-2 flex items-center gap-3 rounded-md border border-border/50 px-3 py-2 text-left hover:bg-accent/40 transition-colors"
      >
        <ShieldCheck className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm">Trusted senders</div>
          <div className="text-xs text-muted-foreground">
            Remote images policy exceptions
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{trustedLabel}</span>
        <ChevronRight className="size-4 text-muted-foreground shrink-0" />
      </button>

      {isAdding ? (
        <div className="px-3 py-3 border-b border-border/40 space-y-2">
          <div className="text-xs text-muted-foreground">
            Add someone you email even if they have not appeared in your history
            yet.
          </div>
          <Input
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            placeholder="email@example.com"
            className="h-8 text-sm"
            type="email"
            autoComplete="email"
          />
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Full name (optional)"
            className="h-8 text-sm"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!newEmail.trim().includes("@") || isSaving}
              onClick={() => {
                const email = normalizeEmailAddress(newEmail);
                if (!email) return;
                setIsSaving(true);
                void addContact({
                  email,
                  displayName: newName.trim() || undefined,
                })
                  .then((saved) => {
                    if (!saved) return;
                    setNewEmail("");
                    setNewName("");
                    setIsAdding(false);
                    setSelectedEmail(email);
                  })
                  .finally(() => setIsSaving(false));
              }}
            >
              Save contact
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsAdding(false);
                setNewEmail("");
                setNewName("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto py-2">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading contacts…
          </div>
        ) : contacts.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {query.trim()
              ? "No contacts match your search."
              : "Contacts from mail and calendar appear here as you correspond with people."}
          </div>
        ) : (
          <ul className="px-2 space-y-0.5">
            {contacts.map((contact) => {
              const label = getContactDisplayLabel(contact);
              const trusted = isTrustedSender(contact.email, settings);

              return (
                <li key={contact.email}>
                  <button
                    type="button"
                    onClick={() => setSelectedEmail(contact.email)}
                    className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-accent/50 transition-colors"
                  >
                    <ContactAvatar label={label} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {label}
                        </span>
                        {trusted ? (
                          <ShieldCheck
                            className="size-3 shrink-0 text-primary"
                            aria-label="Trusted sender"
                          />
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {contact.email}
                      </div>
                    </div>
                    <UserRound className="size-3.5 text-muted-foreground shrink-0" />
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
