import React, { useMemo, useState } from "react";
import { Alert, StyleSheet } from "react-native";
import {
  formatContactContextSummary,
  getContactDisplayLabel,
  normalizeEmailAddress,
  type RecentContactEntry,
} from "@workspace/calendar-core";
import { SettingsPage } from "../SettingsPage";
import { BlobatarAvatar } from "../../BlobatarAvatar";
import {
  SheetButton,
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSearchField,
  SheetSection,
  SheetTextField,
} from "../../sheet/SheetSections";
import { useRecentContacts } from "../../../hooks/use-recent-contacts";

const AVATAR_SIZE = 28;

export function ContactsSettingsContent() {
  const {
    payload,
    filterContacts,
    addContact,
    updateContact,
    removeContact,
    isLoading,
    isAvailable,
  } = useRecentContacts();

  const [query, setQuery] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
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

  if (isLoading && !payload) {
    return (
      <SettingsPage title="Contacts">
        <SheetCenteredState loading message="Loading contacts…" />
      </SettingsPage>
    );
  }

  if (!isAvailable) {
    return (
      <SettingsPage title="Contacts">
        <SheetCenteredState message="Unlock encrypted data on this device to view and manage contacts." />
      </SettingsPage>
    );
  }

  if (selectedContact) {
    return (
      <ContactDetailScreen
        contact={selectedContact}
        isSaving={isSaving}
        onBack={() => setSelectedEmail(null)}
        onSave={async (patch) => {
          setIsSaving(true);
          try {
            await updateContact(selectedContact.email, patch);
            setSelectedEmail(null);
          } finally {
            setIsSaving(false);
          }
        }}
        onRemove={() => {
          Alert.alert(
            "Remove contact",
            `Remove ${getContactDisplayLabel(selectedContact)} from your contacts?`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Remove",
                style: "destructive",
                onPress: () => {
                  void removeContact(selectedContact.email).then(() => {
                    setSelectedEmail(null);
                  });
                },
              },
            ],
          );
        }}
      />
    );
  }

  const cancelAdd = () => {
    setIsAdding(false);
    setNewEmail("");
    setNewName("");
  };

  const saveNewContact = () => {
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
  };

  return (
    <SettingsPage title="Contacts">
      <SheetScroll>
        <SheetSearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search contacts"
          accessibilityLabel="Search contacts"
        />

        {isAdding ? (
          <SheetSection
            title="New contact"
            footer="Add someone you email even if they have not appeared in your history yet."
          >
            <SheetGroup>
              <SheetTextField
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="email@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Email"
              />
              <SheetTextField
                value={newName}
                onChangeText={setNewName}
                placeholder="Full name (optional)"
                accessibilityLabel="Full name"
              />
            </SheetGroup>
          </SheetSection>
        ) : null}

        {isAdding ? (
          <SheetSection>
            <SheetButton
              label="Save contact"
              onPress={saveNewContact}
              disabled={!newEmail.trim().includes("@")}
              pending={isSaving}
            />
            <SheetButton label="Cancel" variant="secondary" onPress={cancelAdd} />
          </SheetSection>
        ) : null}

        {isLoading ? (
          <SheetCenteredState loading message="Loading contacts…" />
        ) : (
          <SheetSection
            title="Contacts"
            footer={
              contacts.length === 0
                ? query.trim()
                  ? "No contacts match your search."
                  : "Contacts from mail and calendar appear here as you correspond with people."
                : undefined
            }
          >
            <SheetGroup>
              {contacts.map((contact) => (
                <ContactRow
                  key={contact.email}
                  contact={contact}
                  onPress={() => setSelectedEmail(contact.email)}
                />
              ))}
              <SheetItem
                key="new-contact"
                label="New contact"
                icon="plus"
                tone="accent"
                onPress={() => setIsAdding((value) => !value)}
                accessibilityLabel="Add contact"
              />

            </SheetGroup>
          </SheetSection>
        )}
      </SheetScroll>
    </SettingsPage>
  );
}

function ContactRow({
  contact,
  onPress,
}: {
  contact: RecentContactEntry;
  onPress: () => void;
}) {
  const label = getContactDisplayLabel(contact);
  const summary = formatContactContextSummary(contact);

  return (
    <SheetItem
      label={label}
      detail={summary ? `${contact.email} · ${summary}` : contact.email}
      leading={
        <BlobatarAvatar email={contact.email} name={label} size={AVATAR_SIZE} />
      }
      chevron
      onPress={onPress}
    />
  );
}

function ContactDetailScreen({
  contact,
  isSaving,
  onBack,
  onSave,
  onRemove,
}: {
  contact: RecentContactEntry;
  isSaving: boolean;
  onBack: () => void;
  onSave: (patch: {
    displayName: string;
    phone: string;
    notes: string;
  }) => Promise<void>;
  onRemove: () => void;
}) {
  const [displayName, setDisplayName] = useState(contact.displayName ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [notes, setNotes] = useState(contact.notes ?? "");
  const summary = formatContactContextSummary(contact);
  const label = getContactDisplayLabel(contact);

  return (
    <SettingsPage title={label} onBack={onBack}>
      <SheetScroll>
        <SheetGroup>
          <SheetItem
            label={contact.email}
            detail={summary || undefined}
            leading={
              <BlobatarAvatar email={contact.email} name={label} size={AVATAR_SIZE} />
            }
          />
        </SheetGroup>

        <SheetSection title="Full name">
          <SheetGroup>
            <SheetTextField
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display name"
              accessibilityLabel="Full name"
            />
          </SheetGroup>
        </SheetSection>

        <SheetSection title="Phone">
          <SheetGroup>
            <SheetTextField
              value={phone}
              onChangeText={setPhone}
              placeholder="+1 555 0100"
              keyboardType="phone-pad"
              accessibilityLabel="Phone"
            />
          </SheetGroup>
        </SheetSection>

        <SheetSection title="Notes">
          <SheetGroup>
            <SheetTextField
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes"
              multiline
              style={styles.notesInput}
              accessibilityLabel="Notes"
            />
          </SheetGroup>
        </SheetSection>

        <SheetButton
          label="Save"
          pending={isSaving}
          onPress={() =>
            void onSave({
              displayName,
              phone,
              notes,
            })
          }
        />

        <SheetGroup>
          <SheetItem
            label="Remove contact"
            icon="trash-2"
            tone="destructive"
            onPress={onRemove}
          />
        </SheetGroup>
      </SheetScroll>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  notesInput: {
    minHeight: 88,
    textAlignVertical: "top",
  },
});
