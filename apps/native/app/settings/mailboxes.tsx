import React, { useCallback, useMemo, useState } from "react";
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
import { useQueryClient } from "@tanstack/react-query";
import {
  canCreateMailbox,
  getErrorMessage,
  validateMailboxCreate,
  validateMailboxName,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { AppScreen, StackScreenHeader } from "../../src/components/layout";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useToast } from "../../src/providers/ToastProvider";
import { useHiddenMailboxIds } from "../../src/hooks/use-hidden-mailbox-ids";
import { QUERY_KEYS } from "../../src/lib/query-keys";
import { useMailAccount, useMailRuntime } from "../../src/lib/mail/use-mail";
import {
  getMailboxDisplayName,
  getMailboxIcon,
  sortMailboxes,
} from "../../src/lib/mail/mail-helpers";
import {
  canHideMailbox,
  canRenameOrDeleteMailbox,
  mailboxSortUpdates,
  moveMailboxIndex,
} from "../../src/lib/mail/mailbox-management";
import type { JmapMailbox } from "../../src/lib/mail/types";

export default function MailboxesScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accountQuery = useMailAccount();
  const provisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(provisioned);
  const runtime = runtimeQuery.data;
  const { hiddenIds, toggleHidden } = useHiddenMailboxIds();

  const mailboxes = useMemo(
    () => (runtime ? sortMailboxes(runtime.mailboxes) : []),
    [runtime],
  );
  const policy = runtime?.mailServerPolicy;
  const canCreate = policy ? canCreateMailbox(mailboxes.length, policy) : false;
  const hidden = useMemo(() => new Set(hiddenIds), [hiddenIds]);

  const refreshRuntime = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.mailRuntime(),
    });
  }, [queryClient]);

  const handleCreate = useCallback(async () => {
    if (!runtime || !policy) return;
    const validationError = validateMailboxCreate(
      { name, existingMailboxCount: mailboxes.length },
      policy,
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setBusyId("create");
    try {
      await runtime.client.createMailbox(runtime.session, name.trim());
      setName("");
      toast("Mailbox created");
      await refreshRuntime();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create mailbox."));
    } finally {
      setBusyId(null);
    }
  }, [mailboxes.length, name, policy, refreshRuntime, runtime, toast]);

  const handleRename = useCallback(
    async (mailbox: JmapMailbox) => {
      if (!runtime || !policy) return;
      const validationError = validateMailboxName(editingName, policy);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      setBusyId(mailbox.id);
      try {
        await runtime.client.renameMailbox(
          runtime.session,
          mailbox.id,
          editingName.trim(),
        );
        setEditingId(null);
        toast("Mailbox renamed");
        await refreshRuntime();
      } catch (err) {
        setError(getErrorMessage(err, "Failed to rename mailbox."));
      } finally {
        setBusyId(null);
      }
    },
    [editingName, policy, refreshRuntime, runtime, toast],
  );

  const handleDelete = useCallback(
    (mailbox: JmapMailbox) => {
      if (!runtime) return;
      Alert.alert(
        "Delete mailbox?",
        `Delete “${getMailboxDisplayName(mailbox)}”? Messages in it may be removed.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              setBusyId(mailbox.id);
              setError(null);
              void runtime.client
                .deleteMailbox(runtime.session, mailbox.id)
                .then(async () => {
                  toast("Mailbox deleted");
                  await refreshRuntime();
                })
                .catch((err) => {
                  setError(getErrorMessage(err, "Failed to delete mailbox."));
                })
                .finally(() => setBusyId(null));
            },
          },
        ],
      );
    },
    [refreshRuntime, runtime, toast],
  );

  const handleMove = useCallback(
    async (index: number, direction: "up" | "down") => {
      if (!runtime) return;
      const next = moveMailboxIndex(mailboxes, index, direction);
      if (next === mailboxes) return;
      setBusyId(mailboxes[index]?.id ?? "reorder");
      setError(null);
      try {
        await runtime.client.updateMailboxSortOrders(
          runtime.session,
          mailboxSortUpdates(next),
        );
        await refreshRuntime();
      } catch (err) {
        setError(getErrorMessage(err, "Failed to reorder mailboxes."));
      } finally {
        setBusyId(null);
      }
    },
    [mailboxes, refreshRuntime, runtime],
  );

  const handleToggleHidden = useCallback(
    async (mailbox: JmapMailbox) => {
      if (!canHideMailbox(mailbox)) return;
      setBusyId(mailbox.id);
      try {
        await toggleHidden(mailbox.id);
      } catch (err) {
        setError(getErrorMessage(err, "Failed to update hidden mailboxes."));
      } finally {
        setBusyId(null);
      }
    },
    [toggleHidden],
  );

  return (
    <AppScreen header={<StackScreenHeader title="Mailboxes" />}>
      <View style={styles.addForm}>
        <Text style={styles.addHint}>
          Create folders, hide them from the sidebar, or reorder the list.
          Inbox cannot be hidden. System folders cannot be renamed or deleted.
        </Text>
        {error ? (
          <View style={[styles.feedback, styles.feedbackError]}>
            <Text style={[styles.feedbackText, styles.feedbackTextError]}>
              {error}
            </Text>
          </View>
        ) : null}
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="New mailbox name"
          placeholderTextColor={theme.colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          editable={canCreate && busyId === null}
          onSubmitEditing={() => void handleCreate()}
          style={styles.fieldInput}
          accessibilityLabel="New mailbox name"
        />
        <Pressable
          onPress={() => void handleCreate()}
          disabled={!canCreate || busyId !== null || !name.trim()}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            (!canCreate || busyId !== null || !name.trim()) && styles.disabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create mailbox"
        >
          {busyId === "create" ? (
            <ActivityIndicator
              color={theme.colors.primaryForeground}
              size="small"
            />
          ) : (
            <>
              <Feather
                name="plus"
                size={14}
                color={theme.colors.primaryForeground}
              />
              <Text style={styles.primaryButtonText}>Create mailbox</Text>
            </>
          )}
        </Pressable>
      </View>

      {runtimeQuery.isLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={theme.colors.primaryBase} />
          <Text style={styles.emptyText}>Loading mailboxes…</Text>
        </View>
      ) : !provisioned || mailboxes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {provisioned
              ? "No mailboxes found."
              : "Your mailbox is still being set up."}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {mailboxes.map((mailbox, index) => {
            const isEditing = editingId === mailbox.id;
            const isHidden = hidden.has(mailbox.id);
            const canEdit = canRenameOrDeleteMailbox(mailbox);
            const canHide = canHideMailbox(mailbox);
            const isBusy = busyId === mailbox.id;
            return (
              <View key={mailbox.id} style={styles.row}>
                <Feather
                  name={
                    getMailboxIcon(mailbox) as keyof typeof Feather.glyphMap
                  }
                  size={16}
                  color={theme.colors.mutedForeground}
                />
                <View style={styles.rowBody}>
                  {isEditing ? (
                    <TextInput
                      value={editingName}
                      onChangeText={setEditingName}
                      autoFocus
                      onSubmitEditing={() => void handleRename(mailbox)}
                      style={styles.fieldInput}
                    />
                  ) : (
                    <>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {getMailboxDisplayName(mailbox)}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {isHidden ? "Hidden from sidebar" : "Visible"}
                        {mailbox.role ? ` · ${mailbox.role}` : ""}
                      </Text>
                    </>
                  )}
                </View>
                <View style={styles.rowActions}>
                  <IconButton
                    name="chevron-up"
                    disabled={index === 0 || isBusy}
                    onPress={() => void handleMove(index, "up")}
                    theme={theme}
                    label={`Move ${getMailboxDisplayName(mailbox)} up`}
                  />
                  <IconButton
                    name="chevron-down"
                    disabled={index === mailboxes.length - 1 || isBusy}
                    onPress={() => void handleMove(index, "down")}
                    theme={theme}
                    label={`Move ${getMailboxDisplayName(mailbox)} down`}
                  />
                  {canHide ? (
                    <IconButton
                      name={isHidden ? "eye-off" : "eye"}
                      disabled={isBusy}
                      onPress={() => void handleToggleHidden(mailbox)}
                      theme={theme}
                      label={
                        isHidden
                          ? `Show ${getMailboxDisplayName(mailbox)}`
                          : `Hide ${getMailboxDisplayName(mailbox)}`
                      }
                    />
                  ) : null}
                  {canEdit ? (
                    isEditing ? (
                      <IconButton
                        name="check"
                        disabled={isBusy}
                        onPress={() => void handleRename(mailbox)}
                        theme={theme}
                        label="Save name"
                      />
                    ) : (
                      <IconButton
                        name="edit-2"
                        disabled={isBusy}
                        onPress={() => {
                          setEditingId(mailbox.id);
                          setEditingName(mailbox.name);
                          setError(null);
                        }}
                        theme={theme}
                        label={`Rename ${getMailboxDisplayName(mailbox)}`}
                      />
                    )
                  ) : null}
                  {canEdit ? (
                    <IconButton
                      name="trash-2"
                      disabled={isBusy}
                      onPress={() => handleDelete(mailbox)}
                      theme={theme}
                      destructive
                      label={`Delete ${getMailboxDisplayName(mailbox)}`}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </AppScreen>
  );
}

function IconButton({
  name,
  onPress,
  disabled,
  theme,
  label,
  destructive = false,
}: {
  name: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  disabled?: boolean;
  theme: ThemeTokens;
  label: string;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: 36,
          height: 36,
          alignItems: "center" as const,
          justifyContent: "center" as const,
          borderRadius: theme.borderRadius.md,
          opacity: disabled ? 0.35 : 1,
        },
        pressed && { backgroundColor: theme.colors.accent },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather
        name={name}
        size={16}
        color={
          destructive ? theme.colors.destructive : theme.colors.mutedForeground
        }
      />
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    addForm: {
      padding: theme.spacing["4"],
      gap: theme.spacing["2"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    primaryButton: {
      marginTop: theme.spacing["1"],
      minHeight: 44,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
    },
    pressed: { opacity: 0.85 },
    disabled: { opacity: 0.5 },
    list: { flex: 1 },
    listContent: { paddingBottom: theme.spacing["8"] },
    emptyState: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      padding: theme.spacing["6"],
      gap: theme.spacing["2"],
    },
    fieldInput: {
      height: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing["3"],
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.background,
    } as ViewStyle & TextStyle,
    feedback: {
      borderRadius: theme.borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
    },
    feedbackError: {
      borderColor: theme.colors.destructive + "40",
      backgroundColor: theme.colors.destructive + "18",
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      minHeight: 56,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowActions: { flexDirection: "row" as const, alignItems: "center" as const },
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
    feedbackText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
    },
    feedbackTextError: { color: theme.colors.destructive },
    rowTitle: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    rowMeta: {
      marginTop: 2,
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
