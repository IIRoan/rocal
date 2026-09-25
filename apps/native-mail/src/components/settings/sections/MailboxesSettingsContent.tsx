import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  canCreateMailbox,
  getErrorMessage,
  validateMailboxCreate,
  validateMailboxName,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { SettingsPage } from "@workspace/native-core/components/settings/SettingsPage";
import { MAIL_ICON, useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";
import {
  SheetButton,
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetMessage,
  SheetScroll,
  SheetSection,
  SheetTextField,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { useHiddenMailboxIds } from "../../../hooks/use-hidden-mailbox-ids";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useMailAccount, useMailRuntime } from "../../../lib/mail/use-mail";
import {
  getMailboxDisplayName,
  getMailboxIcon,
  sortMailboxes,
} from "../../../lib/mail/mail-helpers";
import {
  canHideMailbox,
  canRenameOrDeleteMailbox,
  mailboxSortUpdates,
  moveMailboxIndex,
} from "../../../lib/mail/mailbox-management";
import type { JmapMailbox } from "../../../lib/mail/types";

type FeatherName = keyof typeof Feather.glyphMap;

export function MailboxesSettingsContent() {
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
    <SettingsPage title="Mailboxes">
      <SheetScroll>
        {error ? <SheetMessage tone="destructive" text={error} /> : null}

        <SheetSection
          title="New mailbox"
          footer="Create folders, hide them from the mail drawer, or reorder them. Inbox cannot be hidden. System folders cannot be renamed or deleted."
        >
          <SheetGroup>
            <SheetTextField
              value={name}
              onChangeText={setName}
              placeholder="New mailbox name"
              autoCapitalize="none"
              autoCorrect={false}
              editable={canCreate && busyId === null}
              onSubmitEditing={() => void handleCreate()}
              accessibilityLabel="New mailbox name"
            />
          </SheetGroup>
        </SheetSection>

        <SheetButton
          label="Create mailbox"
          icon="plus"
          onPress={() => void handleCreate()}
          disabled={!canCreate || busyId !== null || !name.trim()}
          pending={busyId === "create"}
        />

        {runtimeQuery.isLoading ? (
          <SheetCenteredState loading message="Loading mailboxes…" />
        ) : !provisioned || mailboxes.length === 0 ? (
          <SheetCenteredState
            message={
              provisioned
                ? "No mailboxes found."
                : "Your mailbox is still being set up."
            }
          />
        ) : (
          <SheetSection title="Mailboxes">
            <SheetGroup>
              {mailboxes.map((mailbox, index) => (
                <MailboxRow
                  key={mailbox.id}
                  icon={getMailboxIcon(mailbox) as FeatherName}
                  mailbox={mailbox}
                  isFirst={index === 0}
                  isLast={index === mailboxes.length - 1}
                  isEditing={editingId === mailbox.id}
                  isHidden={hidden.has(mailbox.id)}
                  isBusy={busyId === mailbox.id}
                  editingName={editingName}
                  onEditingNameChange={setEditingName}
                  onMove={(direction) => void handleMove(index, direction)}
                  onToggleHidden={() => void handleToggleHidden(mailbox)}
                  onStartRename={() => {
                    setEditingId(mailbox.id);
                    setEditingName(mailbox.name);
                    setError(null);
                  }}
                  onRename={() => void handleRename(mailbox)}
                  onDelete={() => handleDelete(mailbox)}
                />
              ))}
            </SheetGroup>
          </SheetSection>
        )}
      </SheetScroll>
    </SettingsPage>
  );
}

/** `icon` is a top-level prop so SheetGroup insets the divider under the label. */
function MailboxRow({
  icon,
  mailbox,
  isFirst,
  isLast,
  isEditing,
  isHidden,
  isBusy,
  editingName,
  onEditingNameChange,
  onMove,
  onToggleHidden,
  onStartRename,
  onRename,
  onDelete,
}: {
  icon: FeatherName;
  mailbox: JmapMailbox;
  isFirst: boolean;
  isLast: boolean;
  isEditing: boolean;
  isHidden: boolean;
  isBusy: boolean;
  editingName: string;
  onEditingNameChange: (value: string) => void;
  onMove: (direction: "up" | "down") => void;
  onToggleHidden: () => void;
  onStartRename: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [theme, skin]);
  const displayName = getMailboxDisplayName(mailbox);
  const canEdit = canRenameOrDeleteMailbox(mailbox);
  const canHide = canHideMailbox(mailbox);

  const actions = (
    <View style={styles.actions}>
      <IconButton
        name="chevron-up"
        disabled={isFirst || isBusy}
        onPress={() => onMove("up")}
        label={`Move ${displayName} up`}
      />
      <IconButton
        name="chevron-down"
        disabled={isLast || isBusy}
        onPress={() => onMove("down")}
        label={`Move ${displayName} down`}
      />
      {canHide ? (
        <IconButton
          name={isHidden ? "eye-off" : "eye"}
          disabled={isBusy}
          onPress={onToggleHidden}
          label={isHidden ? `Show ${displayName}` : `Hide ${displayName}`}
        />
      ) : null}
      {canEdit ? (
        isEditing ? (
          <IconButton
            name="check"
            disabled={isBusy}
            onPress={onRename}
            label="Save name"
          />
        ) : (
          <IconButton
            name="edit-2"
            disabled={isBusy}
            onPress={onStartRename}
            label={`Rename ${displayName}`}
          />
        )
      ) : null}
      {canEdit ? (
        <IconButton
          name="trash-2"
          disabled={isBusy}
          onPress={onDelete}
          destructive
          label={`Delete ${displayName}`}
        />
      ) : null}
    </View>
  );

  if (!isEditing) {
    return (
      <SheetItem
        label={displayName}
        detail={`${isHidden ? "Hidden from drawer" : "Visible"}${mailbox.role ? ` · ${mailbox.role}` : ""}`}
        icon={icon}
        trailing={actions}
      />
    );
  }

  return (
    <View style={styles.editRow}>
      <View style={styles.iconSlot}>
        <Feather name={icon} size={MAIL_ICON.sheetAccessory} color={skin.textSecondary} />
      </View>
      <SheetTextField
        value={editingName}
        onChangeText={onEditingNameChange}
        autoFocus
        onSubmitEditing={onRename}
        style={styles.editInput}
        accessibilityLabel={`Rename ${displayName}`}
      />
      {actions}
    </View>
  );
}

function IconButton({
  name,
  onPress,
  disabled,
  label,
  destructive = false,
}: {
  name: FeatherName;
  onPress: () => void;
  disabled?: boolean;
  label: string;
  destructive?: boolean;
}) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [theme, skin]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && styles.iconButtonPressed,
        disabled && styles.iconButtonDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather
        name={name}
        size={16}
        color={destructive ? theme.colors.destructive : skin.textSecondary}
      />
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  return StyleSheet.create({
    actions: {
      flexDirection: "row",
      alignItems: "center",
    },
    editRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 48,
      paddingHorizontal: 16,
      paddingVertical: theme.spacing["2"],
    },
    iconSlot: {
      width: MAIL_ICON.sheet,
      alignItems: "center",
      justifyContent: "center",
    },
    editInput: {
      flex: 1,
      minHeight: 32,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    iconButton: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.borderRadius.full,
    },
    iconButtonPressed: {
      backgroundColor: skin.selected,
    },
    iconButtonDisabled: {
      opacity: 0.35,
    },
  });
}
