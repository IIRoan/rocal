import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  formatContactContextSummary,
  getContactDisplayLabel,
  normalizeEmailAddress,
  type RecentContactEntry,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { AppScreen, StackScreenHeader } from "../../src/components/layout";
import { BlobatarAvatar } from "../../src/components/BlobatarAvatar";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useRecentContacts } from "../../src/hooks/use-recent-contacts";

export default function ContactsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
      <AppScreen header={<StackScreenHeader title="Contacts" />}>
        <View style={styles.emptyState}>
          <ActivityIndicator color={theme.colors.mutedForeground} />
        </View>
      </AppScreen>
    );
  }

  if (!isAvailable) {
    return (
      <AppScreen header={<StackScreenHeader title="Contacts" />}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Unlock encrypted data on this device to view and manage contacts.
          </Text>
        </View>
      </AppScreen>
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

  return (
    <AppScreen header={<StackScreenHeader title="Contacts" />}>
      <View style={styles.searchRow}>
        <Feather name="search" size={16} color={theme.colors.mutedForeground} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts"
          placeholderTextColor={theme.colors.mutedForeground}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <Pressable
          onPress={() => setIsAdding((value) => !value)}
          style={styles.addButton}
          accessibilityRole="button"
          accessibilityLabel="Add contact"
        >
          <Feather name="plus" size={18} color={theme.colors.foreground} />
        </Pressable>
      </View>

      {isAdding ? (
        <View style={styles.addForm}>
          <Text style={styles.addHint}>
            Add someone you email even if they have not appeared in your
            history yet.
          </Text>
          <TextInput
            style={styles.fieldInput}
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="email@example.com"
            placeholderTextColor={theme.colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.fieldInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="Full name (optional)"
            placeholderTextColor={theme.colors.mutedForeground}
          />
          <View style={styles.addActions}>
            <Pressable
              disabled={!newEmail.trim().includes("@") || isSaving}
              onPress={() => {
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
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
                (!newEmail.trim().includes("@") || isSaving) && styles.disabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>Save contact</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setIsAdding(false);
                setNewEmail("");
                setNewName("");
              }}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={theme.colors.primaryBase} />
          <Text style={styles.emptyText}>Loading contacts…</Text>
        </View>
      ) : contacts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {query.trim()
              ? "No contacts match your search."
              : "Contacts from mail and calendar appear here as you correspond with people."}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {contacts.map((contact) => (
            <ContactRow
              key={contact.email}
              contact={contact}
              onPress={() => setSelectedEmail(contact.email)}
              theme={theme}
            />
          ))}
        </ScrollView>
      )}
    </AppScreen>
  );
}

function ContactRow({
  contact,
  onPress,
  theme,
}: {
  contact: RecentContactEntry;
  onPress: () => void;
  theme: ThemeTokens;
}) {
  const label = getContactDisplayLabel(contact);
  const summary = formatContactContextSummary(contact);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: theme.spacing["3"],
          paddingHorizontal: theme.spacing["3"],
          paddingVertical: theme.spacing["3"],
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        pressed && { backgroundColor: theme.colors.accent },
      ]}
    >
      <BlobatarAvatar
        email={contact.email}
        name={label}
        size={32}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
          numberOfLines={1}
        >
          {contact.email}
        </Text>
        {summary ? (
          <Text
            style={{
              fontSize: theme.typography.fontSize.xs.size,
              lineHeight: theme.typography.fontSize.xs.lineHeight,
              color: theme.colors.mutedForeground,
              opacity: 0.8,
            }}
            numberOfLines={1}
          >
            {summary}
          </Text>
        ) : null}
      </View>
      <Feather name="chevron-right" size={16} color={theme.colors.mutedForeground} />
    </Pressable>
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
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [displayName, setDisplayName] = useState(contact.displayName ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [notes, setNotes] = useState(contact.notes ?? "");
  const summary = formatContactContextSummary(contact);

  return (
    <AppScreen
      header={
        <StackScreenHeader
          title={getContactDisplayLabel(contact)}
          onBack={onBack}
        />
      }
    >
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.detailContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.detailEmail}>{contact.email}</Text>
        {summary ? <Text style={styles.detailSummary}>{summary}</Text> : null}

        <Field label="Full name" theme={theme}>
          <TextInput
            style={styles.fieldInput}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name"
            placeholderTextColor={theme.colors.mutedForeground}
          />
        </Field>

        <Field label="Phone" theme={theme}>
          <TextInput
            style={styles.fieldInput}
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 555 0100"
            placeholderTextColor={theme.colors.mutedForeground}
            keyboardType="phone-pad"
          />
        </Field>

        <Field label="Notes" theme={theme}>
          <TextInput
            style={[styles.fieldInput, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional notes"
            placeholderTextColor={theme.colors.mutedForeground}
            multiline
          />
        </Field>

        <View style={styles.addActions}>
          <Pressable
            disabled={isSaving}
            onPress={() =>
              void onSave({
                displayName,
                phone,
                notes,
              })
            }
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              isSaving && styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {isSaving ? "Saving…" : "Save"}
            </Text>
          </Pressable>
          <Pressable
            onPress={onRemove}
            style={({ pressed }) => [styles.destructiveButton, pressed && styles.pressed]}
          >
            <Text style={styles.destructiveButtonText}>Remove</Text>
          </Pressable>
        </View>
      </ScrollView>
    </AppScreen>
  );
}

function Field({
  label,
  children,
  theme,
}: {
  label: string;
  children: React.ReactNode;
  theme: ThemeTokens;
}) {
  return (
    <View style={{ gap: theme.spacing["2"] }}>
      <Text
        style={{
          fontSize: theme.typography.fontSize.sm.size,
          lineHeight: theme.typography.fontSize.sm.lineHeight,
          fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
          color: theme.colors.foreground,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    searchRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    searchInput: {
      flex: 1,
      height: 44,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    } as ViewStyle & TextStyle,
    addButton: {
      width: 36,
      height: 36,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.md,
    },
    addForm: {
      padding: theme.spacing["4"],
      gap: theme.spacing["2"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    addActions: {
      flexDirection: "row" as const,
      gap: theme.spacing["2"],
      marginTop: theme.spacing["2"],
    },
    primaryButton: {
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
    },
    secondaryButton: {
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
    },
    destructiveButton: {
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
    },
    pressed: {
      opacity: 0.85,
    },
    disabled: {
      opacity: 0.5,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingBottom: theme.spacing["8"],
    },
    detailContent: {
      padding: theme.spacing["4"],
      gap: theme.spacing["4"],
      paddingBottom: theme.spacing["8"],
    },
    emptyState: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      padding: theme.spacing["6"],
      gap: theme.spacing["2"],
    },
    fieldInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.background,
    } as ViewStyle & TextStyle,
    notesInput: {
      minHeight: 88,
      textAlignVertical: "top" as const,
    },
  } satisfies Record<string, ViewStyle | (ViewStyle & TextStyle)>;

  const text = {
    addHint: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    emptyText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      textAlign: "center" as const,
    },
    primaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.primaryForeground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    secondaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    destructiveButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.destructive,
    },
    detailEmail: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    detailSummary: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
